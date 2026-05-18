using System.Net.Http.Headers;
using System.Net.Http.Json;
using T3Code.Native.Client.Protocol;

namespace T3Code.Native.Client.Auth;

public sealed class NativeAuthClient(HttpClient httpClient)
{
    public async Task<AuthBearerBootstrapResult> ExchangePairingTokenAsync(
        Uri baseUri,
        string pairingToken,
        CancellationToken cancellationToken = default
    )
    {
        using var response = await httpClient
            .PostAsJsonAsync(
                Combine(baseUri, "/api/auth/bootstrap/bearer"),
                new AuthBootstrapRequest(pairingToken),
                NativeProtocol.JsonOptions,
                cancellationToken
            )
            .ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);

        return await response.Content
            .ReadFromJsonAsync<AuthBearerBootstrapResult>(NativeProtocol.JsonOptions, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NativeProtocolException("empty_bootstrap", "Server returned an empty auth response.", true);
    }

    public async Task<AuthWebSocketTokenResult> IssueWebSocketTokenAsync(
        Uri baseUri,
        string bearerToken,
        CancellationToken cancellationToken = default
    )
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, Combine(baseUri, "/api/auth/ws-token"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);

        using var response = await httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(response, cancellationToken).ConfigureAwait(false);

        return await response.Content
            .ReadFromJsonAsync<AuthWebSocketTokenResult>(NativeProtocol.JsonOptions, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NativeProtocolException("empty_ws_token", "Server returned an empty WebSocket token.", true);
    }

    public static Uri BuildExistingWebSocketUri(Uri baseUri, string wsToken)
    {
        var builder = new UriBuilder(Combine(baseUri, "/ws"))
        {
            Scheme = baseUri.Scheme == Uri.UriSchemeHttps ? "wss" : "ws",
            Query = $"wsToken={Uri.EscapeDataString(wsToken)}",
        };
        return builder.Uri;
    }

    private static Uri Combine(Uri baseUri, string path)
    {
        var root = baseUri.AbsoluteUri.TrimEnd('/');
        return new Uri($"{root}{path}", UriKind.Absolute);
    }

    private static async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken
    )
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        throw new NativeProtocolException(
            $"http_{(int)response.StatusCode}",
            string.IsNullOrWhiteSpace(body) ? response.ReasonPhrase ?? "HTTP request failed." : body,
            response.StatusCode is >= System.Net.HttpStatusCode.InternalServerError
        );
    }
}

public interface ISecretStore
{
    Task SaveBearerTokenAsync(Uri baseUri, string bearerToken, CancellationToken cancellationToken = default);

    Task<string?> GetBearerTokenAsync(Uri baseUri, CancellationToken cancellationToken = default);

    Task ClearBearerTokenAsync(Uri baseUri, CancellationToken cancellationToken = default);
}

public sealed class MemorySecretStore : ISecretStore
{
    private readonly Dictionary<string, string> _tokens = [];

    public Task SaveBearerTokenAsync(
        Uri baseUri,
        string bearerToken,
        CancellationToken cancellationToken = default
    )
    {
        _tokens[Key(baseUri)] = bearerToken;
        return Task.CompletedTask;
    }

    public Task<string?> GetBearerTokenAsync(Uri baseUri, CancellationToken cancellationToken = default)
    {
        _tokens.TryGetValue(Key(baseUri), out var token);
        return Task.FromResult(token);
    }

    public Task ClearBearerTokenAsync(Uri baseUri, CancellationToken cancellationToken = default)
    {
        _tokens.Remove(Key(baseUri));
        return Task.CompletedTask;
    }

    private static string Key(Uri baseUri) => baseUri.GetLeftPart(UriPartial.Authority);
}
