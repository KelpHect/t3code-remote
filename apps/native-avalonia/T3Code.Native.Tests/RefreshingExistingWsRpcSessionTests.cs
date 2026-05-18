using System.Net.WebSockets;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class RefreshingExistingWsRpcSessionTests
{
    [Fact]
    public async Task ReconnectRefreshesExpiredWsTokenAndReplaysOnlyActiveOperations()
    {
        var factory = new FailsOnTokenSocketFactory("expired-token");
        var provider = new QueueWsUriProvider("initial-token", "expired-token", "fresh-token");
        await using var session = new ExistingWsRpcSession(factory);
        var refreshingSession = new RefreshingExistingWsRpcSession(session, provider);

        await refreshingSession.ConnectAsync();
        var request = session.RequestAsync<Pong>("server.getConfig", id: "request-1");
        var subscription = await session.SubscribeAsync<object>(
            "orchestration.subscribeShell",
            null,
            _ => Task.CompletedTask,
            id: "sub-1"
        );
        await subscription.DisposeAsync();

        await refreshingSession.ReconnectAsync();

        Assert.Equal(
            [false, false, true],
            provider.ForceRefreshCalls
        );
        Assert.Equal("ws://127.0.0.1/ws?wsToken=fresh-token", factory.Sockets[1].Uri.ToString());
        Assert.Contains(factory.Sockets[1].Sent, message => message.Contains("\"id\":\"request-1\""));
        Assert.DoesNotContain(factory.Sockets[1].Sent, message => message.Contains("\"id\":\"sub-1\""));

        await factory.Sockets[1].PushAsync(
            """{"_tag":"Exit","requestId":"request-1","exit":{"_tag":"Success","value":{"ok":true}}}"""
        );
        Assert.True((await WithTimeout(request))?.Ok);
    }

    [Fact]
    public async Task FinalAuthDenialIsClearAfterRefreshAttemptFails()
    {
        var factory = new FailsOnTokenSocketFactory("expired-token");
        var provider = new DeniesRefreshWsUriProvider("expired-token");
        await using var session = new ExistingWsRpcSession(factory);
        var refreshingSession = new RefreshingExistingWsRpcSession(session, provider);

        var error = await Assert.ThrowsAsync<ExistingWsAuthenticationException>(
            () => refreshingSession.ConnectAsync()
        );

        Assert.Equal("http_401", error.Code);
        Assert.Contains("denied", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal([false, true], provider.ForceRefreshCalls);
    }

    private static async Task<T> WithTimeout<T>(Task<T> task)
    {
        var timeout = Task.Delay(TimeSpan.FromSeconds(5));
        var completed = await Task.WhenAny(task, timeout);
        Assert.Same(task, completed);
        return await task;
    }

    private sealed record Pong(bool Ok);
}

internal sealed class FailsOnTokenSocketFactory(string rejectedToken) : INativeWebSocketFactory
{
    public List<UriCapturingSocket> Sockets { get; } = [];

    public Task<INativeWebSocket> ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        if (uri.Query.Contains(rejectedToken, StringComparison.Ordinal))
        {
            throw new WebSocketException("401 Unauthorized: expired ws-token");
        }

        var socket = new UriCapturingSocket(uri);
        Sockets.Add(socket);
        return Task.FromResult<INativeWebSocket>(socket);
    }
}

internal sealed class UriCapturingSocket(Uri uri) : FakeNativeWebSocket
{
    public Uri Uri { get; } = uri;
}

internal sealed class QueueWsUriProvider(params string[] tokens) : IExistingWsUriProvider
{
    private readonly Queue<string> _tokens = new(tokens);

    public List<bool> ForceRefreshCalls { get; } = [];

    public Task<Uri> IssueWebSocketUriAsync(
        bool forceRefresh,
        CancellationToken cancellationToken = default
    )
    {
        ForceRefreshCalls.Add(forceRefresh);
        return Task.FromResult(new Uri($"ws://127.0.0.1/ws?wsToken={_tokens.Dequeue()}"));
    }
}

internal sealed class DeniesRefreshWsUriProvider(string firstToken) : IExistingWsUriProvider
{
    private bool _first = true;

    public List<bool> ForceRefreshCalls { get; } = [];

    public Task<Uri> IssueWebSocketUriAsync(
        bool forceRefresh,
        CancellationToken cancellationToken = default
    )
    {
        ForceRefreshCalls.Add(forceRefresh);
        if (_first)
        {
            _first = false;
            return Task.FromResult(new Uri($"ws://127.0.0.1/ws?wsToken={firstToken}"));
        }

        throw new NativeProtocolException("http_401", "Bearer session denied.", false);
    }
}
