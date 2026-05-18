namespace T3Code.Native.Client.Connection;

public sealed class NativeReconnectLoop(
    INativeReconnectSession session,
    NativeReconnectOptions? options = null,
    Func<TimeSpan, CancellationToken, Task>? delay = null
)
{
    private readonly NativeReconnectOptions _options = options ?? new NativeReconnectOptions();
    private readonly Func<TimeSpan, CancellationToken, Task> _delay = delay ?? Task.Delay;

    public async Task RunAsync(
        Func<NativeConnectionState, Task> onState,
        CancellationToken cancellationToken = default
    )
    {
        var failures = 0;
        var reconnecting = false;

        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                await onState(
                        new NativeConnectionState(
                            reconnecting
                                ? NativeConnectionStateKind.Reconnecting
                                : NativeConnectionStateKind.Connecting,
                            failures,
                            "Connecting to T3 backend.",
                            null
                        )
                    )
                    .ConfigureAwait(false);

                try
                {
                    await session.ConnectAsync(cancellationToken).ConfigureAwait(false);
                    failures = 0;
                    reconnecting = true;
                    await onState(
                            new NativeConnectionState(
                                NativeConnectionStateKind.Connected,
                                failures,
                                "Connected.",
                                null
                            )
                        )
                        .ConfigureAwait(false);

                    await session.WaitForDisconnectAsync(cancellationToken).ConfigureAwait(false);
                    await onState(
                            new NativeConnectionState(
                                NativeConnectionStateKind.Disconnected,
                                failures,
                                "Connection dropped.",
                                null
                            )
                        )
                        .ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception error)
                {
                    failures++;
                    reconnecting = true;
                    var retryDelay = _options.Backoff.GetDelay(failures);
                    var state = failures >= _options.OfflineAfterFailures
                        ? NativeConnectionStateKind.Offline
                        : NativeConnectionStateKind.WaitingToRetry;
                    await onState(
                            new NativeConnectionState(
                                state,
                                failures,
                                error.Message,
                                retryDelay
                            )
                        )
                        .ConfigureAwait(false);
                    await _delay(retryDelay, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        finally
        {
            await onState(
                    new NativeConnectionState(
                        NativeConnectionStateKind.Cancelled,
                        failures,
                        "Connection loop stopped.",
                        null
                    )
                )
                .ConfigureAwait(false);
        }
    }
}

public interface INativeReconnectSession
{
    Task ConnectAsync(CancellationToken cancellationToken = default);

    Task WaitForDisconnectAsync(CancellationToken cancellationToken = default);
}

public sealed record NativeReconnectOptions(
    BoundedExponentialBackoff? Backoff = null,
    int OfflineAfterFailures = 3
)
{
    public BoundedExponentialBackoff Backoff { get; } =
        Backoff ?? new BoundedExponentialBackoff(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(30));
}

public sealed record BoundedExponentialBackoff(TimeSpan InitialDelay, TimeSpan MaxDelay)
{
    public TimeSpan GetDelay(int failureCount)
    {
        if (failureCount <= 0)
        {
            return TimeSpan.Zero;
        }

        var multiplier = Math.Pow(2, Math.Min(failureCount - 1, 30));
        var delay = TimeSpan.FromMilliseconds(InitialDelay.TotalMilliseconds * multiplier);
        return delay <= MaxDelay ? delay : MaxDelay;
    }
}

public sealed record NativeConnectionState(
    NativeConnectionStateKind Kind,
    int ConsecutiveFailures,
    string Message,
    TimeSpan? RetryDelay
);

public enum NativeConnectionStateKind
{
    Idle,
    Connecting,
    Connected,
    Disconnected,
    Reconnecting,
    WaitingToRetry,
    Offline,
    Cancelled,
}
