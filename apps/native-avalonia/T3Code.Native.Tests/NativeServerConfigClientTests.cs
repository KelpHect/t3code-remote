using System.Text.Json;
using T3Code.Native.Client.Config;

namespace T3Code.Native.Tests;

public sealed class NativeServerConfigClientTests
{
    [Fact]
    public void MapsEnabledProviderModelsAndSkipsUnavailableProviders()
    {
        using var document = JsonDocument.Parse(
            """
            {
              "providers": [
                {
                  "instanceId": "codex",
                  "driver": "codex",
                  "displayName": "Codex",
                  "enabled": true,
                  "installed": true,
                  "availability": "available",
                  "models": [
                    {"slug": "gpt-5.5", "name": "GPT-5.5", "shortName": "GPT-5.5", "isCustom": false, "capabilities": null},
                    {"slug": "gpt-5.4", "name": "GPT-5.4", "isCustom": false, "capabilities": null}
                  ]
                },
                {
                  "instanceId": "missing",
                  "driver": "forked",
                  "enabled": false,
                  "installed": false,
                  "availability": "unavailable",
                  "models": [
                    {"slug": "missing-model", "name": "Missing", "isCustom": false, "capabilities": null}
                  ]
                }
              ]
            }
            """
        );

        var options = NativeServerConfigMapper.MapModelOptions(document.RootElement);

        Assert.Equal(2, options.Count);
        Assert.Equal(new NativeModelOption("Codex / GPT-5.5", "codex", "gpt-5.5"), options[0]);
        Assert.Equal(new NativeModelOption("Codex / GPT-5.4", "codex", "gpt-5.4"), options[1]);
    }
}
