using System.Text.Json;
using T3Code.Native.Client.Diff;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Tests;

public sealed class NativeDiffClientTests
{
    [Fact]
    public async Task RequestsTurnDiffAndMapsPatch()
    {
        var factory = new FakeSocketFactory();
        await using var session = new ExistingWsRpcSession(factory);
        await session.ConnectAsync(new Uri("ws://127.0.0.1/ws?wsToken=one"));
        var client = new NativeDiffClient(session);

        var load = client.GetTurnDiffAsync("thread-1", 1, 2);
        var sent = factory.Sockets[0].Sent.Single();
        using var request = JsonDocument.Parse(sent);

        Assert.Equal("orchestration.getTurnDiff", request.RootElement.GetProperty("tag").GetString());
        Assert.Equal(1, request.RootElement.GetProperty("payload").GetProperty("fromTurnCount").GetInt32());
        Assert.Equal(2, request.RootElement.GetProperty("payload").GetProperty("toTurnCount").GetInt32());

        await factory.Sockets[0].PushAsync(
            "{\"_tag\":\"Exit\",\"requestId\":\""
                + request.RootElement.GetProperty("id").GetString()
                + "\",\"exit\":{\"_tag\":\"Success\",\"value\":{\"threadId\":\"thread-1\",\"fromTurnCount\":1,\"toTurnCount\":2,\"diff\":\"diff --git a/file b/file\\n+hello\"}}}"
        );

        var result = await load;

        Assert.Equal(NativeDiffState.Ready, result.State);
        Assert.Contains("+hello", result.Diff);
    }

    [Fact]
    public void MapsEmptyAndBinaryDiffStates()
    {
        var empty = NativeDiffMapper.Map(Parse(
            """{"threadId":"thread-1","fromTurnCount":0,"toTurnCount":1,"diff":""}"""
        ));
        var binary = NativeDiffMapper.Map(Parse(
            """{"threadId":"thread-1","fromTurnCount":0,"toTurnCount":1,"diff":"Binary files a/image.png and b/image.png differ"}"""
        ));

        Assert.Equal(NativeDiffState.Empty, empty.State);
        Assert.Equal(NativeDiffState.Binary, binary.State);
    }

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }
}
