import { normalizeBackendUrl } from "./discovery";

export interface PairingTarget {
  readonly backendUrl: string;
  readonly credential: string;
}

export interface BearerSession {
  readonly authenticated: true;
  readonly role: "owner" | "client";
  readonly sessionMethod: "bearer-session-token";
  readonly expiresAt: string;
  readonly sessionToken: string;
}

export interface WebSocketToken {
  readonly token: string;
  readonly expiresAt: string;
}

export interface BootstrapBearerSessionOptions {
  readonly backendUrl: string;
  readonly pairingInput: string;
  readonly fetcher?: typeof fetch;
}

export interface IssueWebSocketTokenOptions {
  readonly backendUrl: string;
  readonly sessionToken: string;
  readonly fetcher?: typeof fetch;
}

const PAIRING_TOKEN_PARAM = "token";
const PAIRING_HOST_PARAM = "host";

const defaultFetch: typeof fetch = (...args) => globalThis.fetch(...args);

async function readJsonPayload(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  const candidate = payload as { readonly error?: unknown };
  return typeof candidate?.error === "string" && candidate.error.trim().length > 0
    ? candidate.error
    : fallback;
}

function extractPairingToken(url: URL) {
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const hashToken = hashParams.get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  if (hashToken) return hashToken;

  const searchToken = url.searchParams.get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  return searchToken || null;
}

function parsePairingUrl(input: string) {
  if (!/^https?:\/\//i.test(input)) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function resolveBackendUrlFromPairingUrl(pairingUrl: URL, fallbackBackendUrl: string) {
  const hostedBackendUrl = pairingUrl.searchParams.get(PAIRING_HOST_PARAM)?.trim();
  if (hostedBackendUrl) {
    const normalizedHostedBackendUrl = normalizeBackendUrl(hostedBackendUrl);
    if (normalizedHostedBackendUrl) return normalizedHostedBackendUrl;
  }

  const normalizedPairingUrl = normalizeBackendUrl(pairingUrl.toString());
  if (!normalizedPairingUrl) return fallbackBackendUrl;

  const pairingBackendUrl = new URL(normalizedPairingUrl);
  const fallbackUrl = new URL(fallbackBackendUrl);
  if (
    isLoopbackHostname(pairingBackendUrl.hostname) &&
    !isLoopbackHostname(fallbackUrl.hostname) &&
    pairingBackendUrl.port === fallbackUrl.port
  ) {
    return fallbackBackendUrl;
  }

  return normalizedPairingUrl;
}

export function resolvePairingTarget(input: {
  readonly backendUrl: string;
  readonly pairingInput: string;
}): PairingTarget {
  const fallbackBackendUrl = normalizeBackendUrl(input.backendUrl);
  if (!fallbackBackendUrl) {
    throw new Error("Select a reachable backend before pairing.");
  }

  const trimmedInput = input.pairingInput.trim();
  if (!trimmedInput) {
    throw new Error("Enter a pairing token or URL.");
  }

  const pairingUrl = parsePairingUrl(trimmedInput);
  if (!pairingUrl) {
    return {
      backendUrl: fallbackBackendUrl,
      credential: trimmedInput,
    };
  }

  const credential = extractPairingToken(pairingUrl);
  if (!credential) {
    throw new Error("Pairing URL is missing its token.");
  }

  return {
    backendUrl: resolveBackendUrlFromPairingUrl(pairingUrl, fallbackBackendUrl),
    credential,
  };
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

export async function bootstrapBearerSession(
  options: BootstrapBearerSessionOptions,
): Promise<BearerSession> {
  const target = resolvePairingTarget({
    backendUrl: options.backendUrl,
    pairingInput: options.pairingInput,
  });
  const fetcher = options.fetcher ?? defaultFetch;
  const response = await fetcher(`${target.backendUrl}/api/auth/bootstrap/bearer`, {
    body: JSON.stringify({
      credential: target.credential,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw new Error(
      errorMessageFromPayload(payload, `Pairing failed with status ${response.status}.`),
    );
  }

  if (!isBearerSession(payload)) {
    throw new Error("Pairing response did not include a bearer session token.");
  }

  return payload;
}

export async function issueWebSocketToken(
  options: IssueWebSocketTokenOptions,
): Promise<WebSocketToken> {
  const backendUrl = normalizeBackendUrl(options.backendUrl);
  if (!backendUrl) {
    throw new Error("Select a reachable backend before requesting a WebSocket token.");
  }

  const sessionToken = options.sessionToken.trim();
  if (!sessionToken) {
    throw new Error("Pair with the backend before requesting a WebSocket token.");
  }

  const fetcher = options.fetcher ?? defaultFetch;
  const response = await fetcher(`${backendUrl}/api/auth/ws-token`, {
    headers: {
      authorization: `Bearer ${sessionToken}`,
    },
    method: "POST",
  });
  const payload = await readJsonPayload(response);

  if (!response.ok) {
    throw new Error(
      errorMessageFromPayload(
        payload,
        `WebSocket token request failed with status ${response.status}.`,
      ),
    );
  }

  if (!isWebSocketToken(payload)) {
    throw new Error("WebSocket token response did not include a token.");
  }

  return payload;
}
