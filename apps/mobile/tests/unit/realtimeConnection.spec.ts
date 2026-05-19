import { describe, expect, test, vi } from "vitest";

import {
  getReconnectDelay,
  RealtimeConnectionLoop,
  RealtimeConnectionSnapshot,
  RealtimeTransport,
} from "@/client/ws/realtimeConnection";

class FakeRealtimeTransport implements RealtimeTransport {
  state: RealtimeTransport["state"] = "idle";
  disposed = false;
  heartbeatFresh = true;

  async connect() {
    this.state = "connected";
  }

  dispose() {
    this.disposed = true;
    this.state = "closed";
  }

  isHeartbeatFresh() {
    return this.heartbeatFresh;
  }
}

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map<number, { readonly callback: () => void; readonly delayMs: number }>();
  return {
    delays() {
      return [...timers.values()].map((timer) => timer.delayMs);
    },
    runNext() {
      const [id, timer] = timers.entries().next().value as
        | [number, { readonly callback: () => void; readonly delayMs: number }]
        | undefined;
      expect(timer, "expected a scheduled timer").toBeDefined();
      timers.delete(id);
      timer!.callback();
    },
    setTimer(callback: () => void, delayMs: number) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimer(id: number) {
      timers.delete(id);
    },
  };
}

async function waitForStatus(
  snapshots: readonly RealtimeConnectionSnapshot[],
  status: RealtimeConnectionSnapshot["status"],
) {
  await vi.waitFor(() => {
    expect(snapshots.at(-1)?.status).toBe(status);
  });
}

describe("mobile realtime connection loop", () => {
  test("caps reconnect backoff delays", () => {
    expect(getReconnectDelay({ attempt: 1, baseDelayMs: 100, maxDelayMs: 1_000 })).toBe(100);
    expect(getReconnectDelay({ attempt: 2, baseDelayMs: 100, maxDelayMs: 1_000 })).toBe(200);
    expect(getReconnectDelay({ attempt: 8, baseDelayMs: 100, maxDelayMs: 1_000 })).toBe(1_000);
  });

  test("publishes auth-required when no pairing credentials are available", async () => {
    const timers = createTimerHarness();
    const snapshots: RealtimeConnectionSnapshot[] = [];
    const loop = new RealtimeConnectionLoop({
      clearTimer: timers.clearTimer,
      getCredentials: () => null,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      setTimer: timers.setTimer,
    });

    loop.start();
    timers.runNext();

    await waitForStatus(snapshots, "auth-required");
  });

  test("uses bound global timers when no test timers are provided", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const callbacks: Array<() => void> = [];
    const setTimer = vi.fn(function (this: typeof globalThis, callback: () => void) {
      expect(this).toBe(globalThis);
      callbacks.push(callback);
      return 1 as ReturnType<typeof setTimeout>;
    });
    const clearTimer = vi.fn(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
    });
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      value: setTimer,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
      configurable: true,
      value: clearTimer,
    });

    try {
      const snapshots: RealtimeConnectionSnapshot[] = [];
      const loop = new RealtimeConnectionLoop({
        getCredentials: () => null,
        onSnapshot: (snapshot) => snapshots.push(snapshot),
      });

      loop.start();
      callbacks.shift()?.();

      await waitForStatus(snapshots, "auth-required");
      loop.stop();
      expect(setTimer).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: originalSetTimeout,
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: originalClearTimeout,
      });
    }
  });

  test("connects with a freshly issued ws token", async () => {
    const timers = createTimerHarness();
    const snapshots: RealtimeConnectionSnapshot[] = [];
    const transport = new FakeRealtimeTransport();
    const issueToken = vi.fn().mockResolvedValue({
      token: "ws-token",
      expiresAt: "2026-05-19T12:00:00.000Z",
    });
    const createTransport = vi.fn(() => transport);
    const loop = new RealtimeConnectionLoop({
      clearTimer: timers.clearTimer,
      createTransport,
      getCredentials: () => ({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "session-token",
      }),
      healthCheckIntervalMs: 50,
      issueToken,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      setTimer: timers.setTimer,
    });

    loop.start();
    timers.runNext();

    await waitForStatus(snapshots, "connected");
    expect(snapshots.map((snapshot) => snapshot.status)).toContain("connecting");
    expect(issueToken).toHaveBeenCalledWith({
      backendUrl: "http://127.0.0.1:3773",
      sessionToken: "session-token",
    });
    expect(createTransport).toHaveBeenCalledWith({
      backendUrl: "http://127.0.0.1:3773",
      wsToken: "ws-token",
    });
    expect(timers.delays()).toContain(50);
  });

  test("retries failed connections with bounded reconnecting state", async () => {
    const timers = createTimerHarness();
    const snapshots: RealtimeConnectionSnapshot[] = [];
    const transport = new FakeRealtimeTransport();
    const issueToken = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValue({
        token: "ws-token",
        expiresAt: "2026-05-19T12:00:00.000Z",
      });
    const loop = new RealtimeConnectionLoop({
      baseDelayMs: 25,
      clearTimer: timers.clearTimer,
      createTransport: () => transport,
      getCredentials: () => ({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "session-token",
      }),
      issueToken,
      maxDelayMs: 25,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      setTimer: timers.setTimer,
    });

    loop.start();
    timers.runNext();

    await waitForStatus(snapshots, "failed");
    expect(snapshots.at(-1)?.nextRetryDelayMs).toBe(25);
    timers.runNext();

    await waitForStatus(snapshots, "connected");
    expect(snapshots.map((snapshot) => snapshot.status)).toContain("reconnecting");
  });

  test("moves offline immediately and reconnects when online resumes", async () => {
    const timers = createTimerHarness();
    const snapshots: RealtimeConnectionSnapshot[] = [];
    let online = true;
    const loop = new RealtimeConnectionLoop({
      clearTimer: timers.clearTimer,
      getCredentials: () => ({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "session-token",
      }),
      isOnline: () => online,
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      setTimer: timers.setTimer,
    });

    loop.start();
    online = false;
    loop.handleOffline();

    expect(snapshots.at(-1)?.status).toBe("offline");
    online = true;
    loop.handleOnline();
    expect(timers.delays()).toContain(0);
  });
});
