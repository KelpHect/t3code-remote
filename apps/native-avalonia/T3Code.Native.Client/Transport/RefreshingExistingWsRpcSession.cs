using System.Net.WebSockets;
using T3Code.Native.Client.Auth;
using T3Code.Native.Client.Protocol;

namespace T3Code.Native.Client.Transport;

public sealed class RefreshingExistingWsRpcSession(
    ExistingWsRpcSession session,
    IExistingWsUriProvider uriProvider
)
{
    public async Task ConnectAsync(CancellationToken cancellationToken = default) =>
        await ConnectWithRefreshAsync(session.ConnectAsync, cancellationToken).ConfigureAwait(false);

    public async Task ReconnectAsync(CancellationToken cancellationToken = default) =>
        await ConnectWithRefreshAsync(session.ReconnectAsync, cancellationToken).ConfigureAwait(false);

    private async Task ConnectWithRefreshAsync(
        Func<Uri, CancellationToken, Task> connect,
        CancellationToken cancellationToken
    )
    {
        try
        {
            await connect(
                    await uriProvider
                        .IssueWebSocketUriAsync(forceRefresh: false, cancellationToken)
                        .ConfigureAwait(false),
                    cancellationToken
                )
                .ConfigureAwait(false);
            return;
        }
        catch (Exception error) when (IsAuthenticationFailure(error))
        {
        }

        try
        {
            await connect(
                    await uriProvider
                        .IssueWebSocketUriAsync(forceRefresh: true, cancellationToken)
                        .ConfigureAwait(false),
                    cancellationToken
                )
                .ConfigureAwait(false);
        }
        catch (Exception error) when (IsAuthenticationFailure(error))
        {
            throw ExistingWsAuthenticationException.From(error);
        }
    }

    private static bool IsAuthenticationFailure(Exception error) =>
        error switch
        {
            ExistingWsAuthenticationException => true,
            NativeProtocolException native => native.Code is "http_401" or "http_403" or "missing_bearer_token",
            WebSocketException socket => ContainsAuthSignal(socket.Message),
            _ => ContainsAuthSignal(error.Message),
        };

    private static bool ContainsAuthSignal(string? message) =>
        message?.Contains("401", StringComparison.OrdinalIgnoreCase) == true
        || message?.Contains("403", StringComparison.OrdinalIgnoreCase) == true
        || message?.Contains("unauthor", StringComparison.OrdinalIgnoreCase) == true
        || message?.Contains("forbidden", StringComparison.OrdinalIgnoreCase) == true
        || message?.Contains("expired", StringComparison.OrdinalIgnoreCase) == true
        || message?.Contains("ws-token", StringComparison.OrdinalIgnoreCase) == true;
}

public interface IExistingWsUriProvider
{
    Task<Uri> IssueWebSocketUriAsync(
        bool forceRefresh,
        CancellationToken cancellationToken = default
    );
}

public sealed class BearerTokenExistingWsUriProvider(
    NativeAuthClient authClient,
    ISecretStore secretStore,
    Uri baseUri
) : IExistingWsUriProvider
{
    public async Task<Uri> IssueWebSocketUriAsync(
        bool forceRefresh,
        CancellationToken cancellationToken = default
    )
    {
        var bearerToken = await secretStore
            .GetBearerTokenAsync(baseUri, cancellationToken)
            .ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(bearerToken))
        {
            throw new NativeProtocolException(
                "missing_bearer_token",
                "Pair with this backend before opening a WebSocket.",
                false
            );
        }

        var wsToken = await authClient
            .IssueWebSocketTokenAsync(baseUri, bearerToken, cancellationToken)
            .ConfigureAwait(false);
        return NativeAuthClient.BuildExistingWebSocketUri(baseUri, wsToken.Token);
    }
}

public sealed class ExistingWsAuthenticationException(string code, string message, Exception inner)
    : Exception(message, inner)
{
    public string Code { get; } = code;

    public static ExistingWsAuthenticationException From(Exception error) =>
        error switch
        {
            NativeProtocolException native => new ExistingWsAuthenticationException(
                native.Code,
                native.Message,
                native
            ),
            ExistingWsAuthenticationException auth => auth,
            _ => new ExistingWsAuthenticationException(
                "ws_auth_failed",
                "WebSocket authentication failed after refreshing the ws-token.",
                error
            ),
        };
}
