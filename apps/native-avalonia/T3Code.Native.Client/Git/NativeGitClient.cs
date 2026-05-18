using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Git;

public sealed class NativeGitClient(ExistingWsRpcSession session)
{
    public async Task<NativeGitStatus> RefreshStatusAsync(
        string cwd,
        CancellationToken cancellationToken = default
    )
    {
        var result = await session
            .RequestAsync<JsonElement>(
                NativeMethods.VcsRefreshStatus,
                new { cwd },
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);
        return NativeGitMapper.MapStatus(result);
    }

    public async Task<IAsyncDisposable> RunStackedActionAsync(
        string cwd,
        string action,
        string? commitMessage,
        Func<NativeGitProgressLine, Task> onProgress,
        CancellationToken cancellationToken = default
    )
    {
        var actionId = Guid.NewGuid().ToString("N");
        object payload = string.IsNullOrWhiteSpace(commitMessage)
            ? new { actionId, cwd, action }
            : new { actionId, cwd, action, commitMessage };

        return await session.SubscribeAsync<JsonElement>(
            NativeMethods.GitRunStackedAction,
            payload,
            element => onProgress(NativeGitMapper.MapProgress(element)),
            id: actionId,
            cancellationToken: cancellationToken
        ).ConfigureAwait(false);
    }
}

public sealed record NativeGitStatus(
    bool IsRepo,
    string RefName,
    bool HasWorkingTreeChanges,
    int FileCount,
    int Insertions,
    int Deletions,
    int AheadCount,
    int BehindCount
)
{
    public string Summary =>
        !IsRepo
            ? "Not a git repository."
            : $"{RefName}: {FileCount} file(s), +{Insertions}/-{Deletions}, ahead {AheadCount}, behind {BehindCount}.";
}

public sealed record NativeGitProgressLine(string Kind, string Text);

public static class NativeGitMapper
{
    public static NativeGitStatus MapStatus(JsonElement status)
    {
        var workingTree = status.TryGetProperty("workingTree", out var tree)
            ? tree
            : default;
        var files = workingTree.ValueKind == JsonValueKind.Object
            && workingTree.TryGetProperty("files", out var fileArray)
            && fileArray.ValueKind == JsonValueKind.Array
                ? fileArray.GetArrayLength()
                : 0;

        return new NativeGitStatus(
            ReadBool(status, "isRepo") ?? false,
            ReadString(status, "refName") ?? "detached",
            ReadBool(status, "hasWorkingTreeChanges") ?? false,
            files,
            ReadInt(workingTree, "insertions") ?? 0,
            ReadInt(workingTree, "deletions") ?? 0,
            ReadInt(status, "aheadCount") ?? 0,
            ReadInt(status, "behindCount") ?? 0
        );
    }

    public static NativeGitProgressLine MapProgress(JsonElement progress)
    {
        var kind = ReadString(progress, "kind") ?? "progress";
        var text = kind switch
        {
            "action_started" => $"Started {ReadString(progress, "action") ?? "git action"}.",
            "phase_started" => ReadString(progress, "label") ?? $"Started {ReadString(progress, "phase")}.",
            "hook_started" => $"Hook started: {ReadString(progress, "hookName")}.",
            "hook_output" => ReadString(progress, "text") ?? "",
            "hook_finished" => $"Hook finished: {ReadString(progress, "hookName")}.",
            "action_failed" => ReadString(progress, "message") ?? "Git action failed.",
            "action_finished" => ReadFinished(progress),
            _ => progress.ToString(),
        };
        return new NativeGitProgressLine(kind, text);
    }

    private static string ReadFinished(JsonElement progress)
    {
        if (
            progress.TryGetProperty("result", out var result)
            && result.TryGetProperty("toast", out var toast)
        )
        {
            return ReadString(toast, "title") ?? "Git action finished.";
        }

        return "Git action finished.";
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }

    private static bool? ReadBool(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.True
            ? true
            : property.ValueKind == JsonValueKind.False
                ? false
                : null;
    }

    private static int? ReadInt(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var value)
            ? value
            : null;
    }
}
