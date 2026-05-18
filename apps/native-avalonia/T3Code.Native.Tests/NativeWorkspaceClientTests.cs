using System.Text.Json;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Workspace;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeWorkspaceClientTests
{
    [Fact]
    public async Task BrowseMapsLargeDirectoryEntries()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeWorkspaceClient(session, new NativeCommandOutbox(new MemoryNativeCommandOutboxStore()));

        var browse = client.BrowseAsync("/repo");
        var sent = factory.Sockets[0].Sent.Single();
        using var request = JsonDocument.Parse(sent);

        Assert.Equal("filesystem.browse", request.RootElement.GetProperty("tag").GetString());
        Assert.Equal("/repo", request.RootElement.GetProperty("payload").GetProperty("partialPath").GetString());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + request.RootElement.GetProperty("id").GetString()
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"parentPath\":\"/repo\",\"entries\":[{\"name\":\"src\",\"fullPath\":\"/repo/src\"},{\"name\":\"README.md\",\"fullPath\":\"/repo/README.md\"}]}}}"
        );

        var result = await browse;
        Assert.Equal(2, result.Entries.Count);
        Assert.Equal("/repo/src", result.Entries[0].FullPath);
    }

    [Fact]
    public async Task CloneAndCreateProjectUseExistingBackendRpcs()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var store = new MemoryNativeCommandOutboxStore();
        var client = new NativeWorkspaceClient(session, new NativeCommandOutbox(store));

        var clone = client.CloneRepositoryAsync("https://example.test/repo.git", "/work/repo");
        var cloneRequest = JsonDocument.Parse(factory.Sockets[0].Sent.Single());
        var cloneRequestId = cloneRequest.RootElement.GetProperty("id").GetString();
        Assert.Equal("sourceControl.cloneRepository", cloneRequest.RootElement.GetProperty("tag").GetString());
        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + cloneRequestId
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"cwd\":\"/work/repo\",\"remoteUrl\":\"https://example.test/repo.git\",\"repository\":{\"provider\":\"github\",\"nameWithOwner\":\"owner/repo\",\"url\":\"https://example.test/owner/repo\",\"sshUrl\":\"git@example.test:owner/repo.git\"}}}}"
        );

        var cloneResult = await clone;
        Assert.Equal("/work/repo", cloneResult.Cwd);
        Assert.Equal("owner/repo", cloneResult.RepositoryName);

        var create = client.CreateProjectAsync("repo", cloneResult.Cwd, new { instanceId = "codex", model = "gpt-5.5" });
        var createRequest = JsonDocument.Parse(factory.Sockets[0].Sent.Last());
        var commandId = createRequest.RootElement.GetProperty("payload").GetProperty("commandId").GetString();
        Assert.Equal("orchestration.dispatchCommand", createRequest.RootElement.GetProperty("tag").GetString());
        Assert.Equal("project.create", createRequest.RootElement.GetProperty("payload").GetProperty("type").GetString());
        Assert.Single(await store.LoadAsync());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + commandId
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"sequence\":10}}}"
        );

        Assert.False(string.IsNullOrWhiteSpace(await create));
        Assert.Empty(await store.LoadAsync());
    }
}
