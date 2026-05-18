using System.Text.Json;
using T3Code.Native.Client.Shell;

namespace T3Code.Native.Tests;

public sealed class NativeShellClientTests
{
    [Fact]
    public void MapsShellSnapshotIntoAppOwnedDtos()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "kind": "snapshot",
              "snapshot": {
                "snapshotSequence": 42,
                "projects": [
                  {
                    "id": "project-1",
                    "title": "Fixture Project",
                    "workspaceRoot": "/home/example/Projects/fixture"
                  }
                ],
                "threads": [
                  {
                    "id": "thread-1",
                    "projectId": "project-1",
                    "title": "Fixture Thread",
                    "status": "active",
                    "updatedAt": "2026-05-18T00:00:00.000Z"
                  }
                ]
              }
            }
            """
        );

        var update = NativeShellMapper.MapShellUpdate(document.RootElement);

        Assert.NotNull(update.Snapshot);
        Assert.Equal(42, update.Snapshot.Sequence);
        var project = Assert.Single(update.Snapshot.Projects);
        Assert.Equal("project-1", project.Id);
        Assert.Equal("Fixture Project", project.Title);
        Assert.Equal("/home/example/Projects/fixture", project.WorkspaceRoot);
        var thread = Assert.Single(update.Snapshot.Threads);
        Assert.Equal("thread-1", thread.Id);
        Assert.Equal("project-1", thread.ProjectId);
        Assert.Equal("Fixture Thread", thread.Title);
        Assert.Contains("active", thread.Detail);
    }

    [Fact]
    public void MapsIncrementalThreadRemoval()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "kind": "thread-removed",
              "sequence": 43,
              "threadId": "thread-1"
            }
            """
        );

        var update = NativeShellMapper.MapShellUpdate(document.RootElement);

        Assert.Equal(43, update.Sequence);
        Assert.Equal("thread-1", update.RemovedThreadId);
    }
}
