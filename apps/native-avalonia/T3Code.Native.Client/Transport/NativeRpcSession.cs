using System.Collections.Concurrent;
using System.Text.Json;
using T3Code.Native.Client.Protocol;

namespace T3Code.Native.Client.Transport;

public sealed class NativeRpcSession(INativeWebSocketFactory socketFactory) : IAsyncDisposable
{
    private readonly ConcurrentDictionary<string, Operation> _operations = [];
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private CancellationTokenSource? _receiveCancellation;
    private Task? _receiveTask;
    private INativeWebSocket? _socket;
    private Uri? _uri;

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

    public async Task<T?> RequestAsync<T>(
        string method,
        object? parameters = null,
        string? id = null,
        CancellationToken cancellationToken = default
    )
    {
        var operationId = id ?? Guid.NewGuid().ToString("N");
        var message = NativeEnvelopeJson.Request(operationId, method, parameters);
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
                var (session, id) = ((NativeRpcSession Session, string Id))state!;
                _ = session.CancelAsync(id);
            },
            (this, operationId)
        );

        var result = await pending.Task.ConfigureAwait(false);
        return NativeEnvelopeJson.Deserialize<T>(result);
    }

    public async Task<NativeSubscription<T>> SubscribeAsync<T>(
        string method,
        object? parameters,
        Func<T?, Task> onEvent,
        string? id = null,
        CancellationToken cancellationToken = default
    )
    {
        var operationId = id ?? Guid.NewGuid().ToString("N");
        var message = NativeEnvelopeJson.Subscribe(operationId, method, parameters);
        var operation = Operation.Subscription(
            operationId,
            message,
            async element => await onEvent(NativeEnvelopeJson.Deserialize<T>(element)).ConfigureAwait(false)
        );

        if (!_operations.TryAdd(operationId, operation))
        {
            throw new InvalidOperationException($"Operation {operationId} is already active.");
        }

        await SendAsync(message, cancellationToken).ConfigureAwait(false);
        return new NativeSubscription<T>(operationId, () => CancelAsync(operationId));
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

    private async Task CancelAsync(string id)
    {
        if (!_operations.TryRemove(id, out var operation))
        {
            return;
        }

        operation.Cancel();
        if (_socket is not null)
        {
            await SendAsync(NativeEnvelopeJson.Cancel(id), CancellationToken.None).ConfigureAwait(false);
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

            await HandleMessageAsync(message).ConfigureAwait(false);
        }
    }

    private async Task HandleMessageAsync(string message)
    {
        var envelope = NativeEnvelopeJson.ParseServerEnvelope(message);
        if (!_operations.TryGetValue(envelope.Id, out var operation))
        {
            return;
        }

        switch (envelope.Type)
        {
            case "response":
                _operations.TryRemove(envelope.Id, out _);
                operation.Resolve(envelope.Result);
                break;
            case "event":
                await operation.EmitAsync(envelope.Event).ConfigureAwait(false);
                break;
            case "complete":
                _operations.TryRemove(envelope.Id, out _);
                operation.Resolve(null);
                break;
            case "error":
                _operations.TryRemove(envelope.Id, out _);
                operation.Fail(ToException(envelope.Error));
                break;
        }
    }

    private static NativeProtocolException ToException(NativeProtocolError? error) =>
        new(
            error?.Code ?? "unknown_error",
            error?.Message ?? "Native protocol request failed.",
            error?.Retryable ?? false
        );

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

public sealed class NativeSubscription<T>(string id, Func<Task> cancel) : IAsyncDisposable
{
    public string Id { get; } = id;

    public async ValueTask DisposeAsync() => await cancel().ConfigureAwait(false);
}
