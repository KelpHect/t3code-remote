using System.Collections.Concurrent;
using System.Threading.Channels;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeRpcSessionTests
{
    [Fact]
    public async Task ReconnectReplaysPendingRequests()
    {
        var factory = new FakeSocketFactory();
        await using var session = new NativeRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/native/ws?wsToken=one"));

        var request = session.RequestAsync<Pong>("server.getConfig", id: "request-1");

        Assert.Contains("\"id\":\"request-1\"", factory.Sockets[0].Sent.Single());

        await session.ReconnectAsync();

        Assert.Contains("\"id\":\"request-1\"", factory.Sockets[1].Sent.Single());
        await factory.Sockets[1].PushAsync(
            """{"type":"response","id":"request-1","result":{"ok":true}}"""
        );

        var result = await WithTimeout(request);
        Assert.NotNull(result);
        Assert.True(result.Ok);
    }

    [Fact]
    public async Task SubscriptionCancellationSendsCancelAndStopsReplay()
    {
        var factory = new FakeSocketFactory();
        await using var session = new NativeRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/native/ws?wsToken=one"));

        var received = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var subscription = await session.SubscribeAsync<NamedEvent>(
            "orchestration.subscribeShell",
            null,
            value =>
            {
                received.TrySetResult(value?.Name ?? "");
                return Task.CompletedTask;
            },
            "sub-1"
        );

        await factory.Sockets[0].PushAsync("""{"type":"event","id":"sub-1","event":{"name":"snapshot"}}""");
        Assert.Equal("snapshot", await WithTimeout(received.Task));

        await subscription.DisposeAsync();

        Assert.Contains(factory.Sockets[0].Sent, message => message.Contains("\"type\":\"cancel\""));

        await session.ReconnectAsync();

        Assert.DoesNotContain(factory.Sockets[1].Sent, message => message.Contains("\"id\":\"sub-1\""));
    }

    private static async Task<T> WithTimeout<T>(Task<T> task)
    {
        var timeout = Task.Delay(TimeSpan.FromSeconds(5));
        var completed = await Task.WhenAny(task, timeout);
        Assert.Same(task, completed);
        return await task;
    }

    private sealed record Pong(bool Ok);

    private sealed record NamedEvent(string Name);
}

internal sealed class FakeSocketFactory : INativeWebSocketFactory
{
    public List<FakeNativeWebSocket> Sockets { get; } = [];

    public Task<INativeWebSocket> ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        var socket = new FakeNativeWebSocket();
        Sockets.Add(socket);
        return Task.FromResult<INativeWebSocket>(socket);
    }
}

internal class FakeNativeWebSocket : INativeWebSocket
{
    private readonly Channel<string> _incoming = Channel.CreateUnbounded<string>();

    public ConcurrentQueue<string> Sent { get; } = [];

    public Task SendAsync(string message, CancellationToken cancellationToken = default)
    {
        Sent.Enqueue(message);
        return Task.CompletedTask;
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken = default) =>
        await _incoming.Reader.ReadAsync(cancellationToken);

    public async Task PushAsync(string message) =>
        await _incoming.Writer.WriteAsync(message);

    public ValueTask DisposeAsync()
    {
        _incoming.Writer.TryComplete();
        return ValueTask.CompletedTask;
    }
}
