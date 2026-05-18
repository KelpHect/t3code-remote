import { normalizeBackendUrl } from "@/client/discovery";

export type ExistingWsConnectionState = "idle" | "connecting" | "connected" | "closed" | "failed";

export interface ExistingWsTransportOptions {
  readonly backendUrl: string;
  readonly wsToken: string;
  readonly WebSocketCtor?: WebSocketConstructor;
  readonly heartbeatIntervalMs?: number;
  readonly now?: () => number;
}

export interface ExistingWsRequestOptions {
  readonly signal?: AbortSignal;
}

export interface ExistingWsSubscriptionOptions {
  readonly signal?: AbortSignal;
  readonly onComplete?: () => void;
  readonly onError?: (error: ExistingWsProtocolError) => void;
}

export interface ExistingWsRequestFrame {
  readonly _tag: "Request";
  readonly id: string;
  readonly tag: string;
  readonly payload: unknown;
  readonly headers: readonly [string, string][];
}

interface ExistingWsAckFrame {
  readonly _tag: "Ack";
  readonly requestId: string;
}

interface ExistingWsInterruptFrame {
  readonly _tag: "Interrupt";
  readonly requestId: string;
}

interface ExistingWsPingFrame {
  readonly _tag: "Ping";
}

type ExistingWsClientFrame =
  | ExistingWsRequestFrame
  | ExistingWsAckFrame
  | ExistingWsInterruptFrame
  | ExistingWsPingFrame;

interface ExistingWsChunkFrame {
  readonly _tag: "Chunk";
  readonly requestId: string;
  readonly values: readonly unknown[];
}

interface ExistingWsExitFrame {
  readonly _tag: "Exit";
  readonly requestId: string;
  readonly exit: ExistingWsExit;
}

interface ExistingWsDefectFrame {
  readonly _tag: "Defect";
  readonly defect: unknown;
}

interface ExistingWsClientProtocolErrorFrame {
  readonly _tag: "ClientProtocolError";
  readonly error: unknown;
}

interface ExistingWsPongFrame {
  readonly _tag: "Pong";
}

type ExistingWsServerFrame =
  | ExistingWsChunkFrame
  | ExistingWsExitFrame
  | ExistingWsDefectFrame
  | ExistingWsClientProtocolErrorFrame
  | ExistingWsPongFrame;

type ExistingWsExit =
  | {
      readonly _tag: "Success";
      readonly value: unknown;
    }
  | {
      readonly _tag: "Failure";
      readonly cause: unknown;
    };

interface PendingRequest<TValue> {
  readonly id: string;
  readonly stream: boolean;
  readonly listener?: (value: TValue) => void;
  readonly resolve: (value: TValue) => void;
  readonly reject: (error: ExistingWsProtocolError) => void;
  readonly onComplete?: () => void;
  readonly onError?: (error: ExistingWsProtocolError) => void;
}

interface WebSocketLike {
  readonly readyState: number;
  addEventListener(
    type: "open",
    listener: (event: Event) => void,
    options?: WebSocketListenerOptions,
  ): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
    options?: WebSocketListenerOptions,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: Event) => void,
    options?: WebSocketListenerOptions,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: CloseEvent) => void,
    options?: WebSocketListenerOptions,
  ): void;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

type WebSocketListenerOptions = boolean | { readonly once?: boolean };
type WebSocketConstructor = new (url: string) => WebSocketLike;

const OPEN_STATE = 1;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;

export class ExistingWsProtocolError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly causePayload: unknown;

  constructor(input: {
    readonly code: string;
    readonly message: string;
    readonly retryable?: boolean;
    readonly causePayload?: unknown;
  }) {
    super(input.message);
    this.name = "ExistingWsProtocolError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.causePayload = input.causePayload;
  }
}

