import { computed, ref } from "vue";

import { BearerSession, WebSocketToken } from "./auth";
import {
  BackendCandidate,
  generateBackendCandidates,
  probeBackendCandidate,
  SessionProbeResult,
} from "./discovery";
import {
  createRealtimeConnectionSnapshot,
  RealtimeConnectionLoop,
  RealtimeConnectionSnapshot,
} from "./ws/realtimeConnection";

export type DiscoveryState = "idle" | "scanning" | "found" | "not-found";

const manualUrl = ref("");
const candidates = ref<readonly BackendCandidate[]>([]);
const probeResults = ref<readonly SessionProbeResult[]>([]);
const selectedBackend = ref<SessionProbeResult | null>(null);
const pairedBackendUrl = ref<string | null>(null);
const bearerSession = ref<BearerSession | null>(null);
const webSocketToken = ref<WebSocketToken | null>(null);
const realtimeConnection = ref<RealtimeConnectionSnapshot>(
  createRealtimeConnectionSnapshot({ status: "idle" }),
);
const discoveryState = ref<DiscoveryState>("idle");
const lastScanStartedAt = ref<number | null>(null);
const lastScanFinishedAt = ref<number | null>(null);
const scanGeneration = ref(0);
let scanTimer: number | undefined;
let listenersAttached = false;
let realtimeLoop: RealtimeConnectionLoop | null = null;

const candidateCount = computed(() => candidates.value.length);
const validBackends = computed(() =>
  probeResults.value.filter((result) => result.status === "valid"),
);
const lastError = computed(() => {
  const firstFailure = probeResults.value.find((result) => result.status !== "valid");
  return firstFailure?.message ?? "No scan has run yet.";
});
const statusText = computed(() => {
  if (bearerSession.value) {
    switch (realtimeConnection.value.status) {
      case "connected":
        return "Realtime";
      case "connecting":
        return "Connecting";
      case "reconnecting":
        return "Reconnecting";
      case "offline":
        return "Offline";
      case "auth-required":
        return "Auth required";
      case "failed":
        return "Connection failed";
      case "idle":
        break;
    }
  }
  if (webSocketToken.value) return "Ready";
  if (bearerSession.value) return "Paired";
  if (selectedBackend.value) {
    if (discoveryState.value === "scanning") return "Checking live";
    return selectedBackend.value.authenticated ? "Connected" : "Backend found";
  }
  if (discoveryState.value === "scanning") return "Scanning private network";
  if (discoveryState.value === "not-found") return "No backend found";
  return "Not connected";
});
const statusDetail = computed(() => {
  if (bearerSession.value && realtimeConnection.value.status !== "idle") {
    return realtimeConnection.value.message;
  }
  if (bearerSession.value && webSocketToken.value) {
    return `Realtime token ready for ${pairedBackendUrl.value ?? selectedBackend.value?.candidate.url ?? "paired backend"}`;
  }
  if (bearerSession.value) {
    return `Paired with ${pairedBackendUrl.value ?? selectedBackend.value?.candidate.url ?? "backend"}`;
  }
  if (selectedBackend.value) {
    const prefix =
      discoveryState.value === "scanning" ? "Refreshing" : selectedBackend.value.candidate.label;
    return `${prefix} at ${selectedBackend.value.candidate.url}`;
  }
  if (discoveryState.value === "scanning") {
    return `${candidateCount.value} candidate${candidateCount.value === 1 ? "" : "s"} queued.`;
  }
  if (probeResults.value.length > 0) return lastError.value;
  return "Waiting for the first discovery scan.";
});

