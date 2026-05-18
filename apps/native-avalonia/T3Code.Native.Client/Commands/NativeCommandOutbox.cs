using System.Text.Json;
using System.Text.Json.Serialization;

namespace T3Code.Native.Client.Commands;

public sealed class NativeCommandOutbox(INativeCommandOutboxStore store)
{
    public async Task<NativeCommandOutboxItem> EnqueueAsync(
        string commandId,
        string method,
        object? payload,
        CancellationToken cancellationToken = default
    )
    {
        var item = new NativeCommandOutboxItem(
            commandId,
            method,
            payload is null
                ? JsonSerializer.SerializeToElement(new { }, NativeCommandOutboxJson.Options)
                : JsonSerializer.SerializeToElement(payload, NativeCommandOutboxJson.Options),
            DateTimeOffset.UtcNow,
            0
        );

        await store.UpsertAsync(item, cancellationToken).ConfigureAwait(false);
        return item;
    }

    public Task<IReadOnlyList<NativeCommandOutboxItem>> LoadPendingAsync(
        CancellationToken cancellationToken = default
    ) => store.LoadAsync(cancellationToken);

    public async Task ReplayAsync(
        Func<NativeCommandOutboxItem, CancellationToken, Task> dispatch,
        CancellationToken cancellationToken = default
    )
    {
        var pending = await store.LoadAsync(cancellationToken).ConfigureAwait(false);
        foreach (var item in pending.OrderBy(item => item.CreatedAt))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var attempted = item with { Attempts = item.Attempts + 1 };
            await store.UpsertAsync(attempted, cancellationToken).ConfigureAwait(false);
            await dispatch(attempted, cancellationToken).ConfigureAwait(false);
        }
    }

    public Task CompleteAsync(string commandId, CancellationToken cancellationToken = default) =>
        store.RemoveAsync(commandId, cancellationToken);
}

public interface INativeCommandOutboxStore
{
    Task<IReadOnlyList<NativeCommandOutboxItem>> LoadAsync(CancellationToken cancellationToken = default);

    Task UpsertAsync(NativeCommandOutboxItem item, CancellationToken cancellationToken = default);

    Task RemoveAsync(string commandId, CancellationToken cancellationToken = default);
}

public sealed record NativeCommandOutboxItem(
    string CommandId,
    string Method,
    JsonElement Payload,
    DateTimeOffset CreatedAt,
    int Attempts
);

public sealed class MemoryNativeCommandOutboxStore : INativeCommandOutboxStore
{
    private readonly Dictionary<string, NativeCommandOutboxItem> _items = [];

    public Task<IReadOnlyList<NativeCommandOutboxItem>> LoadAsync(
        CancellationToken cancellationToken = default
    ) =>
        Task.FromResult<IReadOnlyList<NativeCommandOutboxItem>>(
            _items.Values.OrderBy(item => item.CreatedAt).Select(Clone).ToArray()
        );

    public Task UpsertAsync(
        NativeCommandOutboxItem item,
        CancellationToken cancellationToken = default
    )
    {
        _items[item.CommandId] = Clone(item);
        return Task.CompletedTask;
    }

    public Task RemoveAsync(string commandId, CancellationToken cancellationToken = default)
    {
        _items.Remove(commandId);
        return Task.CompletedTask;
    }

    private static NativeCommandOutboxItem Clone(NativeCommandOutboxItem item) =>
        item with { Payload = item.Payload.Clone() };
}

public sealed class JsonFileNativeCommandOutboxStore(string path) : INativeCommandOutboxStore
{
    public async Task<IReadOnlyList<NativeCommandOutboxItem>> LoadAsync(
        CancellationToken cancellationToken = default
    )
    {
        if (!File.Exists(path))
        {
            return [];
        }

        await using var stream = File.OpenRead(path);
        var items = await JsonSerializer
            .DeserializeAsync<List<NativeCommandOutboxItem>>(
                stream,
                NativeCommandOutboxJson.Options,
                cancellationToken
            )
            .ConfigureAwait(false);

        return (items ?? []).OrderBy(item => item.CreatedAt).Select(Clone).ToArray();
    }

    public async Task UpsertAsync(
        NativeCommandOutboxItem item,
        CancellationToken cancellationToken = default
    )
    {
        var items = (await LoadAsync(cancellationToken).ConfigureAwait(false)).ToList();
        var index = items.FindIndex(existing => existing.CommandId == item.CommandId);
        if (index >= 0)
        {
            items[index] = Clone(item);
        }
        else
        {
            items.Add(Clone(item));
        }

        await SaveAsync(items, cancellationToken).ConfigureAwait(false);
    }

    public async Task RemoveAsync(string commandId, CancellationToken cancellationToken = default)
    {
        var items = (await LoadAsync(cancellationToken).ConfigureAwait(false))
            .Where(item => item.CommandId != commandId)
            .ToArray();
        await SaveAsync(items, cancellationToken).ConfigureAwait(false);
    }

    private async Task SaveAsync(
        IReadOnlyCollection<NativeCommandOutboxItem> items,
        CancellationToken cancellationToken
    )
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var tempPath = $"{path}.tmp";
        await using (var stream = File.Create(tempPath))
        {
            await JsonSerializer
                .SerializeAsync(stream, items, NativeCommandOutboxJson.Options, cancellationToken)
                .ConfigureAwait(false);
        }

        File.Move(tempPath, path, overwrite: true);
    }

    private static NativeCommandOutboxItem Clone(NativeCommandOutboxItem item) =>
        item with { Payload = item.Payload.Clone() };
}

internal static class NativeCommandOutboxJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };
}
