using System.Net;
using T3Code.Native.Client.Auth;
using T3Code.Native.Client.Discovery;

namespace T3Code.Native.Tests;

public sealed class T3BackendDiscoveryTests
{
    [Fact]
    public async Task DiscoveryFindsBackendsThroughExistingSessionEndpoint()
    {
        using var httpClient = new HttpClient(
            new StaticResponseHandler(request =>
            {
                if (request.RequestUri?.Host == "192.168.1.42")
                {
                    return new HttpResponseMessage(HttpStatusCode.OK)
                    {
                        Content = new StringContent(
                            """{"authenticated":false,"auth":{"policy":"remote-reachable"}}"""
                        ),
                    };
                }

                return new HttpResponseMessage(HttpStatusCode.NotFound);
            })
        );

        var discovery = new T3BackendDiscoveryClient(httpClient);
        var result = await discovery.DiscoverAsync(
            [
                new T3BackendCandidate(new Uri("http://192.168.1.42:3773"), "private-subnet"),
                new T3BackendCandidate(new Uri("http://192.168.1.42:3773/"), "duplicate"),
                new T3BackendCandidate(new Uri("http://192.168.1.50:3773"), "private-subnet"),
            ],
            new T3BackendDiscoveryOptions(MaxConcurrency: 2)
        );

        var backend = Assert.Single(result);
        Assert.Equal("http://192.168.1.42:3773", backend.BaseUri.GetLeftPart(UriPartial.Authority));
        Assert.Equal("private-subnet", backend.Source);
        Assert.False(backend.Authenticated);
        Assert.Equal("remote-reachable", backend.AuthPolicy);
    }

    [Fact]
    public void ExistingWebSocketUriTargetsOriginalBackendWsEndpoint()
    {
        var uri = NativeAuthClient.BuildExistingWebSocketUri(
            new Uri("http://192.168.1.42:3773"),
            "token with spaces"
        );

        Assert.Equal("ws://192.168.1.42:3773/ws?wsToken=token%20with%20spaces", uri.AbsoluteUri);
    }

    private sealed class StaticResponseHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        ) => Task.FromResult(respond(request));
    }
}
