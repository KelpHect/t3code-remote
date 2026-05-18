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

export interface BootstrapBearerSessionOptions {
  readonly backendUrl: string;
  readonly pairingInput: string;
  readonly fetcher?: typeof fetch;
}

const PAIRING_TOKEN_PARAM = "token";

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { readonly error?: unknown };
    return typeof payload.error === "string" && payload.error.trim().length > 0
      ? payload.error
      : fallback;
  } catch {
    return fallback;
  }
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
    backendUrl: normalizeBackendUrl(pairingUrl.toString()) ?? fallbackBackendUrl,
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

export async function bootstrapBearerSession(
  options: BootstrapBearerSessionOptions,
): Promise<BearerSession> {
  const target = resolvePairingTarget({
    backendUrl: options.backendUrl,
    pairingInput: options.pairingInput,
  });
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${target.backendUrl}/api/auth/bootstrap/bearer`, {
    body: JSON.stringify({
      credential: target.credential,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Pairing failed with status ${response.status}.`),
    );
  }

  if (!isBearerSession(payload)) {
    throw new Error("Pairing response did not include a bearer session token.");
  }

  return payload;
}
