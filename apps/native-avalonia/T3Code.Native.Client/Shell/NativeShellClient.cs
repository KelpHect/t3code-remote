using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Shell;

public sealed class NativeShellClient(ExistingWsRpcSession session)
{
    public async Task<IAsyncDisposable> SubscribeShellAsync(
        Func<NativeShellUpdate, Task> onUpdate,
        CancellationToken cancellationToken = default
    ) =>
        await session.SubscribeAsync<JsonElement>(
            NativeMethods.OrchestrationSubscribeShell,
            new { },
            element =>
            {
                return onUpdate(NativeShellMapper.MapShellUpdate(element));
            },
            cancellationToken: cancellationToken
        ).ConfigureAwait(false);
}

public sealed record NativeShellUpdate(
    NativeShellSnapshot? Snapshot = null,
    NativeProjectShell? Project = null,
    string? RemovedProjectId = null,
    NativeThreadShell? Thread = null,
    string? RemovedThreadId = null,
    long? Sequence = null
);

public sealed record NativeShellSnapshot(
    long Sequence,
    IReadOnlyList<NativeProjectShell> Projects,
    IReadOnlyList<NativeThreadShell> Threads
);

public sealed record NativeProjectShell(
    string Id,
    string Title,
    string? WorkspaceRoot,
    long? Sequence
);

public sealed record NativeThreadShell(
    string Id,
    string ProjectId,
    string Title,
    string Detail,
    long? Sequence
);

public static class NativeShellMapper
{
    public static NativeShellUpdate MapShellUpdate(JsonElement element)
    {
        var kind = ReadString(element, "kind") ?? "";
        return kind switch
        {
            "snapshot" => new NativeShellUpdate(Snapshot: MapSnapshot(element.GetProperty("snapshot"))),
            "project-upserted" => new NativeShellUpdate(
                Project: MapProject(element.GetProperty("project"), ReadOptionalInt64(element, "sequence")),
                Sequence: ReadOptionalInt64(element, "sequence")
            ),
            "project-removed" => new NativeShellUpdate(
                RemovedProjectId: ReadString(element, "projectId"),
                Sequence: ReadOptionalInt64(element, "sequence")
            ),
            "thread-upserted" => new NativeShellUpdate(
                Thread: MapThread(element.GetProperty("thread"), ReadOptionalInt64(element, "sequence")),
                Sequence: ReadOptionalInt64(element, "sequence")
            ),
            "thread-removed" => new NativeShellUpdate(
                RemovedThreadId: ReadString(element, "threadId"),
                Sequence: ReadOptionalInt64(element, "sequence")
            ),
            _ => new NativeShellUpdate(Sequence: ReadOptionalInt64(element, "sequence")),
        };
    }

    private static NativeShellSnapshot MapSnapshot(JsonElement snapshot)
    {
        var sequence = ReadOptionalInt64(snapshot, "snapshotSequence") ?? 0;
        var projects = new List<NativeProjectShell>();
        var threads = new List<NativeThreadShell>();

        if (snapshot.TryGetProperty("projects", out var projectElements))
        {
            foreach (var project in projectElements.EnumerateArray())
            {
                projects.Add(MapProject(project, sequence));
            }
        }

        if (snapshot.TryGetProperty("threads", out var threadElements))
        {
            foreach (var thread in threadElements.EnumerateArray())
            {
                threads.Add(MapThread(thread, sequence));
            }
        }

        return new NativeShellSnapshot(sequence, projects, threads);
    }

    private static NativeProjectShell MapProject(JsonElement project, long? sequence) =>
        new(
            ReadString(project, "id") ?? "",
            ReadString(project, "title") ?? "Untitled project",
            ReadString(project, "workspaceRoot"),
            sequence
        );

    private static NativeThreadShell MapThread(JsonElement thread, long? sequence)
    {
        var title = ReadString(thread, "title") ?? "Untitled thread";
        var updatedAt = ReadString(thread, "updatedAt");
        var status = ReadString(thread, "status");
        var detail = status is { Length: > 0 } && updatedAt is { Length: > 0 }
            ? $"{status} - {updatedAt}"
            : updatedAt ?? status ?? "";

        return new NativeThreadShell(
            ReadString(thread, "id") ?? "",
            ReadString(thread, "projectId") ?? "",
            title,
            detail,
            sequence
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

    private static long? ReadOptionalInt64(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.Number && property.TryGetInt64(out var value)
            ? value
            : null;
    }
}
