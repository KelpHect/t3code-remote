using T3Code.Native.Client.Connection;

namespace T3Code.Native.Tests;

public sealed class NativeReconnectLoopTests
{
    [Fact]
    public async Task ReportsTransientDisconnectAndReconnects()
    {
        var session = new ScriptedReconnectSession(
            connectResults: [null, null],
            disconnectResults: [null, new OperationCanceledException()]
        );
        var states = new List<NativeConnectionState>();
        using var cancellation = new CancellationTokenSource();
        var loop = new NativeReconnectLoop(
            session,
            new NativeReconnectOptions(
                new BoundedExponentialBackoff(TimeSpan.FromMilliseconds(10), TimeSpan.FromMilliseconds(50))
            ),
            (_, _) => Task.CompletedTask
        );

        await loop.RunAsync(
            state =>
            {
                states.Add(state);
                if (states.Count(state => state.Kind == NativeConnectionStateKind.Connected) == 2)
                {
                    cancellation.Cancel();
                }

                return Task.CompletedTask;
            },
            cancellation.Token
        );

        Assert.Contains(states, state => state.Kind == NativeConnectionStateKind.Connected);
        Assert.Contains(states, state => state.Kind == NativeConnectionStateKind.Disconnected);
        Assert.Contains(states, state => state.Kind == NativeConnectionStateKind.Reconnecting);
        Assert.Equal(NativeConnectionStateKind.Cancelled, states.Last().Kind);
    }

    [Fact]
    public async Task BoundsBackoffAndReportsOfflineAfterRepeatedFailures()
    {
        var session = new ScriptedReconnectSession(
            connectResults:
            [
                new InvalidOperationException("network down"),
                new InvalidOperationException("network down"),
                new InvalidOperationException("network down"),
            ],
            disconnectResults: []
        );
        var states = new List<NativeConnectionState>();
        var delays = new List<TimeSpan>();
        using var cancellation = new CancellationTokenSource();
        var loop = new NativeReconnectLoop(
            session,
            new NativeReconnectOptions(
                new BoundedExponentialBackoff(TimeSpan.FromMilliseconds(10), TimeSpan.FromMilliseconds(15)),
                OfflineAfterFailures: 3
            ),
            (delay, _) =>
            {
                delays.Add(delay);
                if (delays.Count == 3)
                {
                    cancellation.Cancel();
                }

                return Task.CompletedTask;
            }
        );

        await loop.RunAsync(
            state =>
            {
                states.Add(state);
                return Task.CompletedTask;
            },
            cancellation.Token
        );

        Assert.Equal([TimeSpan.FromMilliseconds(10), TimeSpan.FromMilliseconds(15), TimeSpan.FromMilliseconds(15)], delays);
        Assert.Contains(states, state => state.Kind == NativeConnectionStateKind.WaitingToRetry);
        Assert.Contains(states, state => state.Kind == NativeConnectionStateKind.Offline);
        Assert.Equal(NativeConnectionStateKind.Cancelled, states.Last().Kind);
    }

    [Fact]
    public async Task CancellationReportsCancelledWithoutRetrying()
    {
        var session = new ScriptedReconnectSession(
            connectResults: [new OperationCanceledException()],
            disconnectResults: []
        );
        var states = new List<NativeConnectionState>();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var loop = new NativeReconnectLoop(session, delay: (_, _) => Task.CompletedTask);

        await loop.RunAsync(
            state =>
            {
                states.Add(state);
                return Task.CompletedTask;
            },
            cancellation.Token
        );

        Assert.Equal([NativeConnectionStateKind.Cancelled], states.Select(state => state.Kind).ToArray());
    }
}

internal sealed class ScriptedReconnectSession(
    IReadOnlyCollection<Exception?> connectResults,
    IReadOnlyCollection<Exception?> disconnectResults
) : INativeReconnectSession
{
    private readonly Queue<Exception?> _connectResults = new(connectResults);
    private readonly Queue<Exception?> _disconnectResults = new(disconnectResults);

    public Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = _connectResults.Count > 0 ? _connectResults.Dequeue() : null;
        return result is null ? Task.CompletedTask : Task.FromException(result);
    }

    public Task WaitForDisconnectAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = _disconnectResults.Count > 0 ? _disconnectResults.Dequeue() : null;
        return result is null ? Task.CompletedTask : Task.FromException(result);
    }
}
