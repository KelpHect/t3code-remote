import { describe, expect, test, vi } from "vitest";

import fixture from "@/client/ws/__fixtures__/current-backend.redacted.json";
import { ExistingWsTransport } from "@/client/ws/effectRpcTransport";

type FixtureDirection = "client-to-server" | "http-response" | "server-to-client";

interface FixtureEntry {
  readonly case: string;
  readonly direction: FixtureDirection;
  readonly method?: string;
  readonly message: unknown;
}

interface RequestFrame {
  readonly _tag: "Request";
  readonly id: string;
  readonly tag: string;
  readonly payload: unknown;
  readonly headers: readonly unknown[];
}

interface ChunkFrame {
  readonly _tag: "Chunk";
  readonly requestId: string;
  readonly values: readonly unknown[];
}

interface ExitFrame {
  readonly _tag: "Exit";
  readonly requestId: string;
  readonly exit: {
    readonly _tag: "Success" | "Failure";
    readonly value?: unknown;
    readonly cause?: unknown;
  };
}

const frames = fixture.frames as readonly FixtureEntry[];

class FixtureWebSocket {
  static instances: FixtureWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = 0;
  private readonly closeListeners = new Set<(event: CloseEvent) => void>();
  private readonly errorListeners = new Set<(event: Event) => void>();
  private readonly messageListeners = new Set<(event: MessageEvent) => void>();
  private readonly openListeners = new Set<(event: Event) => void>();

  constructor(readonly url: string) {
    FixtureWebSocket.instances.push(this);
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
    switch (type) {
      case "close":
        this.closeListeners.add(listener as (event: CloseEvent) => void);
        return;
      case "error":
        this.errorListeners.add(listener as (event: Event) => void);
        return;
      case "message":
        this.messageListeners.add(listener as (event: MessageEvent) => void);
        return;
      case "open":
        this.openListeners.add(listener as (event: Event) => void);
        return;
    }
  }

