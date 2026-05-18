using System.Text.Json;
using T3Code.Native.Client.Git;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeGitClientTests
{
    [Fact]
    public async Task RefreshStatusRequestsCwdAndMapsSummary()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeGitClient(session);

        var refresh = client.RefreshStatusAsync("/repo");
        var sent = factory.Sockets[0].Sent.Single();
        using var request = JsonDocument.Parse(sent);

        Assert.Equal("vcs.refreshStatus", request.RootElement.GetProperty("tag").GetString());
        Assert.Equal("/repo", request.RootElement.GetProperty("payload").GetProperty("cwd").GetString());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + request.RootElement.GetProperty("id").GetString()
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"isRepo\":true,\"hasPrimaryRemote\":true,\"isDefaultRef\":false,\"refName\":\"main\",\"hasWorkingTreeChanges\":true,\"workingTree\":{\"files\":[{\"path\":\"a.txt\",\"insertions\":2,\"deletions\":1}],\"insertions\":2,\"deletions\":1},\"hasUpstream\":true,\"aheadCount\":1,\"behindCount\":0,\"pr\":null}}}"
        );

        var status = await refresh;

        Assert.True(status.IsRepo);
        Assert.Equal("main", status.RefName);
        Assert.Contains("+2/-1", status.Summary);
    }

    [Fact]
    public async Task RunStackedActionStreamsProgressLines()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeGitClient(session);
        var lines = new List<NativeGitProgressLine>();

        var subscription = await client.RunStackedActionAsync(
            "/repo",
            "commit_push",
            "Ship it",
            line =>
            {
                lines.Add(line);
                return Task.CompletedTask;
            }
        );
        var sent = factory.Sockets[0].Sent.Single();
        using var request = JsonDocument.Parse(sent);
        var requestId = request.RootElement.GetProperty("id").GetString();

        Assert.Equal("git.runStackedAction", request.RootElement.GetProperty("tag").GetString());
        Assert.Equal("commit_push", request.RootElement.GetProperty("payload").GetProperty("action").GetString());
        Assert.Equal("Ship it", request.RootElement.GetProperty("payload").GetProperty("commitMessage").GetString());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Chunk\",\"requestId\":\""
                + requestId
                + "\",\"values\":[{\"kind\":\"hook_output\",\"actionId\":\""
                + requestId
                + "\",\"cwd\":\"/repo\",\"action\":\"commit_push\",\"hookName\":null,\"stream\":\"stdout\",\"text\":\"running hook\"}]}"
        );

        await WaitUntil(() => lines.Count == 1);
        Assert.Equal("running hook", lines.Single().Text);
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
