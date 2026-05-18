using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Terminal;

public sealed class NativeTerminalClient(ExistingWsRpcSession session)
{
    public async Task<IAsyncDisposable> SubscribeEventsAsync(
        Func<NativeTerminalEvent, Task> onEvent,
        CancellationToken cancellationToken = default
    ) =>
        await session.SubscribeAsync<JsonElement>(
            NativeMethods.SubscribeTerminalEvents,
            new { },
            element => onEvent(NativeTerminalMapper.MapEvent(element)),
            cancellationToken: cancellationToken
        ).ConfigureAwait(false);

    public async Task<NativeTerminalSnapshot> OpenAsync(
        string threadId,
        string terminalId,
        string cwd,
        int cols = 80,
        int rows = 24,
        CancellationToken cancellationToken = default
    )
    {
        var result = await session
            .RequestAsync<JsonElement>(
                NativeMethods.TerminalOpen,
                new { threadId, terminalId, cwd, cols, rows },
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);
        return NativeTerminalMapper.MapSnapshot(result);
    }

    public Task WriteAsync(
        string threadId,
        string terminalId,
        string data,
        CancellationToken cancellationToken = default
    ) =>
        session.RequestAsync<JsonElement>(
            NativeMethods.TerminalWrite,
            new { threadId, terminalId, data },
            cancellationToken: cancellationToken
        );

    public Task ResizeAsync(
        string threadId,
        string terminalId,
        int cols,
        int rows,
        CancellationToken cancellationToken = default
    ) =>
        session.RequestAsync<JsonElement>(
            NativeMethods.TerminalResize,
            new { threadId, terminalId, cols, rows },
            cancellationToken: cancellationToken
        );

    public Task ClearAsync(
        string threadId,
        string terminalId,
        CancellationToken cancellationToken = default
    ) =>
        session.RequestAsync<JsonElement>(
            NativeMethods.TerminalClear,
            new { threadId, terminalId },
            cancellationToken: cancellationToken
        );

    public Task RestartAsync(
        string threadId,
        string terminalId,
        string cwd,
        int cols = 80,
        int rows = 24,
        CancellationToken cancellationToken = default
    ) =>
        session.RequestAsync<JsonElement>(
            NativeMethods.TerminalRestart,
            new { threadId, terminalId, cwd, cols, rows },
            cancellationToken: cancellationToken
        );

    public Task CloseAsync(
        string threadId,
        string terminalId,
        bool deleteHistory = false,
        CancellationToken cancellationToken = default
    ) =>
        session.RequestAsync<JsonElement>(
            NativeMethods.TerminalClose,
            new { threadId, terminalId, deleteHistory },
            cancellationToken: cancellationToken
        );
}

public sealed record NativeTerminalSnapshot(
    string ThreadId,
    string TerminalId,
    string Cwd,
    string Status,
    string History
);

public sealed record NativeTerminalEvent(
    string ThreadId,
    string TerminalId,
    string Type,
    string Text,
    NativeTerminalSnapshot? Snapshot = null
);

public static class NativeTerminalMapper
{
    public static NativeTerminalSnapshot MapSnapshot(JsonElement snapshot) =>
        new(
            ReadString(snapshot, "threadId") ?? "",
            ReadString(snapshot, "terminalId") ?? "default",
            ReadString(snapshot, "cwd") ?? "",
            ReadString(snapshot, "status") ?? "",
            ReadString(snapshot, "history") ?? ""
        );

    public static NativeTerminalEvent MapEvent(JsonElement element)
    {
        var type = ReadString(element, "type") ?? "event";
        var snapshot = element.TryGetProperty("snapshot", out var snapshotElement)
            && snapshotElement.ValueKind == JsonValueKind.Object
            ? MapSnapshot(snapshotElement)
            : null;
        var text = type switch
        {
            "output" => ReadString(element, "data") ?? "",
            "error" => ReadString(element, "message") ?? "Terminal error.",
            "cleared" => "",
            "started" => "Terminal started.",
            "restarted" => "Terminal restarted.",
            "exited" => "Terminal exited.",
            "activity" => "",
            _ => element.ToString(),
        };

        return new NativeTerminalEvent(
            ReadString(element, "threadId") ?? snapshot?.ThreadId ?? "",
            ReadString(element, "terminalId") ?? snapshot?.TerminalId ?? "default",
            type,
            text,
            snapshot
        );
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }
}
