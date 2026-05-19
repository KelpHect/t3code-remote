import { issueWebSocketToken } from "@/client/auth";

import { ExistingWsProtocolError, ExistingWsTransport } from "./effectRpcTransport";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "auth-required"
  | "failed";

export interface RealtimeCredentials {
  readonly backendUrl: string;
  readonly sessionToken: string;
}

export interface RealtimeConnectionSnapshot {
  readonly status: RealtimeConnectionStatus;
  readonly attempt: number;
  readonly nextRetryDelayMs: number | null;
  readonly message: string;
  readonly updatedAt: number;
}

export interface RealtimeConnectionLoopOptions {
  readonly getCredentials: () => RealtimeCredentials | null;
  readonly onSnapshot: (snapshot: RealtimeConnectionSnapshot) => void;
  readonly issueToken?: typeof issueWebSocketToken;
  readonly createTransport?: (input: {
    readonly backendUrl: string;
    readonly wsToken: string;
  }) => RealtimeTransport;
  readonly isOnline?: () => boolean;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => RealtimeTimer;
  readonly clearTimer?: (timer: RealtimeTimer) => void;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly healthCheckIntervalMs?: number;
  readonly staleHeartbeatMs?: number;
}

export interface RealtimeTransport {
  readonly state: "idle" | "connecting" | "connected" | "closed" | "failed";
  connect(): Promise<void>;
  dispose(): void;
  isHeartbeatFresh(maxAgeMs?: number): boolean;
}

type RealtimeTimer = ReturnType<typeof setTimeout>;

const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 5_000;
const DEFAULT_STALE_HEARTBEAT_MS = 30_000;
const defaultSetTimer: NonNullable<RealtimeConnectionLoopOptions["setTimer"]> = (
  callback,
  delayMs,
) => globalThis.setTimeout(callback, delayMs);
const defaultClearTimer: NonNullable<RealtimeConnectionLoopOptions["clearTimer"]> = (timer) =>
  globalThis.clearTimeout(timer);

export function getReconnectDelay(input: {
  readonly attempt: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
}) {
  const baseDelayMs = input.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = input.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const exponent = Math.max(0, input.attempt - 1);
  return Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
}

export function createRealtimeConnectionSnapshot(input: {
  readonly status: RealtimeConnectionStatus;
  readonly attempt?: number;
  readonly nextRetryDelayMs?: number | null;
  readonly message?: string;
  readonly now?: () => number;
}): RealtimeConnectionSnapshot {
  return {
    status: input.status,
    attempt: input.attempt ?? 0,
    nextRetryDelayMs: input.nextRetryDelayMs ?? null,
    message: input.message ?? describeRealtimeStatus(input.status),
    updatedAt: input.now?.() ?? Date.now(),
  };
}

export class RealtimeConnectionLoop {
  private readonly options: Required<
    Pick<
      RealtimeConnectionLoopOptions,
      | "baseDelayMs"
      | "clearTimer"
      | "createTransport"
      | "healthCheckIntervalMs"
      | "isOnline"
      | "issueToken"
      | "maxDelayMs"
      | "now"
      | "setTimer"
      | "staleHeartbeatMs"
    >
  > &
    RealtimeConnectionLoopOptions;
  private running = false;
  private attempt = 0;
  private retryTimer: RealtimeTimer | null = null;
  private healthTimer: RealtimeTimer | null = null;
  private transport: RealtimeTransport | null = null;
  private generation = 0;

  constructor(options: RealtimeConnectionLoopOptions) {
    this.options = {
      baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
      clearTimer: options.clearTimer ?? defaultClearTimer,
      createTransport:
        options.createTransport ??
        ((input) =>
          new ExistingWsTransport({
            backendUrl: input.backendUrl,
            wsToken: input.wsToken,
          })),
      healthCheckIntervalMs: options.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS,
      isOnline:
        options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false),
      issueToken: options.issueToken ?? issueWebSocketToken,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
      now: options.now ?? Date.now,
      setTimer: options.setTimer ?? defaultSetTimer,
      staleHeartbeatMs: options.staleHeartbeatMs ?? DEFAULT_STALE_HEARTBEAT_MS,
      ...options,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.scheduleReconnect(0);
  }

  stop() {
    this.running = false;
    this.generation += 1;
    this.clearRetryTimer();
    this.clearHealthTimer();
    this.disposeTransport();
    this.attempt = 0;
    this.publish("idle");
  }

  reconnectNow() {
    if (!this.running) return;
    this.clearRetryTimer();
    this.disposeTransport();
    this.scheduleReconnect(0);
  }

  handleOffline() {
    if (!this.running) return;
    this.clearRetryTimer();
    this.clearHealthTimer();
    this.disposeTransport();
    this.publish("offline", {
      message: "Network is offline. Reconnect will resume when connectivity returns.",
    });
  }

  handleOnline() {
    if (!this.running) return;
    this.reconnectNow();
  }

