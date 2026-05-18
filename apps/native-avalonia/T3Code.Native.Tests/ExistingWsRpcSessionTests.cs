using System.Text.Json;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class ExistingWsRpcSessionTests
{
    [Fact]
    public async Task RequestUsesEffectRpcFrameAndCompletesFromSuccessExit()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));

        var request = session.RequestAsync<SettingsResult>(
            "server.getSettings",
            id: "0"
        );

        using (var document = JsonDocument.Parse(factory.Sockets[0].Sent.Single()))
        {
            var root = document.RootElement;
            Assert.Equal("Request", root.GetProperty("_tag").GetString());
            Assert.Equal("0", root.GetProperty("id").GetString());
            Assert.Equal("server.getSettings", root.GetProperty("tag").GetString());
            Assert.Equal(JsonValueKind.Object, root.GetProperty("payload").ValueKind);
            Assert.True(root.GetProperty("sampled").GetBoolean());
            Assert.Equal(JsonValueKind.Array, root.GetProperty("headers").ValueKind);
        }

        await factory.Sockets[0].PushAsync(
            """
            {"_tag":"Exit","requestId":"0","exit":{"_tag":"Success","value":{"enabled":true}}}
            """
        );

        var result = await WithTimeout(request);
        Assert.NotNull(result);
        Assert.True(result.Enabled);
    }

    [Fact]
    public async Task SubscriptionEmitsChunksAcksAndInterruptsOnDispose()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));

        var received = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var subscription = await session.SubscribeAsync<NamedEvent>(
            "orchestration.subscribeShell",
            null,
            value =>
            {
                received.TrySetResult(value?.Kind ?? "");
                return Task.CompletedTask;
            },
            id: "1"
        );

        await factory.Sockets[0].PushAsync(
            """
            {"_tag":"Chunk","requestId":"1","values":[{"kind":"snapshot"}]}
            """
        );

        Assert.Equal("snapshot", await WithTimeout(received.Task));
        await WaitUntil(() =>
            factory.Sockets[0].Sent.Contains("""{"_tag":"Ack","requestId":"1"}""")
        );

        await subscription.DisposeAsync();

        Assert.Contains(
            factory.Sockets[0].Sent,
            message => message == """{"_tag":"Interrupt","requestId":"1"}"""
        );
    }

    [Fact]
    public async Task FailureExitSurfacesProtocolException()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));

        var request = session.RequestAsync<object>("orchestration.dispatchCommand", id: "2");

        await factory.Sockets[0].PushAsync(
            """
            {
              "_tag": "Exit",
              "requestId": "2",
              "exit": {
                "_tag": "Failure",
                "cause": [
                  {
                    "_tag": "Fail",
                    "error": {
                      "_tag": "OrchestrationDispatchCommandError",
                      "message": "Command failed."
                    }
                  }
                ]
              }
            }
            """
        );

        var error = await Assert.ThrowsAsync<ExistingWsRpcException>(() => request);
        Assert.Equal("OrchestrationDispatchCommandError", error.Code);
        Assert.Equal("Command failed.", error.Message);
    }

    [Fact]
    public async Task PingReceivesPong()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));

        await factory.Sockets[0].PushAsync("""{"_tag":"Ping"}""");

        await WaitUntil(() => factory.Sockets[0].Sent.Contains("""{"_tag":"Pong"}"""));
    }

    private static async Task<T> WithTimeout<T>(Task<T> task)
    {
        var timeout = Task.Delay(TimeSpan.FromSeconds(5));
        var completed = await Task.WhenAny(task, timeout);
        Assert.Same(task, completed);
        return await task;
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

    private sealed record SettingsResult(bool Enabled);

    private sealed record NamedEvent(string Kind);
}
