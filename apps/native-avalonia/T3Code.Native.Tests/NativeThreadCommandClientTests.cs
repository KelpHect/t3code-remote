using System.Text.Json;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Thread;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeThreadCommandClientTests
{
    [Fact]
    public async Task SendTurnUsesClientGeneratedCommandIdAndCompletesOutbox()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var store = new MemoryNativeCommandOutboxStore();
        var client = new NativeThreadCommandClient(session, new NativeCommandOutbox(store));

        var send = client.SendTurnAsync(
            "thread-1",
            "Implement this",
            new { instanceId = "codex", model = "gpt-5.5" },
            "full-access",
            "default"
        );
        var sent = factory.Sockets[0].Sent.Single();
        using var document = JsonDocument.Parse(sent);
        var payload = document.RootElement.GetProperty("payload");
        var commandId = payload.GetProperty("commandId").GetString();

        Assert.Equal("orchestration.dispatchCommand", document.RootElement.GetProperty("tag").GetString());
        Assert.Equal(commandId, document.RootElement.GetProperty("id").GetString());
        Assert.Equal("thread.turn.start", payload.GetProperty("type").GetString());
        Assert.Equal("Implement this", payload.GetProperty("message").GetProperty("text").GetString());
        Assert.Equal("full-access", payload.GetProperty("runtimeMode").GetString());

        Assert.Single(await store.LoadAsync());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + commandId
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"sequence\":42}}}"
        );
        var returnedCommandId = await send;

        Assert.Equal(commandId, returnedCommandId);
        Assert.Empty(await store.LoadAsync());
    }

    [Fact]
    public async Task FailedDispatchLeavesSameCommandInOutboxForRetry()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var store = new MemoryNativeCommandOutboxStore();
        var client = new NativeThreadCommandClient(session, new NativeCommandOutbox(store));

        var stop = client.InterruptTurnAsync("thread-1");
        var sent = factory.Sockets[0].Sent.Single();
        using var document = JsonDocument.Parse(sent);
        var commandId = document.RootElement.GetProperty("payload").GetProperty("commandId").GetString();

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + commandId
                + "\",\"exit\":{\"_tag\":\"Failure\",\"cause\":[{\"_tag\":\"Fail\",\"error\":{\"_tag\":\"OrchestrationDispatchCommandError\",\"message\":\"failed\"}}]}}"
        );

        await Assert.ThrowsAsync<ExistingWsRpcException>(() => stop);
        var pending = await store.LoadAsync();
        Assert.Single(pending);
        Assert.Equal(commandId, pending[0].CommandId);
        Assert.Equal("thread.turn.interrupt", pending[0].Payload.GetProperty("type").GetString());
    }
}