async function scanBackends() {
  const generation = scanGeneration.value + 1;
  scanGeneration.value = generation;
  discoveryState.value = "scanning";
  lastScanStartedAt.value = Date.now();

  const nextCandidates = generateBackendCandidates({ manualUrl: manualUrl.value });
  candidates.value = nextCandidates;
  probeResults.value = nextCandidates.map((candidate) => ({
    candidate,
    status: "queued",
    authenticated: false,
    checkedAt: Date.now(),
    message: "Queued for discovery.",
  }));

  const results: SessionProbeResult[] = [];
  let foundCurrentScan = false;
  for (const candidate of nextCandidates) {
    if (scanGeneration.value !== generation) return;
    probeResults.value = probeResults.value.map((result) =>
      result.candidate.id === candidate.id
        ? { ...result, status: "probing", message: "Checking auth session endpoint." }
        : result,
    );
    const result = await probeBackendCandidate(candidate);
    if (scanGeneration.value !== generation) return;
    results.push(result);
    probeResults.value = probeResults.value.map((existing) =>
      existing.candidate.id === candidate.id ? result : existing,
    );
    if (result.status === "valid") {
      selectedBackend.value = result;
      discoveryState.value = "found";
      foundCurrentScan = true;
      break;
    }
  }

  if (!foundCurrentScan) {
    selectedBackend.value = null;
    discoveryState.value = "not-found";
  }
  lastScanFinishedAt.value = Date.now();
}

function scanIfVisible() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void scanBackends();
}

function attachRealtimeScanListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener("focus", scanIfVisible);
  window.addEventListener("online", scanIfVisible);
  document.addEventListener("visibilitychange", scanIfVisible);
}

function detachRealtimeScanListeners() {
  if (!listenersAttached || typeof window === "undefined") return;
  listenersAttached = false;
  window.removeEventListener("focus", scanIfVisible);
  window.removeEventListener("online", scanIfVisible);
  document.removeEventListener("visibilitychange", scanIfVisible);
}

function startDiscoveryLoop() {
  if (scanTimer !== undefined) return;
  void scanBackends();
  attachRealtimeScanListeners();
  scanTimer = window.setInterval(() => {
    scanIfVisible();
  }, 3000);
}

function stopDiscoveryLoop() {
  if (scanTimer === undefined) return;
  window.clearInterval(scanTimer);
  scanTimer = undefined;
  detachRealtimeScanListeners();
}

function setManualUrl(value: string) {
  manualUrl.value = value;
}

function setBearerSession(session: BearerSession | null) {
  bearerSession.value = session;
  if (!session) {
    pairedBackendUrl.value = null;
    webSocketToken.value = null;
    stopRealtimeConnectionLoop();
  }
}

function setWebSocketToken(token: WebSocketToken | null) {
  webSocketToken.value = token;
}

function setAuthSession(input: {
  readonly backendUrl: string;
  readonly bearerSession: BearerSession;
  readonly webSocketToken: WebSocketToken;
}) {
  pairedBackendUrl.value = input.backendUrl;
  bearerSession.value = input.bearerSession;
  webSocketToken.value = input.webSocketToken;
  startRealtimeConnectionLoop();
}

function clearAuthState() {
  pairedBackendUrl.value = null;
  bearerSession.value = null;
  webSocketToken.value = null;
  stopRealtimeConnectionLoop();
}

function startRealtimeConnectionLoop() {
  if (realtimeLoop) return;
  realtimeLoop = new RealtimeConnectionLoop({
    getCredentials: () => {
      if (!pairedBackendUrl.value || !bearerSession.value) return null;
      return {
        backendUrl: pairedBackendUrl.value,
        sessionToken: bearerSession.value.sessionToken,
      };
    },
    onSnapshot: (snapshot) => {
      realtimeConnection.value = snapshot;
    },
  });
  realtimeLoop.start();
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleRealtimeOnline);
    window.addEventListener("offline", handleRealtimeOffline);
  }
}

function stopRealtimeConnectionLoop() {
  if (!realtimeLoop) return;
  realtimeLoop.stop();
  realtimeLoop = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("online", handleRealtimeOnline);
    window.removeEventListener("offline", handleRealtimeOffline);
  }
}

function handleRealtimeOnline() {
  realtimeLoop?.handleOnline();
}

function handleRealtimeOffline() {
  realtimeLoop?.handleOffline();
}

export function useConnectionState() {
  return {
    bearerSession,
    candidateCount,
    candidates,
    clearAuthState,
    discoveryState,
    lastError,
    lastScanFinishedAt,
    lastScanStartedAt,
    manualUrl,
    pairedBackendUrl,
    probeResults,
    realtimeConnection,
    scanBackends,
    selectedBackend,
    setAuthSession,
    setBearerSession,
    setManualUrl,
    setWebSocketToken,
    startDiscoveryLoop,
    statusDetail,
    statusText,
    stopDiscoveryLoop,
    validBackends,
    webSocketToken,
  };
}
