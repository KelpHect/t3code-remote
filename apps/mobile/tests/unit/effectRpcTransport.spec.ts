import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ExistingWsProtocolError,
  ExistingWsTransport,
  resolveExistingWsUrl,
} from "@/client/ws/effectRpcTransport";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  private readonly listeners = {
    close: new Set<(event: CloseEvent) => void>(),
    error: new Set<(event: Event) => void>(),
    message: new Set<(event: MessageEvent) => void>(),
    open: new Set<(event: Event) => void>(),
  };

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: "open", listener: (event: Event) => void): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  addEventListener(type: "error", listener: (event: Event) => void): void;
  addEventListener(type: "close", listener: (event: CloseEvent) => void): void;
  addEventListener(
    type: "close" | "error" | "message" | "open",
    listener:
      | ((event: CloseEvent) => void)
      | ((event: Event) => void)
      | ((event: MessageEvent) => void),
  ) {
    this.listeners[type].add(listener as never);
  }

  open() {
    this.readyState = 1;
    for (const listener of this.listeners.open) {
      listener(new Event("open"));
    }
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    for (const listener of this.listeners.close) {
      listener(new CloseEvent("close", { code, reason }));
    }
  }

  send(data: string) {
    this.sent.push(data);
  }

  serverMessage(message: unknown) {
    const event = new MessageEvent("message", {
      data: JSON.stringify(message),
    });
    for (const listener of this.listeners.message) {
      listener(event);
    }
  }
}

function makeTransport(options?: {
  readonly heartbeatIntervalMs?: number;
  readonly now?: () => number;
}) {
  return new ExistingWsTransport({
    backendUrl: "http://127.0.0.1:3773",
    wsToken: "ws-token",
    WebSocketCtor: FakeWebSocket,
    heartbeatIntervalMs: options?.heartbeatIntervalMs ?? 0,
    now: options?.now,
  });
}

async function nextTick() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForSent(socket: FakeWebSocket, count = 1) {
  await vi.waitFor(() => {
    expect(socket.sent.length).toBeGreaterThanOrEqual(count);
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("existing /ws Effect RPC transport", () => {
  test("resolves the current backend /ws URL with wsToken auth", () => {
    expect(
      resolveExistingWsUrl({
        backendUrl: "http://127.0.0.1:3773/some/path",
        wsToken: " token value ",
      }),
    ).toBe("ws://127.0.0.1:3773/ws?wsToken=token+value");
  });

  test("sends decimal Effect RPC request ids and resolves successful exits", async () => {
    const transport = makeTransport();
    const request = transport.request("server.getConfig", {});

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await nextTick();
    await waitForSent(socket);

    expect(JSON.parse(socket.sent[0]!)).toEqual({
      _tag: "Request",
      id: "1",
      tag: "server.getConfig",
      payload: {},
      headers: [],
    });

    socket.serverMessage({
      _tag: "Exit",
      requestId: "1",
      exit: {
        _tag: "Success",
        value: {
          environment: {
            label: "local",
          },
        },
      },
    });

    await expect(request).resolves.toEqual({
      environment: {
        label: "local",
      },
    });
  });

  test("streams chunks, sends acks, and interrupts subscriptions on cancel", async () => {
    const transport = makeTransport();
    const listener = vi.fn();
    const unsubscribe = transport.subscribe("orchestration.subscribeShell", {}, listener);

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await nextTick();
    await waitForSent(socket);

    socket.serverMessage({
      _tag: "Chunk",
      requestId: "1",
      values: [
        {
          kind: "snapshot",
          snapshot: {
            snapshotSequence: 1,
          },
        },
      ],
    });

    expect(listener).toHaveBeenCalledWith({
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 1,
      },
    });
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      _tag: "Ack",
      requestId: "1",
    });

    unsubscribe();

    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      _tag: "Interrupt",
      requestId: "1",
    });
  });

  test("rejects failed exits with protocol errors", async () => {
    const transport = makeTransport();
    const request = transport.request("filesystem.browse", { partialPath: "/missing" });

    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await nextTick();
    await waitForSent(socket);

    socket.serverMessage({
      _tag: "Exit",
      requestId: "1",
      exit: {
        _tag: "Failure",
        cause: [
          {
            _tag: "Fail",
            error: {
              message: "Cannot browse path.",
            },
          },
        ],
      },
    });

    await expect(request).rejects.toMatchObject<Partial<ExistingWsProtocolError>>({
      code: "rpc-failure",
    });
  });

  test("sends heartbeat pings and records pongs", async () => {
    vi.useFakeTimers();
    let now = 1_000;
    const transport = makeTransport({
      heartbeatIntervalMs: 25,
      now: () => now,
    });

    const connect = transport.connect();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await connect;
    await nextTick();

    vi.advanceTimersByTime(25);
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      _tag: "Ping",
    });

    now = 1_500;
    socket.serverMessage({
      _tag: "Pong",
    });

    expect(transport.isHeartbeatFresh(1_000)).toBe(true);
    now = 3_000;
    expect(transport.isHeartbeatFresh(1_000)).toBe(false);

    transport.dispose();
  });
});
