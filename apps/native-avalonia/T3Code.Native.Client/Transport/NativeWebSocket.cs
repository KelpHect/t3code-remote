using System.Net.WebSockets;
using System.Text;

namespace T3Code.Native.Client.Transport;

public interface INativeWebSocket : IAsyncDisposable
{
    Task SendAsync(string message, CancellationToken cancellationToken = default);

    Task<string?> ReceiveAsync(CancellationToken cancellationToken = default);
}

public interface INativeWebSocketFactory
{
    Task<INativeWebSocket> ConnectAsync(Uri uri, CancellationToken cancellationToken = default);
}

public sealed class ClientWebSocketFactory : INativeWebSocketFactory
{
    public async Task<INativeWebSocket> ConnectAsync(Uri uri, CancellationToken cancellationToken = default)
    {
        var socket = new ClientWebSocket();
        await socket.ConnectAsync(uri, cancellationToken).ConfigureAwait(false);
        return new ClientWebSocketAdapter(socket);
    }
}

public sealed class ClientWebSocketAdapter(ClientWebSocket socket) : INativeWebSocket
{
    public async Task SendAsync(string message, CancellationToken cancellationToken = default)
    {
        var bytes = Encoding.UTF8.GetBytes(message);
        await socket
            .SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<string?> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        var buffer = new byte[16 * 1024];
        using var body = new MemoryStream();

        while (true)
        {
            var result = await socket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return null;
            }

            body.Write(buffer, 0, result.Count);
            if (result.EndOfMessage)
            {
                return Encoding.UTF8.GetString(body.ToArray());
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
        {
            await socket
                .CloseAsync(WebSocketCloseStatus.NormalClosure, "client closing", CancellationToken.None)
                .ConfigureAwait(false);
        }

        socket.Dispose();
    }
}
