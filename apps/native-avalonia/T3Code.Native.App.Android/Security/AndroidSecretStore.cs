using System;
using System.Threading;
using System.Threading.Tasks;
using System.Text;
using Android.Content;
using Android.Security.Keystore;
using Java.Security;
using Javax.Crypto;
using Javax.Crypto.Spec;
using T3Code.Native.Client.Auth;

namespace T3Code.Native.App.Android.Security;

public sealed class AndroidSecretStore(Context context) : ISecretStore
{
    private const string KeyAlias = "codes.t3.nativeapp.bearer_tokens.v1";
    private const string PreferencesName = "t3_code_native_secrets";
    private const string CipherTransformation = "AES/GCM/NoPadding";

    public Task SaveBearerTokenAsync(
        Uri baseUri,
        string bearerToken,
        CancellationToken cancellationToken = default
    )
    {
        var cipher = Cipher.GetInstance(CipherTransformation)
            ?? throw new InvalidOperationException("AES/GCM cipher is unavailable.");
        cipher.Init(CipherMode.EncryptMode, GetOrCreateKey());
        var iv = cipher.GetIV() ?? throw new InvalidOperationException("Cipher did not create an IV.");
        var encrypted = cipher.DoFinal(Encoding.UTF8.GetBytes(bearerToken))
            ?? throw new InvalidOperationException("Token encryption failed.");

        Preferences.Edit()
            ?.PutString(PreferenceKey(baseUri), $"{Convert.ToBase64String(iv)}.{Convert.ToBase64String(encrypted)}")
            ?.Apply();
        return Task.CompletedTask;
    }

    public Task<string?> GetBearerTokenAsync(
        Uri baseUri,
        CancellationToken cancellationToken = default
    )
    {
        var stored = Preferences.GetString(PreferenceKey(baseUri), null);
        if (string.IsNullOrWhiteSpace(stored))
        {
            return Task.FromResult<string?>(null);
        }

        var parts = stored.Split('.', 2);
        if (parts.Length != 2)
        {
            return Task.FromResult<string?>(null);
        }

        var cipher = Cipher.GetInstance(CipherTransformation)
            ?? throw new InvalidOperationException("AES/GCM cipher is unavailable.");
        cipher.Init(
            CipherMode.DecryptMode,
            GetOrCreateKey(),
            new GCMParameterSpec(128, Convert.FromBase64String(parts[0]))
        );
        var decrypted = cipher.DoFinal(Convert.FromBase64String(parts[1]))
            ?? throw new InvalidOperationException("Token decryption failed.");
        return Task.FromResult<string?>(Encoding.UTF8.GetString(decrypted));
    }

    public Task ClearBearerTokenAsync(Uri baseUri, CancellationToken cancellationToken = default)
    {
        Preferences.Edit()?.Remove(PreferenceKey(baseUri))?.Apply();
        return Task.CompletedTask;
    }

    private ISharedPreferences Preferences =>
        context.GetSharedPreferences(PreferencesName, FileCreationMode.Private)
        ?? throw new InvalidOperationException("Android shared preferences are unavailable.");

    private static string PreferenceKey(Uri baseUri) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(baseUri.GetLeftPart(UriPartial.Authority)));

    private static IKey GetOrCreateKey()
    {
        var keyStore = KeyStore.GetInstance("AndroidKeyStore")
            ?? throw new InvalidOperationException("Android KeyStore is unavailable.");
        keyStore.Load(null);

        if (!keyStore.ContainsAlias(KeyAlias))
        {
            var keyGenerator = KeyGenerator.GetInstance(
                    KeyProperties.KeyAlgorithmAes,
                    "AndroidKeyStore"
                )
                ?? throw new InvalidOperationException("Android AES key generator is unavailable.");
            var spec = new KeyGenParameterSpec.Builder(
                    KeyAlias,
                    KeyStorePurpose.Encrypt | KeyStorePurpose.Decrypt
                )
                .SetBlockModes(KeyProperties.BlockModeGcm)
                ?.SetEncryptionPaddings(KeyProperties.EncryptionPaddingNone)
                ?.SetUserAuthenticationRequired(false)
                ?.Build();

            keyGenerator.Init(spec);
            keyGenerator.GenerateKey();
        }

        return keyStore.GetKey(KeyAlias, null)
            ?? throw new InvalidOperationException("Android KeyStore key is unavailable.");
    }
}