  open() {
    this.readyState = 1;
    for (const listener of this.openListeners) {
      listener(new Event("open"));
    }
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    for (const listener of this.closeListeners) {
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
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }
}

function makeTransport() {
  FixtureWebSocket.instances = [];
  return new ExistingWsTransport({
    backendUrl: "http://127.0.0.1:3773",
    wsToken: "fixture-ws-token",
    WebSocketCtor: FixtureWebSocket,
    heartbeatIntervalMs: 0,
  });
}

function findFixture(caseName: string) {
  const entry = frames.find((candidate) => candidate.case === caseName);
  expect(entry, `missing /ws drift fixture case: ${caseName}`).toBeDefined();
  return entry!;
}

function fixtureMessage<TMessage>(caseName: string) {
  return findFixture(caseName).message as TMessage;
}

function sentFrames(socket: FixtureWebSocket) {
  return socket.sent.map((message) => JSON.parse(message) as unknown);
}

async function waitForSent(socket: FixtureWebSocket, count: number) {
  await vi.waitFor(() => {
    expect(socket.sent.length).toBeGreaterThanOrEqual(count);
  });
}

describe("current backend /ws drift fixtures", () => {
  test("cover the required existing backend methods and envelope frames", () => {
    const expectedRequests = new Map([
      ["server.getConfig.request", "server.getConfig"],
      ["orchestration.subscribeShell.request", "orchestration.subscribeShell"],
      ["orchestration.subscribeThread.request", "orchestration.subscribeThread"],
      ["orchestration.dispatchCommand.request", "orchestration.dispatchCommand"],
      ["orchestration.getTurnDiff.request", "orchestration.getTurnDiff"],
      ["filesystem.browse.request", "filesystem.browse"],
      ["vcs.refreshStatus.request", "vcs.refreshStatus"],
      ["git.runStackedAction.request", "git.runStackedAction"],
      ["terminal.open.request", "terminal.open"],
    ]);

    for (const [caseName, method] of expectedRequests) {
      const entry = findFixture(caseName);
      const message = entry.message as Partial<RequestFrame>;
      expect(entry.direction, `${caseName} direction`).toBe("client-to-server");
      expect(message._tag, `${caseName} envelope`).toBe("Request");
      expect(message.tag, `${caseName} method`).toBe(method);
      expect(message.id, `${caseName} request id`).toMatch(/^\d+$/);
      expect(message.headers, `${caseName} headers`).toEqual([]);
      expect(message, `${caseName} payload`).toHaveProperty("payload");
    }
  });

  test("validates server chunk, exit, ack, interrupt, heartbeat, and error shapes", () => {
    const chunkCases = [
      "orchestration.subscribeShell.snapshotChunk",
      "orchestration.subscribeShell.incrementalChunk",
      "orchestration.subscribeThread.chunk",
      "git.runStackedAction.progressChunk",
      "subscribeTerminalEvents.chunk",
    ];
    for (const caseName of chunkCases) {
      const chunk = fixtureMessage<Partial<ChunkFrame>>(caseName);
      expect(chunk._tag, `${caseName} envelope`).toBe("Chunk");
      expect(chunk.requestId, `${caseName} requestId`).toMatch(/^\d+$/);
      expect(Array.isArray(chunk.values), `${caseName} values`).toBe(true);
      expect(chunk.values?.length, `${caseName} values`).toBeGreaterThan(0);
    }

    const exitCases = [
      "server.getConfig.response",
      "orchestration.dispatchCommand.response",
      "orchestration.getTurnDiff.response",
      "filesystem.browse.response",
      "vcs.refreshStatus.response",
      "error.schemaFailure",
    ];
    for (const caseName of exitCases) {
      const exit = fixtureMessage<Partial<ExitFrame>>(caseName);
      expect(exit._tag, `${caseName} envelope`).toBe("Exit");
      expect(exit.requestId, `${caseName} requestId`).toMatch(/^\d+$/);
      expect(["Success", "Failure"], `${caseName} exit`).toContain(exit.exit?._tag);
    }

    expect(fixtureMessage("orchestration.subscribeShell.ack")).toEqual({
      _tag: "Ack",
      requestId: "2",
    });
    expect(fixtureMessage("stream.cancel")).toEqual({
      _tag: "Interrupt",
      requestId: "2",
    });
    expect(fixtureMessage("heartbeat.ping")).toEqual({ _tag: "Ping" });
    expect(fixtureMessage("heartbeat.pong")).toEqual({ _tag: "Pong" });
    expect(fixtureMessage("malformed.invalidRequestId")).toEqual({
      _tag: "Defect",
      defect: "Invalid request id: 1",
    });
  });

  test("keeps fixture redactions token-free and path-redacted", () => {
    const serialized = JSON.stringify(fixture);
    expect(serialized).not.toContain("/home/kellhect");
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain("ghp_");
    expect(serialized).not.toContain("github_pat_");
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(serialized).toContain("<redacted-token>");
    expect(serialized).toContain("<redacted-home>");
    expect(serialized).toContain("<redacted-workspace>");
  });

  test("replays captured request, response, stream ack, and interrupt frames", async () => {
    const transport = makeTransport();
    const configRequest = transport.request("server.getConfig", {});
    const socket = FixtureWebSocket.instances[0]!;

    socket.open();
    await waitForSent(socket, 1);
    expect(sentFrames(socket)[0], "server.getConfig.request").toEqual(
      fixtureMessage("server.getConfig.request"),
    );

    socket.serverMessage(fixtureMessage("server.getConfig.response"));
    await expect(configRequest).resolves.toMatchObject({
      auth: {
        policy: "desktop-managed-local",
      },
    });

    const shellListener = vi.fn();
    const unsubscribe = transport.subscribe("orchestration.subscribeShell", {}, shellListener);

    await waitForSent(socket, 2);
    expect(sentFrames(socket)[1], "orchestration.subscribeShell.request").toEqual(
      fixtureMessage("orchestration.subscribeShell.request"),
    );

    socket.serverMessage(fixtureMessage("orchestration.subscribeShell.snapshotChunk"));
    expect(shellListener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "snapshot",
      }),
    );
    expect(sentFrames(socket), "orchestration.subscribeShell.ack").toContainEqual(
      fixtureMessage("orchestration.subscribeShell.ack"),
    );

    socket.serverMessage(fixtureMessage("orchestration.subscribeShell.incrementalChunk"));
    expect(shellListener).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "thread-upserted",
      }),
    );

    unsubscribe();
    expect(sentFrames(socket), "stream.cancel").toContainEqual(fixtureMessage("stream.cancel"));
  });
});
