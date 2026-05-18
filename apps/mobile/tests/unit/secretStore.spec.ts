import { describe, expect, test, vi } from "vitest";

import {
  clearAuthSession,
  createCapacitorSecretStore,
  createDefaultSecretStore,
  createInMemorySecretStore,
  loadAuthSession,
  saveAuthSession,
} from "@/client/secretStore";

const storedSession = {
  backendUrl: "http://127.0.0.1:3773",
  bearerSession: {
    authenticated: true,
    role: "client",
    sessionMethod: "bearer-session-token",
    expiresAt: "2026-05-18T20:00:00.000Z",
    sessionToken: "session-token",
  },
  webSocketToken: {
    token: "ws-token",
    expiresAt: "2026-05-18T20:01:00.000Z",
  },
  storedAt: "2026-05-18T19:59:00.000Z",
} as const;

describe("mobile secret store", () => {
  test("stores auth sessions through the injected secret store", async () => {
    const store = createInMemorySecretStore();

    await saveAuthSession(store, storedSession);

    await expect(loadAuthSession(store)).resolves.toEqual(storedSession);
  });

  test("clears stored auth sessions", async () => {
    const store = createInMemorySecretStore();

    await saveAuthSession(store, storedSession);
    await clearAuthSession(store);

    await expect(loadAuthSession(store)).resolves.toBeNull();
  });

  test("ignores malformed persisted auth payloads", async () => {
    const store = createInMemorySecretStore(
      new Map([["t3.auth.session.v1", JSON.stringify({ sessionToken: "loose-token" })]]),
    );

    await expect(loadAuthSession(store)).resolves.toBeNull();
  });

  test("uses native Capacitor storage on native platforms", async () => {
    const nativeStore = createInMemorySecretStore();
    const fallbackStore = createInMemorySecretStore();
    const store = createDefaultSecretStore({
      fallbackStore,
      isNative: true,
      nativeStore,
    });

    await store.set("secret", "native-value");

    await expect(nativeStore.get("secret")).resolves.toBe("native-value");
    await expect(fallbackStore.get("secret")).resolves.toBeNull();
  });

  test("uses memory fallback on web without touching localStorage", async () => {
    const localStorageSpy = vi.spyOn(window.localStorage, "setItem");
    const store = createDefaultSecretStore({ isNative: false });

    await store.set("secret", "memory-value");

    await expect(store.get("secret")).resolves.toBe("memory-value");
    expect(localStorageSpy).not.toHaveBeenCalled();
  });

  test("wraps the Capacitor secure storage plugin", async () => {
    const values = new Map<string, string>();
    const plugin = {
      async clear() {
        values.clear();
      },
      async get({ key }: { readonly key: string }) {
        return { value: values.get(key) ?? null };
      },
      async remove({ key }: { readonly key: string }) {
        values.delete(key);
      },
      async set({ key, value }: { readonly key: string; readonly value: string }) {
        values.set(key, value);
      },
    };
    const store = createCapacitorSecretStore(plugin);

    await store.set("secret", "plugin-value");
    await expect(store.get("secret")).resolves.toBe("plugin-value");
    await store.remove("secret");
    await expect(store.get("secret")).resolves.toBeNull();
  });
});
