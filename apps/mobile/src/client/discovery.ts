export type BackendCandidateSource = "emulator" | "desktop" | "lan" | "manual";

export type ProbeFailureKind =
  | "timeout"
  | "connection-refused"
  | "invalid-response"
  | "blocked-cleartext"
  | "unknown-error";

export type ProbeStatus = "queued" | "probing" | "valid" | ProbeFailureKind;

export type MobilePlatform = "android" | "ios" | "web";

export interface BackendCandidate {
  readonly id: string;
  readonly url: string;
  readonly source: BackendCandidateSource;
  readonly label: string;
}

export interface SessionProbeResult {
  readonly candidate: BackendCandidate;
  readonly status: ProbeStatus;
  readonly authenticated: boolean;
  readonly sessionMethod?: string;
  readonly message: string;
  readonly checkedAt: number;
  readonly latencyMs?: number;
}

export interface SessionProbeOptions {
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

interface SessionPayload {
  readonly authenticated?: unknown;
  readonly auth?: unknown;
  readonly sessionMethod?: unknown;
}

const DEFAULT_PORT = "3773";
const DEFAULT_TIMEOUT_MS = 1500;

const PRIVATE_HOSTNAME_SUFFIXES = [".local"];
const defaultFetch: typeof fetch = (...args) => globalThis.fetch(...args);

const getWindow = () => (typeof window === "undefined" ? undefined : window);

export function normalizeBackendUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isAllowedBackendUrl(url)) return null;
    url.hash = "";
    url.search = "";
    url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isAllowedBackendUrl(url: URL): boolean {
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return isPrivateCleartextHost(url.hostname);
}

export function isPrivateCleartextHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!normalized) return false;
  if (normalized === "localhost" || normalized === "::1") return true;
  if (PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;

  const ipv4 = parseIpv4(normalized);
  if (!ipv4) return false;
  const [first, second] = ipv4;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  return false;
}

export function detectMobilePlatform(): MobilePlatform {
  const currentWindow = getWindow() as
    | (Window & {
        Capacitor?: {
          getPlatform?: () => string;
        };
      })
    | undefined;
  const capacitorPlatform = currentWindow?.Capacitor?.getPlatform?.();
  if (capacitorPlatform === "android" || capacitorPlatform === "ios") {
    return capacitorPlatform;
  }

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "web";
}

export function generateBackendCandidates(options?: {
  readonly platform?: MobilePlatform;
  readonly manualUrl?: string;
  readonly locationHostname?: string;
}): readonly BackendCandidate[] {
  const platform = options?.platform ?? detectMobilePlatform();
  const candidates: BackendCandidate[] = [];

  const add = (url: string, source: BackendCandidateSource, label: string) => {
    const normalized = normalizeBackendUrl(url);
    if (!normalized || candidates.some((candidate) => candidate.url === normalized)) return;
    candidates.push({
      id: normalized,
      url: normalized,
      source,
      label,
    });
  };

  if (platform === "android") {
    add(`http://10.0.2.2:${DEFAULT_PORT}`, "emulator", "Android emulator host");
  }

  add(`http://127.0.0.1:${DEFAULT_PORT}`, "desktop", "Local desktop");
  add(`http://localhost:${DEFAULT_PORT}`, "desktop", "Localhost");

  const hostname =
    options?.locationHostname ??
    (typeof window === "undefined" ? undefined : window.location.hostname);
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    add(`http://${hostname}:${DEFAULT_PORT}`, "lan", "Current network host");
  }

  if (options?.manualUrl) {
    add(options.manualUrl, "manual", "Manual backend");
  }

  return candidates;
}

export function classifyProbeError(error: unknown, candidate: BackendCandidate): ProbeFailureKind {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "timeout";
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("abort") || message.includes("timeout")) return "timeout";
  if (message.includes("cleartext") || message.includes("not permitted")) {
    return "blocked-cleartext";
  }
  if (
    candidate.url.startsWith("http://") &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    detectMobilePlatform() === "web"
  ) {
    return "blocked-cleartext";
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("connection refused") ||
    message.includes("econnrefused")
  ) {
    return "connection-refused";
  }
  return "unknown-error";
}

function describeFailure(status: ProbeFailureKind, candidate: BackendCandidate) {
  switch (status) {
    case "timeout":
      return "Timed out waiting for the auth session endpoint.";
    case "connection-refused":
      return `Could not reach ${candidate.label}.`;
    case "invalid-response":
      return "Endpoint responded, but it was not a T3 auth session response.";
    case "blocked-cleartext":
      return "Cleartext HTTP was blocked for this endpoint.";
    case "unknown-error":
      return "Probe failed with an unknown network error.";
  }
}

function looksLikeT3SessionPayload(payload: SessionPayload): payload is {
  readonly authenticated: boolean;
  readonly auth: unknown;
  readonly sessionMethod?: string;
} {
  return (
    typeof payload.authenticated === "boolean" &&
    typeof payload.auth === "object" &&
    payload.auth !== null
  );
}

export async function probeBackendCandidate(
  candidate: BackendCandidate,
  options?: SessionProbeOptions,
): Promise<SessionProbeResult> {
  const normalized = normalizeBackendUrl(candidate.url);
  if (!normalized) {
    return {
      candidate,
      status: "blocked-cleartext",
      authenticated: false,
      checkedAt: options?.now?.() ?? Date.now(),
      message: "Public cleartext HTTP is blocked. Use HTTPS or a private LAN/VPN host.",
    };
  }

  const startedAt = options?.now?.() ?? Date.now();
  const fetcher = options?.fetcher ?? defaultFetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetcher(`${candidate.url}/api/auth/session`, {
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });
    const payload = (await response.json()) as SessionPayload;
    const checkedAt = options?.now?.() ?? Date.now();

    if (!response.ok || !looksLikeT3SessionPayload(payload)) {
      return {
        candidate,
        status: "invalid-response",
        authenticated: false,
        checkedAt,
        latencyMs: checkedAt - startedAt,
        message: describeFailure("invalid-response", candidate),
      };
    }

    return {
      candidate,
      status: "valid",
      authenticated: payload.authenticated,
      sessionMethod: typeof payload.sessionMethod === "string" ? payload.sessionMethod : undefined,
      checkedAt,
      latencyMs: checkedAt - startedAt,
      message: payload.authenticated
        ? "Authenticated T3 backend found."
        : "T3 backend found; pairing required.",
    };
  } catch (error) {
    const status = classifyProbeError(error, candidate);
    const checkedAt = options?.now?.() ?? Date.now();
    return {
      candidate,
      status,
      authenticated: false,
      checkedAt,
      latencyMs: checkedAt - startedAt,
      message: describeFailure(status, candidate),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseIpv4(hostname: string): readonly [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    octets.push(value);
  }
  const [first, second, third, fourth] = octets;
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return null;
  }
  return [first, second, third, fourth];
}

export function isPrivateNetworkUrl(url: string) {
  const normalized = normalizeBackendUrl(url);
  if (!normalized) return false;
  return isPrivateCleartextHost(new URL(normalized).hostname);
}
