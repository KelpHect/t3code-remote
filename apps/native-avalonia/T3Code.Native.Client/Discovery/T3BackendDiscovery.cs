using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using T3Code.Native.Client.Protocol;

namespace T3Code.Native.Client.Discovery;

public sealed record T3BackendDiscoveryOptions(
    int Port = 3773,
    TimeSpan? ProbeTimeout = null,
    int MaxConcurrency = 32,
    bool IncludePrivateSubnetPeers = true
)
{
    public TimeSpan EffectiveProbeTimeout => ProbeTimeout ?? TimeSpan.FromMilliseconds(350);
}

public sealed record T3BackendCandidate(Uri BaseUri, string Source);

public sealed record DiscoveredT3Backend(
    Uri BaseUri,
    string Source,
    string Label,
    bool Authenticated,
    string? AuthMode
);

public interface IT3BackendCandidateProvider
{
    IReadOnlyList<T3BackendCandidate> GetCandidates();
}

public sealed class T3BackendDiscoveryClient(
    HttpClient httpClient,
    IT3BackendCandidateProvider? candidateProvider = null
)
{
    private readonly IT3BackendCandidateProvider _candidateProvider =
        candidateProvider ?? new NetworkT3BackendCandidateProvider();

    public async Task<IReadOnlyList<DiscoveredT3Backend>> DiscoverAsync(
        T3BackendDiscoveryOptions? options = null,
        CancellationToken cancellationToken = default
    )
    {
        options ??= new T3BackendDiscoveryOptions();
        return await DiscoverAsync(_candidateProvider.GetCandidates(), options, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<DiscoveredT3Backend>> DiscoverAsync(
        IEnumerable<T3BackendCandidate> candidates,
        T3BackendDiscoveryOptions? options = null,
        CancellationToken cancellationToken = default
    )
    {
        options ??= new T3BackendDiscoveryOptions();
        var discovered = new ConcurrentBag<DiscoveredT3Backend>();
        using var concurrency = new SemaphoreSlim(Math.Max(1, options.MaxConcurrency));

        var tasks = Deduplicate(candidates)
            .Select(async candidate =>
            {
                await concurrency.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    var backend = await ProbeAsync(candidate, options, cancellationToken)
                        .ConfigureAwait(false);
                    if (backend is not null)
                    {
                        discovered.Add(backend);
                    }
                }
                finally
                {
                    concurrency.Release();
                }
            })
            .ToArray();

        await Task.WhenAll(tasks).ConfigureAwait(false);

        return discovered
            .OrderBy(candidate => candidate.BaseUri.Host)
            .ThenBy(candidate => candidate.BaseUri.Port)
            .ToArray();
    }

    private async Task<DiscoveredT3Backend?> ProbeAsync(
        T3BackendCandidate candidate,
        T3BackendDiscoveryOptions options,
        CancellationToken cancellationToken
    )
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.EffectiveProbeTimeout);

        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                new Uri(candidate.BaseUri, "/api/auth/session")
            );
            using var response = await httpClient.SendAsync(request, timeout.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var session = await response.Content
                .ReadFromJsonAsync<T3AuthSessionProbe>(NativeProtocol.JsonOptions, timeout.Token)
                .ConfigureAwait(false);

            if (session?.Auth is null)
            {
                return null;
            }

            return new DiscoveredT3Backend(
                candidate.BaseUri,
                candidate.Source,
                $"{candidate.BaseUri.Authority} ({candidate.Source})",
                session.Authenticated,
                session.Auth.Mode
            );
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return null;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IReadOnlyList<T3BackendCandidate> Deduplicate(IEnumerable<T3BackendCandidate> candidates)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<T3BackendCandidate>();
        foreach (var candidate in candidates)
        {
            var key = candidate.BaseUri.GetLeftPart(UriPartial.Authority);
            if (seen.Add(key))
            {
                result.Add(candidate with { BaseUri = new Uri(key) });
            }
        }

        return result;
    }
}

public sealed class NetworkT3BackendCandidateProvider(T3BackendDiscoveryOptions? options = null)
    : IT3BackendCandidateProvider
{
    private readonly T3BackendDiscoveryOptions _options = options ?? new T3BackendDiscoveryOptions();

    public IReadOnlyList<T3BackendCandidate> GetCandidates()
    {
        var candidates = new List<T3BackendCandidate>
        {
            Candidate("127.0.0.1", "loopback"),
            Candidate("localhost", "loopback"),
            Candidate("10.0.2.2", "android-emulator-host"),
        };

        foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (networkInterface.OperationalStatus != OperationalStatus.Up)
            {
                continue;
            }

            var properties = networkInterface.GetIPProperties();
            foreach (var gateway in properties.GatewayAddresses)
            {
                if (gateway.Address.AddressFamily == AddressFamily.InterNetwork)
                {
                    candidates.Add(Candidate(gateway.Address.ToString(), "gateway"));
                }
            }

            foreach (var unicast in properties.UnicastAddresses)
            {
                var address = unicast.Address;
                if (address.AddressFamily != AddressFamily.InterNetwork)
                {
                    continue;
                }

                candidates.Add(Candidate(address.ToString(), "interface"));

                if (_options.IncludePrivateSubnetPeers && IsPrivate(address))
                {
                    candidates.AddRange(SubnetPeers(address).Select(peer => Candidate(peer, "private-subnet")));
                }
            }
        }

        return candidates;
    }

    private T3BackendCandidate Candidate(string host, string source) =>
        new(new UriBuilder(Uri.UriSchemeHttp, host, _options.Port).Uri, source);

    private static IEnumerable<string> SubnetPeers(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        if (bytes.Length != 4)
        {
            yield break;
        }

        for (var host = 1; host <= 254; host++)
        {
            if (host == bytes[3])
            {
                continue;
            }

            yield return $"{bytes[0]}.{bytes[1]}.{bytes[2]}.{host}";
        }
    }

    private static bool IsPrivate(IPAddress address)
    {
        var bytes = address.GetAddressBytes();
        return bytes[0] == 10
            || bytes[0] == 100 && bytes[1] is >= 64 and <= 127
            || bytes[0] == 172 && bytes[1] is >= 16 and <= 31
            || bytes[0] == 192 && bytes[1] == 168;
    }
}

public sealed record T3AuthSessionProbe(
    bool Authenticated,
    T3AuthDescriptorProbe? Auth
);

public sealed record T3AuthDescriptorProbe(string Mode);
