using System.Text.Json;
using T3Code.Native.Client.Protocol;

namespace T3Code.Native.Tests;

public sealed class NativeProtocolTests
{
    [Fact]
    public void RequestEnvelopeUsesStableJsonShape()
    {
        var json = NativeEnvelopeJson.Request(
            "request-1",
            NativeMethods.OrchestrationDispatchCommand,
            new { commandId = "cmd-1" }
        );

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        Assert.Equal("request", root.GetProperty("type").GetString());
        Assert.Equal("request-1", root.GetProperty("id").GetString());
        Assert.Equal(NativeMethods.OrchestrationDispatchCommand, root.GetProperty("method").GetString());
        Assert.Equal("cmd-1", root.GetProperty("params").GetProperty("commandId").GetString());
    }

    [Fact]
    public void ServerEnvelopeDecodesProtocolErrors()
    {
        var envelope = NativeEnvelopeJson.ParseServerEnvelope(
            """
            {
              "type": "error",
              "id": "request-1",
              "error": { "code": "expired_ws_token", "message": "Expired.", "retryable": true }
            }
            """
        );

        Assert.Equal("error", envelope.Type);
        Assert.Equal("request-1", envelope.Id);
        Assert.NotNull(envelope.Error);
        Assert.True(envelope.Error.Retryable);
        Assert.Equal("expired_ws_token", envelope.Error.Code);
    }
}
