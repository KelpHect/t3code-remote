using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Config;

public sealed class NativeServerConfigClient(ExistingWsRpcSession session)
{
    public async Task<IReadOnlyList<NativeModelOption>> GetModelOptionsAsync(
        CancellationToken cancellationToken = default
    )
    {
        var config = await session
            .RequestAsync<JsonElement>(
                NativeMethods.ServerGetConfig,
                new { },
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);

        return NativeServerConfigMapper.MapModelOptions(config).ToArray();
    }
}

public sealed record NativeModelOption(string Label, string InstanceId, string Model);

public static class NativeServerConfigMapper
{
    public static IReadOnlyList<NativeModelOption> MapModelOptions(JsonElement config)
    {
        var options = new List<NativeModelOption>();
        if (!config.TryGetProperty("providers", out var providers) || providers.ValueKind != JsonValueKind.Array)
        {
            return options;
        }

        foreach (var provider in providers.EnumerateArray())
        {
            if (ReadBool(provider, "enabled") == false || ReadBool(provider, "installed") == false)
            {
                continue;
            }

            if (ReadString(provider, "availability") == "unavailable")
            {
                continue;
            }

            var instanceId = ReadString(provider, "instanceId");
            if (string.IsNullOrWhiteSpace(instanceId))
            {
                continue;
            }

            var providerName = ReadString(provider, "displayName")
                ?? ReadString(provider, "driver")
                ?? instanceId;
            if (!provider.TryGetProperty("models", out var models) || models.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var model in models.EnumerateArray())
            {
                var slug = ReadString(model, "slug");
                if (string.IsNullOrWhiteSpace(slug))
                {
                    continue;
                }

                var modelName = ReadString(model, "shortName")
                    ?? ReadString(model, "name")
                    ?? slug;
                options.Add(new NativeModelOption($"{providerName} / {modelName}", instanceId, slug));
            }
        }

        return options;
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }

    private static bool? ReadBool(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.True
            ? true
            : property.ValueKind == JsonValueKind.False
                ? false
                : null;
    }
}
