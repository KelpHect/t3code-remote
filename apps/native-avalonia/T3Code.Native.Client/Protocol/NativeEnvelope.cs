using System.Text.Json;
using System.Text.Json.Serialization;

namespace T3Code.Native.Client.Protocol;

public static class NativeProtocol
{
    public const int Version = 1;

    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}

public static class NativeMethods
{
    public const string ServerGetConfig = "server.getConfig";
    public const string ServerGetSettings = "server.getSettings";
    public const string ServerUpdateSettings = "server.updateSettings";
    public const string ServerRefreshProviders = "server.refreshProviders";
    public const string OrchestrationSubscribeShell = "orchestration.subscribeShell";
    public const string OrchestrationSubscribeThread = "orchestration.subscribeThread";
    public const string OrchestrationDispatchCommand = "orchestration.dispatchCommand";
    public const string OrchestrationGetTurnDiff = "orchestration.getTurnDiff";
    public const string OrchestrationGetFullThreadDiff = "orchestration.getFullThreadDiff";
    public const string FilesystemBrowse = "filesystem.browse";
    public const string SourceControlLookupRepository = "sourceControl.lookupRepository";
    public const string SourceControlCloneRepository = "sourceControl.cloneRepository";
    public const string VcsRefreshStatus = "vcs.refreshStatus";
    public const string SubscribeVcsStatus = "subscribeVcsStatus";
    public const string GitRunStackedAction = "git.runStackedAction";
    public const string GitSubscribeActionRuns = "git.subscribeActionRuns";
    public const string TerminalOpen = "terminal.open";
    public const string TerminalWrite = "terminal.write";
    public const string TerminalResize = "terminal.resize";
    public const string TerminalClear = "terminal.clear";
    public const string TerminalRestart = "terminal.restart";
    public const string TerminalClose = "terminal.close";
    public const string SubscribeTerminalEvents = "subscribeTerminalEvents";
}

public sealed record NativeClientEnvelope(
    string Type,
    string Id,
    string? Method = null,
    JsonElement? Params = null
);

public sealed record NativeServerEnvelope(
    string Type,
    string Id,
    JsonElement? Result = null,
    JsonElement? Event = null,
    NativeProtocolError? Error = null
);

public sealed record NativeProtocolError(string Code, string Message, bool Retryable);

public sealed record NativeDescriptor(
    string ServerName,
    string Version,
    int ProtocolVersion,
    string AuthMode,
    bool CleartextHttp
);

public sealed record AuthBootstrapRequest(string Credential);

public sealed record AuthBearerBootstrapResult(
    bool Authenticated,
    string Role,
    string SessionMethod,
    string ExpiresAt,
    string BearerToken
);

public sealed record AuthWebSocketTokenResult(string WsToken, string ExpiresAt);

public static class NativeEnvelopeJson
{
    public static string Request(string id, string method, object? parameters = null) =>
        Serialize("request", id, method, parameters);

    public static string Subscribe(string id, string method, object? parameters = null) =>
        Serialize("subscribe", id, method, parameters);

    public static string Cancel(string id) =>
        JsonSerializer.Serialize(new NativeClientEnvelope("cancel", id), NativeProtocol.JsonOptions);

    public static NativeServerEnvelope ParseServerEnvelope(string json) =>
        JsonSerializer.Deserialize<NativeServerEnvelope>(json, NativeProtocol.JsonOptions)
        ?? throw new NativeProtocolException("empty_envelope", "Server returned an empty envelope.", false);

    public static T? Deserialize<T>(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return default;
        }

        return element.Value.Deserialize<T>(NativeProtocol.JsonOptions);
    }

    private static string Serialize(string type, string id, string method, object? parameters)
    {
        JsonElement? encodedParams = null;
        if (parameters is not null)
        {
            encodedParams = JsonSerializer.SerializeToElement(parameters, NativeProtocol.JsonOptions);
        }

        return JsonSerializer.Serialize(
            new NativeClientEnvelope(type, id, method, encodedParams),
            NativeProtocol.JsonOptions
        );
    }
}

public sealed class NativeProtocolException(string code, string message, bool retryable)
    : Exception(message)
{
    public string Code { get; } = code;

    public bool Retryable { get; } = retryable;
}
