import { describe, expect, test } from "vitest";

import {
  appendTerminalOutput,
  boundTerminalScrollback,
  createEmptyMobileTerminalState,
  mapMobileTerminalEvent,
  mapMobileTerminalSnapshot,
  reduceMobileTerminalState,
} from "@/client/mobileTerminal";

describe("mobile terminal helpers", () => {
  test("maps terminal snapshots into bounded mobile state", () => {
    expect(
      mapMobileTerminalSnapshot({
        cwd: "/repo",
        exitCode: null,
        exitSignal: null,
        history: "hello",
        pid: 123,
        status: "running",
        terminalId: "default",
        threadId: "thread-1",
        updatedAt: "2026-05-19T12:00:00.000Z",
        worktreePath: "/repo",
      }),
    ).toMatchObject({
      cwd: "/repo",
      history: "hello",
      pid: 123,
      status: "running",
      terminalId: "default",
      threadId: "thread-1",
    });
  });

  test("maps terminal events and ignores unknown event shapes", () => {
    expect(
      mapMobileTerminalEvent({
        createdAt: "2026-05-19T12:00:01.000Z",
        data: "output",
        terminalId: "default",
        threadId: "thread-1",
        type: "output",
      }),
    ).toMatchObject({
      data: "output",
      terminalId: "default",
      threadId: "thread-1",
      type: "output",
    });

    expect(mapMobileTerminalEvent({ type: "output" })).toBeNull();
  });

  test("reduces output, clear, exit, and error events", () => {
    const started = reduceMobileTerminalState(createEmptyMobileTerminalState(), {
      createdAt: "2026-05-19T12:00:00.000Z",
      snapshot: mapMobileTerminalSnapshot({
        cwd: "/repo",
        history: "$ ",
        status: "running",
        terminalId: "default",
        threadId: "thread-1",
        updatedAt: "2026-05-19T12:00:00.000Z",
      }),
      terminalId: "default",
      threadId: "thread-1",
      type: "started",
    });
    const withOutput = reduceMobileTerminalState(started, {
      createdAt: "2026-05-19T12:00:01.000Z",
      data: "bun test\r\n",
      terminalId: "default",
      threadId: "thread-1",
      type: "output",
    });
    const errored = reduceMobileTerminalState(withOutput, {
      createdAt: "2026-05-19T12:00:02.000Z",
      message: "lost pty",
      terminalId: "default",
      threadId: "thread-1",
      type: "error",
    });
    const cleared = reduceMobileTerminalState(errored, {
      createdAt: "2026-05-19T12:00:03.000Z",
      terminalId: "default",
      threadId: "thread-1",
      type: "cleared",
    });
    const exited = reduceMobileTerminalState(cleared, {
      createdAt: "2026-05-19T12:00:04.000Z",
      exitCode: 0,
      exitSignal: null,
      terminalId: "default",
      threadId: "thread-1",
      type: "exited",
    });

    expect(withOutput.history).toContain("bun test");
    expect(errored).toMatchObject({ lastError: "lost pty", status: "error" });
    expect(cleared.history).toBe("");
    expect(exited).toMatchObject({ exitCode: 0, status: "exited" });
  });

  test("bounds terminal scrollback", () => {
    const longHistory = "x".repeat(90_000);
    expect(boundTerminalScrollback(longHistory)).toHaveLength(80_000);
    expect(appendTerminalOutput("a", "b")).toBe("ab");
  });
});
