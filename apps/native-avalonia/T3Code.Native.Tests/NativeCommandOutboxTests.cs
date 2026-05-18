using T3Code.Native.Client.Commands;

namespace T3Code.Native.Tests;

public sealed class NativeCommandOutboxTests
{
    [Fact]
    public async Task JsonFileStoreSurvivesRestartAndReplaysPendingCommands()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"t3-native-outbox-{Guid.NewGuid():N}");
        var path = Path.Combine(directory, "outbox.json");
        try
        {
            var firstRun = new NativeCommandOutbox(new JsonFileNativeCommandOutboxStore(path));
            await firstRun.EnqueueAsync(
                "command-1",
                "orchestration.dispatchCommand",
                new { commandId = "command-1", prompt = "continue" }
            );

            var afterRestart = new NativeCommandOutbox(new JsonFileNativeCommandOutboxStore(path));
            var pending = await afterRestart.LoadPendingAsync();

            Assert.Single(pending);
            Assert.Equal("command-1", pending[0].CommandId);
            Assert.Equal("continue", pending[0].Payload.GetProperty("prompt").GetString());

            var replayed = new List<NativeCommandOutboxItem>();
            await afterRestart.ReplayAsync(
                (item, _) =>
                {
                    replayed.Add(item);
                    return Task.CompletedTask;
                }
            );

            Assert.Single(replayed);
            Assert.Equal(1, replayed[0].Attempts);

            await afterRestart.CompleteAsync("command-1");

            var finalRun = new NativeCommandOutbox(new JsonFileNativeCommandOutboxStore(path));
            Assert.Empty(await finalRun.LoadPendingAsync());
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    [Fact]
    public async Task MemoryStoreUpsertsByCommandId()
    {
        var store = new MemoryNativeCommandOutboxStore();
        var outbox = new NativeCommandOutbox(store);

        await outbox.EnqueueAsync("same-command", "first", new { value = 1 });
        await store.UpsertAsync(
            new NativeCommandOutboxItem(
                "same-command",
                "second",
                System.Text.Json.JsonSerializer.SerializeToElement(new { value = 2 }),
                DateTimeOffset.UtcNow,
                3
            )
        );

        var pending = await outbox.LoadPendingAsync();

        Assert.Single(pending);
        Assert.Equal("second", pending[0].Method);
        Assert.Equal(2, pending[0].Payload.GetProperty("value").GetInt32());
        Assert.Equal(3, pending[0].Attempts);
    }
}
