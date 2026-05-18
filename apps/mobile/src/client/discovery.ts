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

const PRIVATE_LAN_PREFIXES = ["192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19."];

const getWindow = () => (typeof window === "undefined" ? undefined : window);

export function normalizeBackendUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
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
  const startedAt = options?.now?.() ?? Date.now();
  const fetcher = options?.fetcher ?? fetch;
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

export function isPrivateNetworkUrl(url: string) {
  const normalized = normalizeBackendUrl(url);
  if (!normalized) return false;
  const hostname = new URL(normalized).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "10.0.2.2" ||
    PRIVATE_LAN_PREFIXES.some((prefix) => hostname.startsWith(prefix))
  );
}
