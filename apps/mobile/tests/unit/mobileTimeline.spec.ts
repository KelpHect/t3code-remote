import { describe, expect, test, vi } from "vitest";

import {
  deriveMobileTimelineRows,
  deriveMobileWorkLogEntries,
  formatRelativeTime,
} from "@/client/mobileTimeline";
import { createEmptyMobileThreadDetail, type MobileThreadDetail } from "@/client/mobileThread";

describe("mobile timeline", () => {
  test("renders conversation first and compacts noisy realtime work logs", () => {
    const rows = deriveMobileTimelineRows({
      ...createEmptyMobileThreadDetail("thread-1"),
      activities: [
        makeActivity({
          id: "context-1",
          kind: "context-window.updated",
          summary: "Context window updated",
        }),
        makeActivity({
          id: "tool-start",
          kind: "tool.started",
          summary: "Ran command started",
        }),
        makeActivity({
          id: "tool-update",
          kind: "tool.updated",
          payload: {
            data: { command: "/usr/bin/zsh -lc 'rg Server'" },
            itemType: "command_execution",
          },
          summary: "Ran command",
        }),
        makeActivity({
          id: "tool-complete",
          kind: "tool.completed",
          payload: {
            data: { command: "/usr/bin/zsh -lc 'rg Server'" },
            itemType: "command_execution",
          },
          summary: "Ran command completed",
        }),
      ],
      latestTurn: {
        assistantMessageId: "assistant-1",
        completedAt: null,
        requestedAt: "2026-05-19T10:00:00.000Z",
        startedAt: "2026-05-19T10:00:01.000Z",
        state: "running",
        turnId: "turn-1",
      },
      messages: [
        makeMessage({
          id: "user-1",
          role: "user",
          text: "Find server code",
          turnId: "turn-1",
        }),
      ],
      session: {
        activeTurnId: "turn-1",
        lastError: null,
        providerName: "Codex",
        runtimeMode: "full-access",
        status: "running",
        updatedAt: "2026-05-19T10:00:02.000Z",
      },
    });

    expect(rows.map((row) => row.kind)).toEqual(["message", "work", "working"]);
    const work = rows.find((row) => row.kind === "work");
    expect(work?.entries).toHaveLength(1);
    expect(work?.entries[0]).toMatchObject({
      command: "rg Server",
      label: "Ran command",
    });
  });

  test("filters work entries to the latest turn when available", () => {
    const entries = deriveMobileWorkLogEntries(
      [
        makeActivity({ id: "old", summary: "Old command", turnId: "turn-0" }),
        makeActivity({ id: "new", summary: "New command", turnId: "turn-1" }),
      ],
      "turn-1",
    );

    expect(entries.map((entry) => entry.label)).toEqual(["New command"]);
  });

  test("formats short relative times for mobile metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-19T10:05:00.000Z"));

    expect(formatRelativeTime("2026-05-19T10:04:31.000Z")).toBe("now");
    expect(formatRelativeTime("2026-05-19T10:03:00.000Z")).toBe("2m");

    vi.useRealTimers();
  });
});

function makeMessage(input: {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly turnId?: string | null;
}) {
  return {
    author: input.role === "user" ? "You" : "T3 Code",
    avatar: input.role === "user" ? "K" : "T3",
    completedAt: "2026-05-19T10:00:00.000Z",
    createdAt: "2026-05-19T10:00:00.000Z",
    id: input.id,
    role: input.role,
    streaming: false,
    text: input.text,
    turnId: input.turnId ?? null,
    updatedAt: "2026-05-19T10:00:00.000Z",
  } satisfies MobileThreadDetail["messages"][number];
}

function makeActivity(input: {
  readonly id: string;
  readonly kind?: string;
  readonly payload?: Record<string, unknown>;
  readonly summary: string;
  readonly turnId?: string | null;
}) {
  return {
    createdAt: "2026-05-19T10:00:01.000Z",
    detail: null,
    id: input.id,
    kind: input.kind ?? "tool.completed",
    payload: input.payload ?? {},
    requestId: null,
    requestKind: null,
    sequence: null,
    summary: input.summary,
    tone: "tool",
    turnId: input.turnId ?? "turn-1",
  } satisfies MobileThreadDetail["activities"][number];
}
