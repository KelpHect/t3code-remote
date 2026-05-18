using System.Net;
using System.Net.Sockets;

namespace T3Code.Native.Client.Security;

public static class NativeEndpointSecurity
{
    public static EndpointSecurityDecision Evaluate(Uri baseUri)
    {
        if (baseUri.Scheme == Uri.UriSchemeHttps)
        {
            return EndpointSecurityDecision.Allowed("HTTPS endpoint.");
        }

        if (baseUri.Scheme != Uri.UriSchemeHttp)
        {
            return EndpointSecurityDecision.Blocked("Only HTTP and HTTPS backend URLs are supported.");
        }

        return IsPrivateHost(baseUri.Host)
            ? EndpointSecurityDecision.Allowed(
                "Cleartext HTTP is allowed only for explicit loopback, LAN, or VPN/private-network hosts."
            )
            : EndpointSecurityDecision.Blocked(
                "Cleartext HTTP is blocked for public hosts. Use HTTPS or a VPN/private LAN address."
            );
    }

    public static bool IsPrivateHost(string host)
    {
        if (
            host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || host.Equals("10.0.2.2", StringComparison.OrdinalIgnoreCase)
        )
        {
            return true;
        }

        if (!IPAddress.TryParse(host, out var address))
        {
            return false;
        }

        if (IPAddress.IsLoopback(address))
        {
            return true;
        }

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = address.GetAddressBytes();
            return bytes[0] == 10
                || bytes[0] == 100 && bytes[1] is >= 64 and <= 127
                || bytes[0] == 169 && bytes[1] == 254
                || bytes[0] == 172 && bytes[1] is >= 16 and <= 31
                || bytes[0] == 192 && bytes[1] == 168;
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            return address.IsIPv6LinkLocal
                || address.IsIPv6SiteLocal
                || address.GetAddressBytes()[0] == 0xfc
                || address.GetAddressBytes()[0] == 0xfd;
        }

        return false;
    }
}

public sealed record EndpointSecurityDecision(bool IsAllowed, string Message)
{
    public static EndpointSecurityDecision Allowed(string message) => new(true, message);

    public static EndpointSecurityDecision Blocked(string message) => new(false, message);
}
