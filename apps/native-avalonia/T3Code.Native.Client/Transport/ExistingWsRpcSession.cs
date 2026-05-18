using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace T3Code.Native.Client.Transport;

public sealed class ExistingWsRpcSession(INativeWebSocketFactory socketFactory) : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly ConcurrentDictionary<string, Operation> _operations = [];
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private CancellationTokenSource? _receiveCancellation;
    private Task? _receiveTask;
    private INativeWebSocket? _socket;
    private Uri? _uri;
    private long _nextRequestId;

    public async Task ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        _uri = uri;
        await ReplaceSocketAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task ReconnectAsync(CancellationToken cancellationToken = default)
    {
        if (_uri is null)
        {
            throw new InvalidOperationException("Connect before reconnecting.");
        }

        await ReplaceSocketAsync(cancellationToken).ConfigureAwait(false);
        foreach (var operation in _operations.Values)
        {
            if (operation.Replayable)
            {
                await SendAsync(operation.Message, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public async Task ReconnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        _uri = uri;
        await ReconnectAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task<T?> RequestAsync<T>(
        string method,
        object? payload = null,
        string? id = null,
        CancellationToken cancellationToken = default
    )
    {
        var operationId = id ?? NextRequestId();
        var message = ExistingWsRpcFrames.Request(operationId, method, payload);
        var pending = new TaskCompletionSource<JsonElement?>(
            TaskCreationOptions.RunContinuationsAsynchronously
        );
        var operation = Operation.Request(operationId, message, pending);

        if (!_operations.TryAdd(operationId, operation))
        {
            throw new InvalidOperationException($"Operation {operationId} is already active.");
        }

        await SendAsync(message, cancellationToken).ConfigureAwait(false);

        using var registration = cancellationToken.Register(
            static state =>
            {
                var (session, requestId) = ((ExistingWsRpcSession Session, string RequestId))state!;
                _ = session.InterruptAsync(requestId);
            },
            (this, operationId)
        );

        var result = await pending.Task.ConfigureAwait(false);
        return Deserialize<T>(result);
    }

    public async Task<ExistingWsSubscription<T>> SubscribeAsync<T>(
        string method,
        object? payload,
        Func<T?, Task> onEvent,
        string? id = null,
        CancellationToken cancellationToken = default
    )
    {
        var operationId = id ?? NextRequestId();
        var message = ExistingWsRpcFrames.Request(operationId, method, payload);
        var operation = Operation.Subscription(
            operationId,
            message,
            async element => await onEvent(Deserialize<T>(element)).ConfigureAwait(false)
        );

        if (!_operations.TryAdd(operationId, operation))
        {
            throw new InvalidOperationException($"Operation {operationId} is already active.");
        }

        await SendAsync(message, cancellationToken).ConfigureAwait(false);
        return new ExistingWsSubscription<T>(operationId, () => InterruptAsync(operationId));
    }

    public async ValueTask DisposeAsync()
    {
        _receiveCancellation?.Cancel();
        if (_receiveTask is not null)
        {
            try
            {
                await _receiveTask.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
            }
        }

        if (_socket is not null)
        {
            await _socket.DisposeAsync().ConfigureAwait(false);
        }

        _receiveCancellation?.Dispose();
        _sendLock.Dispose();
    }

    private string NextRequestId() => Interlocked.Increment(ref _nextRequestId).ToString();

    private async Task ReplaceSocketAsync(CancellationToken cancellationToken)
    {
        _receiveCancellation?.Cancel();
        if (_socket is not null)
        {
            await _socket.DisposeAsync().ConfigureAwait(false);
        }

        _receiveCancellation?.Dispose();
        _receiveCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _socket = await socketFactory.ConnectAsync(_uri!, cancellationToken).ConfigureAwait(false);
        _receiveTask = Task.Run(
            () => ReceiveLoopAsync(_receiveCancellation.Token),
            _receiveCancellation.Token
        );
    }

    private async Task SendAsync(string message, CancellationToken cancellationToken)
    {
        var socket = _socket ?? throw new InvalidOperationException("Connect before sending.");
        await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await socket.SendAsync(message, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task InterruptAsync(string requestId)
    {
        if (!_operations.TryRemove(requestId, out var operation))
        {
            return;
        }

        operation.Cancel();
        if (_socket is not null)
        {
            await SendAsync(ExistingWsRpcFrames.Interrupt(requestId), CancellationToken.None)
                .ConfigureAwait(false);
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var socket = _socket;
            if (socket is null)
            {
                return;
            }

            var message = await socket.ReceiveAsync(cancellationToken).ConfigureAwait(false);
            if (message is null)
            {
                return;
            }

            await HandleMessageAsync(message, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task HandleMessageAsync(string message, CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(message);
        if (document.RootElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in document.RootElement.EnumerateArray())
            {
                await HandleFrameAsync(item, cancellationToken).ConfigureAwait(false);
            }

            return;
        }

        await HandleFrameAsync(document.RootElement, cancellationToken).ConfigureAwait(false);
    }

    private async Task HandleFrameAsync(JsonElement frame, CancellationToken cancellationToken)
    {
        var tag = GetRequiredString(frame, "_tag");
        switch (tag)
        {
            case "Ping":
                await SendAsync(ExistingWsRpcFrames.Pong(), cancellationToken).ConfigureAwait(false);
                return;
            case "Chunk":
                await HandleChunkAsync(frame, cancellationToken).ConfigureAwait(false);
                return;
            case "Exit":
                HandleExit(frame);
                return;
        }
    }

    private async Task HandleChunkAsync(JsonElement frame, CancellationToken cancellationToken)
    {
        var requestId = GetRequiredString(frame, "requestId");
        if (!_operations.TryGetValue(requestId, out var operation))
        {
            return;
        }

        if (frame.TryGetProperty("values", out var values) && values.ValueKind == JsonValueKind.Array)
        {
            foreach (var value in values.EnumerateArray())
            {
                await operation.EmitAsync(value.Clone()).ConfigureAwait(false);
            }
        }

        await SendAsync(ExistingWsRpcFrames.Ack(requestId), cancellationToken).ConfigureAwait(false);
    }

    private void HandleExit(JsonElement frame)
    {
        var requestId = GetRequiredString(frame, "requestId");
        if (!_operations.TryRemove(requestId, out var operation))
        {
            return;
        }

        if (!frame.TryGetProperty("exit", out var exit))
        {
            operation.Fail(new ExistingWsRpcException("missing_exit", "RPC exit frame is missing exit."));
            return;
        }

        var exitTag = GetRequiredString(exit, "_tag");
        if (exitTag == "Success")
        {
            operation.Resolve(exit.TryGetProperty("value", out var value) ? value.Clone() : null);
            return;
        }

        operation.Fail(ExistingWsRpcException.FromFailureExit(exit));
    }

    private static T? Deserialize<T>(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return default;
        }

        return element.Value.Deserialize<T>(JsonOptions);
    }

    private static string GetRequiredString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
        {
            throw new ExistingWsRpcException("invalid_frame", $"RPC frame is missing string '{propertyName}'.");
        }

        return property.GetString()!;
    }

    private sealed class Operation
    {
        private readonly TaskCompletionSource<JsonElement?>? _completion;
        private readonly Func<JsonElement?, Task>? _onEvent;

        private Operation(
            string id,
            string message,
            bool replayable,
            TaskCompletionSource<JsonElement?>? completion,
            Func<JsonElement?, Task>? onEvent
        )
        {
            Id = id;
            Message = message;
            Replayable = replayable;
            _completion = completion;
            _onEvent = onEvent;
        }

        public string Id { get; }

        public string Message { get; }

        public bool Replayable { get; private set; }

        public static Operation Request(
            string id,
            string message,
            TaskCompletionSource<JsonElement?> completion
        ) => new(id, message, true, completion, null);

        public static Operation Subscription(
            string id,
            string message,
            Func<JsonElement?, Task> onEvent
        ) => new(id, message, true, null, onEvent);

        public void Resolve(JsonElement? result) => _completion?.TrySetResult(result);

        public void Fail(Exception exception) => _completion?.TrySetException(exception);

        public void Cancel()
        {
            Replayable = false;
            _completion?.TrySetCanceled();
        }

        public Task EmitAsync(JsonElement? value) => _onEvent?.Invoke(value) ?? Task.CompletedTask;
    }
}

public sealed class ExistingWsSubscription<T>(string id, Func<Task> interrupt) : IAsyncDisposable
{
    public string Id { get; } = id;

    public async ValueTask DisposeAsync() => await interrupt().ConfigureAwait(false);
}

public sealed class ExistingWsRpcException(string code, string message, JsonElement? failure = null)
    : Exception(message)
{
    public string Code { get; } = code;

    public JsonElement? Failure { get; } = failure;

    public static ExistingWsRpcException FromFailureExit(JsonElement exit)
    {
        var code = "rpc_failure";
        var message = "Existing /ws RPC request failed.";

        if (exit.TryGetProperty("cause", out var cause) && cause.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in cause.EnumerateArray())
            {
                if (
                    item.TryGetProperty("error", out var error)
                    && error.ValueKind == JsonValueKind.Object
                )
                {
                    if (error.TryGetProperty("_tag", out var tag) && tag.ValueKind == JsonValueKind.String)
                    {
                        code = tag.GetString() ?? code;
                    }

                    if (
                        error.TryGetProperty("message", out var errorMessage)
                        && errorMessage.ValueKind == JsonValueKind.String
                    )
                    {
                        message = errorMessage.GetString() ?? message;
                    }
                    else if (
                        error.TryGetProperty("detail", out var detail)
                        && detail.ValueKind == JsonValueKind.String
                    )
                    {
                        message = detail.GetString() ?? message;
                    }

                    break;
                }

                if (
                    item.TryGetProperty("defect", out var defect)
                    && defect.ValueKind == JsonValueKind.String
                )
                {
                    code = "defect";
                    message = defect.GetString() ?? message;
                    break;
                }
            }
        }

        return new ExistingWsRpcException(code, message, exit.Clone());
    }
}

public static class ExistingWsRpcFrames
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Request(string id, string tag, object? payload = null) =>
        JsonSerializer.Serialize(
            new ExistingWsRequestFrame(
                "Request",
                id,
                tag,
                payload is null ? JsonSerializer.SerializeToElement(new { }, JsonOptions) : JsonSerializer.SerializeToElement(payload, JsonOptions),
                TraceId: RandomHex(16),
                SpanId: RandomHex(8),
                Sampled: true,
                Headers: []
            ),
            JsonOptions
        );

    public static string Ack(string requestId) =>
        JsonSerializer.Serialize(new ExistingWsRequestControlFrame("Ack", requestId), JsonOptions);

    public static string Interrupt(string requestId) =>
        JsonSerializer.Serialize(new ExistingWsRequestControlFrame("Interrupt", requestId), JsonOptions);

    public static string Pong() => """{"_tag":"Pong"}""";

    private static string RandomHex(int byteCount)
    {
        Span<byte> bytes = stackalloc byte[byteCount];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed record ExistingWsRequestFrame(
        [property: JsonPropertyName("_tag")]
        string _Tag,
        [property: JsonPropertyName("id")]
        string Id,
        [property: JsonPropertyName("tag")]
        string Tag,
        [property: JsonPropertyName("payload")]
        JsonElement Payload,
        [property: JsonPropertyName("traceId")]
        string TraceId,
        [property: JsonPropertyName("spanId")]
        string SpanId,
        [property: JsonPropertyName("sampled")]
        bool Sampled,
        [property: JsonPropertyName("headers")]
        object[] Headers
    );

    private sealed record ExistingWsRequestControlFrame(
        [property: JsonPropertyName("_tag")]
        string _Tag,
        [property: JsonPropertyName("requestId")]
        string RequestId
    );
}