  private scheduleReconnect(delayMs: number) {
    this.clearRetryTimer();
    this.retryTimer = this.options.setTimer(() => {
      this.retryTimer = null;
      void this.connect();
    }, delayMs);
  }

  private async connect() {
    if (!this.running) return;
    const generation = this.generation;

    if (!this.options.isOnline()) {
      this.handleOffline();
      return;
    }

    const credentials = this.options.getCredentials();
    if (!credentials) {
      this.publish("auth-required", {
        message: "Pair with the backend before starting realtime sync.",
      });
      return;
    }

    const status: RealtimeConnectionStatus = this.attempt === 0 ? "connecting" : "reconnecting";
    this.publish(status, {
      message:
        status === "connecting"
          ? "Opening realtime connection."
          : "Reconnecting realtime connection.",
    });

    try {
      const wsToken = await this.options.issueToken({
        backendUrl: credentials.backendUrl,
        sessionToken: credentials.sessionToken,
      });
      if (!this.running || generation !== this.generation) return;

      this.disposeTransport();
      const transport = this.options.createTransport({
        backendUrl: credentials.backendUrl,
        wsToken: wsToken.token,
      });
      this.transport = transport;
      await transport.connect();
      if (!this.running || generation !== this.generation) return;

      this.attempt = 0;
      this.publish("connected", {
        message: "Realtime connection is active.",
      });
      this.scheduleHealthCheck();
    } catch (error) {
      if (!this.running || generation !== this.generation) return;
      this.handleConnectFailure(error);
    }
  }

  private handleConnectFailure(error: unknown) {
    this.disposeTransport();
    const authRequired = isAuthRequiredError(error);
    if (authRequired) {
      this.publish("auth-required", {
        message: "Pairing expired. Re-pair with the backend.",
      });
      return;
    }

    this.attempt += 1;
    const delayMs = getReconnectDelay({
      attempt: this.attempt,
      baseDelayMs: this.options.baseDelayMs,
      maxDelayMs: this.options.maxDelayMs,
    });
    this.publish("failed", {
      nextRetryDelayMs: delayMs,
      message: "Realtime connection failed. Retrying shortly.",
    });
    this.scheduleReconnect(delayMs);
  }

  private scheduleHealthCheck() {
    this.clearHealthTimer();
    this.healthTimer = this.options.setTimer(() => {
      this.healthTimer = null;
      this.checkHealth();
    }, this.options.healthCheckIntervalMs);
  }

  private checkHealth() {
    if (!this.running) return;
    if (!this.options.isOnline()) {
      this.handleOffline();
      return;
    }
    if (!this.transport || this.transport.state === "closed" || this.transport.state === "failed") {
      this.attempt += 1;
      this.publish("reconnecting", {
        message: "Realtime connection dropped. Reconnecting.",
      });
      this.scheduleReconnect(
        getReconnectDelay({
          attempt: this.attempt,
          baseDelayMs: this.options.baseDelayMs,
          maxDelayMs: this.options.maxDelayMs,
        }),
      );
      return;
    }
    if (this.transport.isHeartbeatFresh(this.options.staleHeartbeatMs)) {
      this.scheduleHealthCheck();
      return;
    }
    this.attempt += 1;
    this.disposeTransport();
    this.publish("reconnecting", {
      message: "Realtime heartbeat went stale. Reconnecting.",
    });
    this.scheduleReconnect(
      getReconnectDelay({
        attempt: this.attempt,
        baseDelayMs: this.options.baseDelayMs,
        maxDelayMs: this.options.maxDelayMs,
      }),
    );
  }

  private publish(
    status: RealtimeConnectionStatus,
    options?: {
      readonly message?: string;
      readonly nextRetryDelayMs?: number | null;
    },
  ) {
    this.options.onSnapshot(
      createRealtimeConnectionSnapshot({
        status,
        attempt: this.attempt,
        message: options?.message,
        nextRetryDelayMs: options?.nextRetryDelayMs,
        now: this.options.now,
      }),
    );
  }

  private clearRetryTimer() {
    if (!this.retryTimer) return;
    this.options.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  private clearHealthTimer() {
    if (!this.healthTimer) return;
    this.options.clearTimer(this.healthTimer);
    this.healthTimer = null;
  }

  private disposeTransport() {
    this.transport?.dispose();
    this.transport = null;
  }
}

function describeRealtimeStatus(status: RealtimeConnectionStatus) {
  switch (status) {
    case "idle":
      return "Realtime sync is idle.";
    case "connecting":
      return "Opening realtime connection.";
    case "connected":
      return "Realtime connection is active.";
    case "reconnecting":
      return "Reconnecting realtime connection.";
    case "offline":
      return "Network is offline.";
    case "auth-required":
      return "Pair with the backend before realtime sync.";
    case "failed":
      return "Realtime connection failed.";
  }
}

function isAuthRequiredError(error: unknown) {
  if (error instanceof ExistingWsProtocolError) {
    return error.code === "missing-ws-token" || error.code === "invalid-backend-url";
  }
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("401") || message.includes("403") || message.includes("expired");
}
