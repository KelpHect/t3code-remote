using T3Code.Native.Client.Auth;

namespace T3Code.Native.App;

public static class NativeAppServices
{
    public static ISecretStore SecretStore { get; set; } = new MemorySecretStore();
}
