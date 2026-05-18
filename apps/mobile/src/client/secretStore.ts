import { Capacitor, registerPlugin } from "@capacitor/core";

import { BearerSession, WebSocketToken } from "./auth";

export interface SecretStore {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
  readonly clear: () => Promise<void>;
}

export interface StoredAuthSession {
  readonly backendUrl: string;
  readonly bearerSession: BearerSession;
  readonly webSocketToken: WebSocketToken;
  readonly storedAt: string;
}

interface SecureStoragePlugin {
  readonly get: (options: { readonly key: string }) => Promise<{ readonly value?: string | null }>;
  readonly set: (options: { readonly key: string; readonly value: string }) => Promise<void>;
  readonly remove: (options: { readonly key: string }) => Promise<void>;
  readonly clear: () => Promise<void>;
}

const AUTH_SESSION_KEY = "t3.auth.session.v1";
const NativeSecureStorage = registerPlugin<SecureStoragePlugin>("T3SecureStorage");

export function createInMemorySecretStore(seed?: ReadonlyMap<string, string>): SecretStore {
  const values = new Map(seed);
  return {
    async clear() {
      values.clear();
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async remove(key) {
      values.delete(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
  };
}

export function createCapacitorSecretStore(plugin = NativeSecureStorage): SecretStore {
  return {
    async clear() {
      await plugin.clear();
    },
    async get(key) {
      const result = await plugin.get({ key });
      return result.value ?? null;
    },
    async remove(key) {
      await plugin.remove({ key });
    },
    async set(key, value) {
      await plugin.set({ key, value });
    },
  };
}

export function createDefaultSecretStore(options?: {
  readonly isNative?: boolean;
  readonly nativeStore?: SecretStore;
  readonly fallbackStore?: SecretStore;
}) {
  const isNative = options?.isNative ?? Capacitor.isNativePlatform();
  if (isNative) return options?.nativeStore ?? createCapacitorSecretStore();
  return options?.fallbackStore ?? createInMemorySecretStore();
}

function isBearerSession(payload: unknown): payload is BearerSession {
  const candidate = payload as Partial<BearerSession>;
  return (
    candidate.authenticated === true &&
    (candidate.role === "owner" || candidate.role === "client") &&
    candidate.sessionMethod === "bearer-session-token" &&
    typeof candidate.expiresAt === "string" &&
    typeof candidate.sessionToken === "string" &&
    candidate.sessionToken.trim().length > 0
  );
}

function isWebSocketToken(payload: unknown): payload is WebSocketToken {
  const candidate = payload as Partial<WebSocketToken>;
  return (
    typeof candidate.expiresAt === "string" &&
    typeof candidate.token === "string" &&
    candidate.token.trim().length > 0
  );
}

function isStoredAuthSession(payload: unknown): payload is StoredAuthSession {
  const candidate = payload as Partial<StoredAuthSession>;
  return (
    typeof candidate.backendUrl === "string" &&
    candidate.backendUrl.trim().length > 0 &&
    typeof candidate.storedAt === "string" &&
    isBearerSession(candidate.bearerSession) &&
    isWebSocketToken(candidate.webSocketToken)
  );
}

export async function saveAuthSession(store: SecretStore, session: StoredAuthSession) {
  await store.set(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function loadAuthSession(store: SecretStore): Promise<StoredAuthSession | null> {
  const raw = await store.get(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as unknown;
    return isStoredAuthSession(payload) ? payload : null;
  } catch {
    return null;
  }
}

export async function clearAuthSession(store: SecretStore) {
  await store.remove(AUTH_SESSION_KEY);
}

export const defaultSecretStore = createDefaultSecretStore();
