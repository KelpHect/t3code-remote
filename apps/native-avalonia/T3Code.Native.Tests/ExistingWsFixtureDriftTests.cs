using System.Text.Json;
using T3Code.Native.Client.Shell;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class ExistingWsFixtureDriftTests
{
    [Fact]
    public void FixtureContainsRequiredMethodCoverageAndNoSecrets()
    {
        using var document = LoadFixture();
        var raw = document.RootElement.GetRawText();

        Assert.DoesNotContain("/home/kellhect", raw);
        Assert.DoesNotContain("eyJ", raw);
        Assert.Contains("<ws-token>", raw);
        Assert.Contains("<bearer-session-token>", raw);

        var names = document.RootElement.GetProperty("frames")
            .EnumerateArray()
            .Select(frame => frame.GetProperty("name").GetString())
            .ToHashSet();

        foreach (
            var expected in new[]
            {
                "server.getSettings.success",
                "orchestration.subscribeShell.snapshot-and-cancel",
                "orchestration.subscribeThread.not-found-error",
                "orchestration.dispatchCommand.invariant-error",
                "orchestration.getTurnDiff.not-found-error",
                "orchestration.getFullThreadDiff.not-found-error",
                "filesystem.browse.success",
                "sourceControl.lookupRepository.error",
                "sourceControl.cloneRepository.error",
                "vcs.refreshStatus.not-repo-success",
                "git.runStackedAction.error",
                "terminal.events-open-close",
            }
        )
        {
            Assert.Contains(expected, names);
        }
    }

    [Fact]
    public async Task ReplaysUnarySuccessFixtureThroughExistingWsTransport()
    {
        using var document = LoadFixture();
        var frame = FindFrame(document, "server.getSettings.success");
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=fixture"));

        var request = session.RequestAsync<JsonElement>("server.getSettings", id: "0");
        await factory.Sockets[0].PushAsync(frame.GetProperty("server").GetRawText());

        var result = await WithTimeout(request);
        Assert.Equal(
            30000,
            result.GetProperty("automaticGitFetchInterval").GetInt32()
        );
    }

    [Fact]
    public async Task ReplaysShellSubscriptionFixtureThroughNativeMapper()
    {
        using var document = LoadFixture();
        var frame = FindFrame(document, "orchestration.subscribeShell.snapshot-and-cancel");
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=fixture"));
        var shell = new NativeShellClient(session);
        var received = new TaskCompletionSource<NativeShellUpdate>(
            TaskCreationOptions.RunContinuationsAsynchronously
        );

        await using var subscription = await shell.SubscribeShellAsync(update =>
        {
            received.TrySetResult(update);
            return Task.CompletedTask;
        });

        await factory.Sockets[0].PushAsync(frame.GetProperty("serverChunk").GetRawText());

        var update = await WithTimeout(received.Task);
        Assert.NotNull(update.Snapshot);
        Assert.Single(update.Snapshot.Projects);
        Assert.Single(update.Snapshot.Threads);
        await WaitUntil(() =>
            factory.Sockets[0].Sent.Any(message => message.Contains("\"_tag\":\"Ack\""))
        );
    }

    [Fact]
    public async Task ReplaysFailureFixtureThroughExistingWsTransport()
    {
        using var document = LoadFixture();
        var frame = FindFrame(document, "orchestration.dispatchCommand.invariant-error");
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=fixture"));

        var request = session.RequestAsync<JsonElement>("orchestration.dispatchCommand", id: "3");
        await factory.Sockets[0].PushAsync(frame.GetProperty("server").GetRawText());

        var error = await Assert.ThrowsAsync<ExistingWsRpcException>(() => request);
        Assert.Equal("OrchestrationDispatchCommandError", error.Code);
        Assert.Contains("thread.session.stop", error.Message);
    }

    private static JsonDocument LoadFixture() =>
        JsonDocument.Parse(
            File.ReadAllText(
                Path.Combine(
                    AppContext.BaseDirectory,
                    "Fixtures",
                    "ExistingWs",
                    "effect-rpc-json-v1.json"
                )
            )
        );

    private static JsonElement FindFrame(JsonDocument document, string name)
    {
        foreach (var frame in document.RootElement.GetProperty("frames").EnumerateArray())
        {
            if (frame.GetProperty("name").GetString() == name)
            {
                return frame;
            }
        }

        throw new InvalidOperationException($"Fixture frame '{name}' was not found.");
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
}
