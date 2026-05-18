using System.Text.Json;
using T3Code.Native.Client.Terminal;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeTerminalClientTests
{
    [Fact]
    public async Task OpenAndWriteUseExistingTerminalRpcs()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeTerminalClient(session);

        var open = client.OpenAsync("thread-1", "default", "/repo");
        var openRequest = JsonDocument.Parse(factory.Sockets[0].Sent.Single());
        var openRequestId = openRequest.RootElement.GetProperty("id").GetString();

        Assert.Equal("terminal.open", openRequest.RootElement.GetProperty("tag").GetString());
        Assert.Equal("/repo", openRequest.RootElement.GetProperty("payload").GetProperty("cwd").GetString());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + openRequestId
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"threadId\":\"thread-1\",\"terminalId\":\"default\",\"cwd\":\"/repo\",\"worktreePath\":null,\"status\":\"running\",\"pid\":123,\"history\":\"hello\\n\",\"exitCode\":null,\"exitSignal\":null,\"updatedAt\":\"2026-05-18T00:00:00Z\"}}}"
        );

        var snapshot = await open;
        Assert.Equal("running", snapshot.Status);
        Assert.Equal("hello\n", snapshot.History);

        var write = client.WriteAsync("thread-1", "default", "pwd\n");
        var writeRequest = JsonDocument.Parse(factory.Sockets[0].Sent.Last());
        Assert.Equal("terminal.write", writeRequest.RootElement.GetProperty("tag").GetString());
        Assert.Equal("pwd\n", writeRequest.RootElement.GetProperty("payload").GetProperty("data").GetString());
        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + writeRequest.RootElement.GetProperty("id").GetString()
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":null}}"
        );
        await write;
    }

    [Fact]
    public async Task SubscriptionMapsOutputEvents()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeTerminalClient(session);
        var events = new List<NativeTerminalEvent>();

        var subscription = await client.SubscribeEventsAsync(eventItem =>
        {
            events.Add(eventItem);
            return Task.CompletedTask;
        });
        var requestId = JsonDocument.Parse(factory.Sockets[0].Sent.Single()).RootElement.GetProperty("id").GetString();

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Chunk\",\"requestId\":\""
                + requestId
                + "\",\"values\":[{\"threadId\":\"thread-1\",\"terminalId\":\"default\",\"createdAt\":\"2026-05-18T00:00:00Z\",\"type\":\"output\",\"data\":\"line\\n\"}]}"
        );

        await WaitUntil(() => events.Count == 1);
        Assert.Equal("output", events[0].Type);
        Assert.Equal("line\n", events[0].Text);
        await subscription.DisposeAsync();
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(5);
        while (DateTimeOffset.UtcNow < deadline)
        {
            if (condition())
            {
                return;
            }

            await Task.Delay(10);
        }

        Assert.True(condition());
    }
}
