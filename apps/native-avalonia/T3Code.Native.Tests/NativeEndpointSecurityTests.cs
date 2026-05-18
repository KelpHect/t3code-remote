using T3Code.Native.Client.Security;

namespace T3Code.Native.Tests;

public sealed class NativeEndpointSecurityTests
{
    [Theory]
    [InlineData("https://t3.example.com:3773")]
    [InlineData("http://localhost:3773")]
    [InlineData("http://127.0.0.1:3773")]
    [InlineData("http://10.0.2.2:3773")]
    [InlineData("http://10.7.0.12:3773")]
    [InlineData("http://100.64.10.20:3773")]
    [InlineData("http://169.254.10.20:3773")]
    [InlineData("http://172.16.0.12:3773")]
    [InlineData("http://172.31.255.255:3773")]
    [InlineData("http://192.168.1.42:3773")]
    [InlineData("http://[fe80::1]:3773")]
    [InlineData("http://[fd00::1]:3773")]
    public void AllowsHttpsAndPrivateCleartextHosts(string url)
    {
        var decision = NativeEndpointSecurity.Evaluate(new Uri(url));

        Assert.True(decision.IsAllowed);
    }

    [Theory]
    [InlineData("http://example.com:3773")]
    [InlineData("http://8.8.8.8:3773")]
    [InlineData("http://172.15.255.255:3773")]
    [InlineData("http://172.32.0.1:3773")]
    public void BlocksPublicCleartextHosts(string url)
    {
        var decision = NativeEndpointSecurity.Evaluate(new Uri(url));

        Assert.False(decision.IsAllowed);
        Assert.Contains("blocked", decision.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void BlocksUnsupportedSchemes()
    {
        var decision = NativeEndpointSecurity.Evaluate(new Uri("ftp://192.168.1.42"));

        Assert.False(decision.IsAllowed);
    }
}
