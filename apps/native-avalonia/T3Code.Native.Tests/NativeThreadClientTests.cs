using System.Text.Json;
using T3Code.Native.Client.Thread;

namespace T3Code.Native.Tests;

public sealed class NativeThreadClientTests
{
    [Fact]
    public void MapsSnapshotMessagesAndActionActivities()
    {
        var update = NativeThreadMapper.MapThreadUpdate(Parse(
            """
            {
              "kind": "snapshot",
              "snapshot": {
                "snapshotSequence": 10,
                "thread": {
                  "id": "thread-1",
                  "projectId": "project-1",
                  "title": "Investigate bug",
                  "modelSelection": {"provider": "openai", "model": "gpt-5.5"},
                  "runtimeMode": "default",
                  "interactionMode": "default",
                  "branch": null,
                  "worktreePath": null,
                  "latestTurn": null,
                  "createdAt": "2026-05-18T00:00:00.000Z",
                  "updatedAt": "2026-05-18T00:01:00.000Z",
                  "archivedAt": null,
                  "deletedAt": null,
                  "session": {"threadId":"thread-1","status":"running","providerName":"Codex","activeTurnId":null,"lastError":null,"updatedAt":"2026-05-18T00:01:00.000Z"},
                  "messages": [
                    {"id":"m-user","role":"user","text":"Find the bug","turnId":null,"streaming":false,"createdAt":"2026-05-18T00:00:00.000Z","updatedAt":"2026-05-18T00:00:00.000Z"},
                    {"id":"m-assistant","role":"assistant","text":"I found it","turnId":"turn-1","streaming":true,"createdAt":"2026-05-18T00:00:10.000Z","updatedAt":"2026-05-18T00:00:11.000Z"}
                  ],
                  "proposedPlans": [],
                  "activities": [
                    {"id":"a-approval","tone":"approval","kind":"approval-required","summary":"Approve command","payload":{},"turnId":"turn-1","createdAt":"2026-05-18T00:00:12.000Z"}
                  ],
                  "checkpoints": []
                }
              }
            }
            """
        ));

        var snapshot = update.Snapshot;

        Assert.NotNull(snapshot);
        Assert.Equal("Investigate bug", snapshot.Title);
        Assert.Equal("running", snapshot.SessionStatus);
        Assert.Equal(3, snapshot.Entries.Count);
        Assert.Equal("action", snapshot.Entries.Single(entry => entry.Id == "a-approval").Tone);
        Assert.True(snapshot.Entries.Single(entry => entry.Id == "m-assistant").Streaming);
    }

    [Fact]
    public void StateIgnoresStaleEventsAndDeduplicatesMessages()
    {
        var state = new NativeThreadState();
        Assert.True(state.Apply(new NativeThreadUpdate(
            Snapshot: new NativeThreadSnapshot(
                10,
                "thread-1",
                "Thread",
                "running",
                [new NativeThreadEntry("message-1", NativeThreadEntryKind.Message, "user", "First", "user", false, DateTimeOffset.Parse("2026-05-18T00:00:00Z"))]
            )
        )));

        Assert.False(state.Apply(new NativeThreadUpdate(
            Entry: new NativeThreadEntry("message-2", NativeThreadEntryKind.Message, "assistant", "Stale", "assistant", false, DateTimeOffset.Parse("2026-05-18T00:00:01Z")),
            Sequence: 9
        )));
        Assert.True(state.Apply(new NativeThreadUpdate(
            Entry: new NativeThreadEntry("message-1", NativeThreadEntryKind.Message, "user", "Updated", "user", false, DateTimeOffset.Parse("2026-05-18T00:00:00Z")),
            Sequence: 11
        )));

        Assert.Single(state.Entries);
        Assert.Equal("Updated", state.Entries[0].Text);
    }

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
