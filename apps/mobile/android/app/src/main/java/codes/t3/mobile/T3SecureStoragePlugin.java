package codes.t3.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "T3SecureStorage")
public class T3SecureStoragePlugin extends Plugin {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "codes.t3.mobile.secret-store.v1";
    private static final String PREFS_NAME = "codes.t3.mobile.secure-storage.v1";
    private static final String CIPHER_ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (isBlank(key) || value == null) {
            call.reject("SECRET_INVALID_INPUT", "SECRET_INVALID_INPUT");
            return;
        }

        try {
            prefs().edit().putString(key, encrypt(value)).apply();
            call.resolve();
        } catch (Exception exception) {
            call.reject("SECRET_STORE_FAILED", exception);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (isBlank(key)) {
            call.reject("SECRET_INVALID_INPUT", "SECRET_INVALID_INPUT");
            return;
        }

        String encrypted = prefs().getString(key, null);
        JSObject result = new JSObject();
        if (encrypted == null) {
            result.put("value", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            result.put("value", decrypt(encrypted));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("SECRET_DECRYPT_FAILED", exception);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (isBlank(key)) {
            call.reject("SECRET_INVALID_INPUT", "SECRET_INVALID_INPUT");
            return;
        }

        prefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs().edit().clear().apply();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return encode(iv) + ":" + encode(encrypted);
    }

    private String decrypt(String storedValue) throws Exception {
        String[] parts = storedValue.split(":", 2);
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid encrypted value.");
        }

        Cipher cipher = Cipher.getInstance(CIPHER_ALGORITHM);
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            new GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(parts[0], Base64.NO_WRAP))
        );
        byte[] decrypted = cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP));
        return new String(decrypted, StandardCharsets.UTF_8);
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec keySpec = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build();
        keyGenerator.init(keySpec);
        return keyGenerator.generateKey();
    }

    private static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.NO_WRAP);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