export function resolveExistingWsUrl(input: {
  readonly backendUrl: string;
  readonly wsToken: string;
}) {
  const backendUrl = normalizeBackendUrl(input.backendUrl);
  if (!backendUrl) {
    throw new ExistingWsProtocolError({
      code: "invalid-backend-url",
      message: "Select a reachable backend before opening /ws.",
    });
  }

  const token = input.wsToken.trim();
  if (!token) {
    throw new ExistingWsProtocolError({
      code: "missing-ws-token",
      message: "Pair with the backend before opening /ws.",
    });
  }

  const url = new URL(backendUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.searchParams.set("wsToken", token);
  return url.toString();
}

export class ExistingWsTransport {
  private readonly options: Required<
    Pick<ExistingWsTransportOptions, "heartbeatIntervalMs" | "now">
  > &
    ExistingWsTransportOptions;
  private readonly socketUrl: string;
  private socket: WebSocketLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private nextRequestId = 1n;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Map<string, PendingRequest<unknown>>();
  private disposed = false;
  private lastHeartbeatPongAt = 0;
  state: ExistingWsConnectionState = "idle";

  constructor(options: ExistingWsTransportOptions) {
    this.options = {
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      now: options.now ?? Date.now,
      ...options,
    };
    this.socketUrl = resolveExistingWsUrl({
      backendUrl: options.backendUrl,
      wsToken: options.wsToken,
    });
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      throw new ExistingWsProtocolError({
        code: "transport-disposed",
        message: "WebSocket transport is disposed.",
      });
    }
    if (this.socket?.readyState === OPEN_STATE) return;
    if (this.connectPromise) return this.connectPromise;

    this.state = "connecting";
    const WebSocketCtor: WebSocketConstructor =
      this.options.WebSocketCtor ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocketCtor(this.socketUrl);
      this.socket = socket;
      socket.addEventListener(
        "open",
        () => {
          this.state = "connected";
          this.startHeartbeat();
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          const error = new ExistingWsProtocolError({
            code: "socket-error",
            message: "Unable to connect to the T3 backend WebSocket.",
            retryable: true,
          });
          this.state = "failed";
          this.failPending(error);
          reject(error);
        },
        { once: true },
      );
      socket.addEventListener(
        "close",
        (event) => {
          this.stopHeartbeat();
          if (!this.disposed && this.state !== "failed") {
            this.state = "closed";
          }
          this.failPending(
            new ExistingWsProtocolError({
              code: "socket-closed",
              message: formatSocketClose(event),
              retryable: !this.disposed,
              causePayload: {
                code: event.code,
                reason: event.reason,
              },
            }),
          );
        },
        { once: true },
      );
      socket.addEventListener("message", (event) => {
        this.handleMessage(event.data);
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async request<TValue = unknown>(
    method: string,
    payload: unknown = {},
    options?: ExistingWsRequestOptions,
  ): Promise<TValue> {
    await this.connect();
    return await new Promise<TValue>((resolve, reject) => {
      const id = this.sendRequest(method, payload);
      const abort = () => {
        this.cancel(id);
        reject(
          new ExistingWsProtocolError({
            code: "request-aborted",
            message: `Request ${method} was aborted.`,
          }),
        );
      };
      if (options?.signal?.aborted) {
        abort();
        return;
      }
      options?.signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        id,
        stream: false,
        resolve: (value) => {
          options?.signal?.removeEventListener("abort", abort);
          resolve(value as TValue);
        },
        reject: (error) => {
          options?.signal?.removeEventListener("abort", abort);
          reject(error);
        },
      });
    });
  }

  subscribe<TValue = unknown>(
    method: string,
    payload: unknown,
    listener: (value: TValue) => void,
    options?: ExistingWsSubscriptionOptions,
  ): () => void {
    let requestId: string | null = null;
    let active = true;
    const start = async () => {
      try {
        await this.connect();
        if (!active) return;
        requestId = this.sendRequest(method, payload);
        this.pending.set(requestId, {
          id: requestId,
          stream: true,
          listener: listener as (value: unknown) => void,
          resolve: () => {
            options?.onComplete?.();
          },
          reject: (error) => {
            options?.onError?.(error);
          },
          onComplete: options?.onComplete,
          onError: options?.onError,
        });
      } catch (error) {
        const protocolError = toProtocolError(error);
        options?.onError?.(protocolError);
      }
    };
    void start();

    const abort = () => {
      active = false;
      if (requestId) this.cancel(requestId);
    };
    if (options?.signal?.aborted) {
      abort();
    } else {
      options?.signal?.addEventListener("abort", abort, { once: true });
    }

    return () => {
      options?.signal?.removeEventListener("abort", abort);
      abort();
    };
  }

  async requestStream<TValue = unknown>(
    method: string,
    payload: unknown,
    listener: (value: TValue) => void,
    options?: ExistingWsRequestOptions,
  ): Promise<void> {
    await this.connect();
    return await new Promise<void>((resolve, reject) => {
      const id = this.sendRequest(method, payload);
      const abort = () => {
        this.cancel(id);
        reject(
          new ExistingWsProtocolError({
            code: "request-aborted",
            message: `Stream request ${method} was aborted.`,
          }),
        );
      };
      if (options?.signal?.aborted) {
        abort();
        return;
      }
      options?.signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(id, {
        id,
        stream: true,
        listener: listener as (value: unknown) => void,
        resolve: () => {
          options?.signal?.removeEventListener("abort", abort);
          resolve();
        },
        reject: (error) => {
          options?.signal?.removeEventListener("abort", abort);
          reject(error);
        },
      });
    });
  }

  cancel(requestId: string) {
    if (!this.pending.has(requestId)) return;
    this.sendFrame({
      _tag: "Interrupt",
      requestId,
    });
    this.pending.delete(requestId);
  }

  isHeartbeatFresh(maxAgeMs = 15_000) {
    return (
      this.lastHeartbeatPongAt > 0 && this.options.now() - this.lastHeartbeatPongAt <= maxAgeMs
    );
  }

  dispose() {
    this.disposed = true;
    this.stopHeartbeat();
    this.failPending(
      new ExistingWsProtocolError({
        code: "transport-disposed",
        message: "WebSocket transport is disposed.",
      }),
    );
    this.socket?.close();
    this.socket = null;
    this.state = "closed";
  }

  private sendRequest(method: string, payload: unknown) {
    const id = String(this.nextRequestId);
    this.nextRequestId += 1n;
    this.sendFrame({
      _tag: "Request",
      id,
      tag: method,
      payload,
      headers: [],
    });
    return id;
  }

  private sendFrame(frame: ExistingWsClientFrame) {
    if (this.socket?.readyState !== OPEN_STATE) {
      throw new ExistingWsProtocolError({
        code: "socket-not-open",
        message: "WebSocket is not open.",
        retryable: true,
      });
    }
    this.socket.send(JSON.stringify(frame));
  }

  private handleMessage(data: unknown) {
    const frame = parseServerFrame(data);
    switch (frame._tag) {
      case "Pong":
        this.lastHeartbeatPongAt = this.options.now();
        return;
      case "Chunk":
        this.sendFrame({
          _tag: "Ack",
          requestId: frame.requestId,
        });
        this.handleChunk(frame);
        return;
      case "Exit":
        this.handleExit(frame);
        return;
      case "Defect":
        this.failPending(
          new ExistingWsProtocolError({
            code: "server-defect",
            message: formatUnknownMessage(frame.defect, "Server reported a WebSocket defect."),
            causePayload: frame.defect,
          }),
        );
        return;
      case "ClientProtocolError":
        this.failPending(
          new ExistingWsProtocolError({
            code: "client-protocol-error",
            message: formatUnknownMessage(frame.error, "Server rejected the WebSocket protocol."),
            causePayload: frame.error,
          }),
        );
        return;
    }
  }

  private handleChunk(frame: ExistingWsChunkFrame) {
    const pending = this.pending.get(frame.requestId);
    if (!pending?.listener) return;
    for (const value of frame.values) {
      pending.listener(value);
    }
  }

  private handleExit(frame: ExistingWsExitFrame) {
    const pending = this.pending.get(frame.requestId);
    if (!pending) return;
    this.pending.delete(frame.requestId);

    if (frame.exit._tag === "Success") {
      pending.resolve(frame.exit.value);
      pending.onComplete?.();
      return;
    }

    const error = new ExistingWsProtocolError({
      code: "rpc-failure",
      message: formatUnknownMessage(frame.exit.cause, "WebSocket RPC request failed."),
      causePayload: frame.exit.cause,
    });
    pending.reject(error);
    pending.onError?.(error);
  }

  private failPending(error: ExistingWsProtocolError) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) {
      request.reject(error);
      request.onError?.(error);
    }
  }

  private startHeartbeat() {
    if (this.options.heartbeatIntervalMs <= 0 || this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState !== OPEN_STATE) return;
      this.sendFrame({ _tag: "Ping" });
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

function parseServerFrame(data: unknown): ExistingWsServerFrame {
  if (typeof data !== "string") {
    throw new ExistingWsProtocolError({
      code: "non-text-frame",
      message: "T3 /ws returned a non-text frame.",
      causePayload: data,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw new ExistingWsProtocolError({
      code: "invalid-json-frame",
      message: "T3 /ws returned invalid JSON.",
      causePayload: error,
    });
  }

  if (!isServerFrame(parsed)) {
    throw new ExistingWsProtocolError({
      code: "unknown-frame",
      message: "T3 /ws returned an unknown frame.",
      causePayload: parsed,
    });
  }
  return parsed;
}

function isServerFrame(value: unknown): value is ExistingWsServerFrame {
  const frame = value as Partial<ExistingWsServerFrame>;
  switch (frame?._tag) {
    case "Pong":
    case "Defect":
    case "ClientProtocolError":
      return true;
    case "Chunk":
      return typeof frame.requestId === "string" && Array.isArray(frame.values);
    case "Exit":
      return typeof frame.requestId === "string" && isExit(frame.exit);
    default:
      return false;
  }
}

function isExit(value: unknown): value is ExistingWsExit {
  const exit = value as Partial<ExistingWsExit>;
  return (
    (exit?._tag === "Success" && "value" in exit) || (exit?._tag === "Failure" && "cause" in exit)
  );
}

function formatSocketClose(event: CloseEvent) {
  const reason = event.reason.trim();
  return reason
    ? `WebSocket closed (${event.code}): ${reason}`
    : `WebSocket closed (${event.code}).`;
}

function formatUnknownMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim().length > 0) return payload;
  if (payload instanceof Error && payload.message.trim().length > 0) return payload.message;
  const candidate = payload as { readonly message?: unknown; readonly error?: unknown };
  if (typeof candidate?.message === "string" && candidate.message.trim().length > 0) {
    return candidate.message;
  }
  if (typeof candidate?.error === "string" && candidate.error.trim().length > 0) {
    return candidate.error;
  }
  return fallback;
}

function toProtocolError(error: unknown) {
  return error instanceof ExistingWsProtocolError
    ? error
    : new ExistingWsProtocolError({
        code: "unknown-error",
        message: error instanceof Error ? error.message : String(error),
        causePayload: error,
      });
}
