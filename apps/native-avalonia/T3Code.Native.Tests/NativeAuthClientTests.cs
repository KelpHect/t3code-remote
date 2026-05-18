using System.Net;
using System.Text.Json;
using T3Code.Native.Client.Auth;

namespace T3Code.Native.Tests;

public sealed class NativeAuthClientTests
{
    [Fact]
    public async Task ExchangesPairingTokenForBearerSessionToken()
    {
        HttpRequestMessage? capturedRequest = null;
        var client = new NativeAuthClient(
            new HttpClient(
                new StaticResponseHandler(async request =>
                {
                    capturedRequest = request;
                    var body = await request.Content!.ReadAsStringAsync();
                    using var document = JsonDocument.Parse(body);
                    Assert.Equal("PAIRCODE", document.RootElement.GetProperty("credential").GetString());

                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(
                            """
                            {
                              "authenticated": true,
                              "role": "client",
                              "sessionMethod": "bearer-session-token",
                              "expiresAt": "2026-05-18T15:00:00Z",
                              "sessionToken": "session-token"
                            }
                            """
                        ),
                    };
                })
            )
        );

        var result = await client.ExchangePairingTokenAsync(new Uri("http://example.test:3773"), "PAIRCODE");

        Assert.Equal("http://example.test:3773/api/auth/bootstrap/bearer", capturedRequest?.RequestUri?.ToString());
        Assert.Equal("session-token", result.SessionToken);
    }

    [Fact]
    public async Task IssuesWebSocketTokenWithBearerAuthorization()
    {
        HttpRequestMessage? capturedRequest = null;
        var client = new NativeAuthClient(
            new HttpClient(
                new StaticResponseHandler(request =>
                {
                    capturedRequest = request;
                    return Task.FromResult(
                        new HttpResponseMessage(HttpStatusCode.OK)
                        {
                            Content = new StringContent(
                                """
                                {
                                  "token": "ws-token",
                                  "expiresAt": "2026-05-18T15:01:00Z"
                                }
                                """
                            ),
                        }
                    );
                })
            )
        );

        var result = await client.IssueWebSocketTokenAsync(
            new Uri("http://example.test:3773"),
            "session-token"
        );

        Assert.Equal("http://example.test:3773/api/auth/ws-token", capturedRequest?.RequestUri?.ToString());
        Assert.Equal("Bearer", capturedRequest?.Headers.Authorization?.Scheme);
        Assert.Equal("session-token", capturedRequest?.Headers.Authorization?.Parameter);
        Assert.Equal("ws-token", result.Token);
    }

    private sealed class StaticResponseHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        ) => respond(request);
    }
}
