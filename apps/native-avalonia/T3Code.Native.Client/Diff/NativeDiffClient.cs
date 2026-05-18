using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Diff;

public sealed class NativeDiffClient(ExistingWsRpcSession session)
{
    public Task<NativeDiffResult> GetTurnDiffAsync(
        string threadId,
        int fromTurnCount,
        int toTurnCount,
        bool ignoreWhitespace = false,
        CancellationToken cancellationToken = default
    ) =>
        RequestDiffAsync(
            NativeMethods.OrchestrationGetTurnDiff,
            new { threadId, fromTurnCount, toTurnCount, ignoreWhitespace },
            cancellationToken
        );

    public Task<NativeDiffResult> GetFullThreadDiffAsync(
        string threadId,
        int toTurnCount,
        bool ignoreWhitespace = false,
        CancellationToken cancellationToken = default
    ) =>
        RequestDiffAsync(
            NativeMethods.OrchestrationGetFullThreadDiff,
            new { threadId, toTurnCount, ignoreWhitespace },
            cancellationToken
        );

    private async Task<NativeDiffResult> RequestDiffAsync(
        string method,
        object payload,
        CancellationToken cancellationToken
    )
    {
        var result = await session
            .RequestAsync<JsonElement>(method, payload, cancellationToken: cancellationToken)
            .ConfigureAwait(false);

        return NativeDiffMapper.Map(result);
    }
}

public sealed record NativeDiffResult(
    string ThreadId,
    int FromTurnCount,
    int ToTurnCount,
    string Diff,
    NativeDiffState State
);

public enum NativeDiffState
{
    Ready,
    Empty,
    Binary,
}

public static class NativeDiffMapper
{
    public static NativeDiffResult Map(JsonElement result)
    {
        var diff = ReadString(result, "diff") ?? "";
        return new NativeDiffResult(
            ReadString(result, "threadId") ?? "",
            ReadInt(result, "fromTurnCount") ?? 0,
            ReadInt(result, "toTurnCount") ?? 0,
            diff,
            ResolveState(diff)
        );
    }

    private static NativeDiffState ResolveState(string diff)
    {
        if (string.IsNullOrWhiteSpace(diff))
        {
            return NativeDiffState.Empty;
        }

        return diff.Contains("Binary files", StringComparison.OrdinalIgnoreCase)
            || diff.Contains("GIT binary patch", StringComparison.OrdinalIgnoreCase)
            ? NativeDiffState.Binary
            : NativeDiffState.Ready;
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
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
