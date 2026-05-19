import { describe, expect, test } from "vitest";

import {
  createEmptyMobileThreadDetail,
  derivePendingApprovals,
  derivePendingUserInputs,
  reduceMobileThreadStreamItem,
  type MobileThreadDetail,
} from "@/client/mobileThread";

describe("mobile thread state", () => {
  test("maps thread snapshots into bounded app-owned chat data", () => {
    const state = reduceMobileThreadStreamItem(createEmptyMobileThreadDetail("thread-1"), {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 10,
        thread: {
          id: "thread-1",
          projectId: "project-1",
          title: "Mobile thread",
          messages: [
            makeMessage({
              id: "assistant-1",
              role: "assistant",
              text: "Hello from T3.",
              createdAt: "2026-05-19T10:01:00.000Z",
              turnId: "turn-1",
            }),
            makeMessage({
              id: "user-1",
              role: "user",
              text: "Open this on mobile.",
              createdAt: "2026-05-19T10:00:00.000Z",
            }),
          ],
          activities: [makeActivity({ id: "activity-1", summary: "Ran command" })],
          checkpoints: [
            {
              assistantMessageId: "assistant-1",
              checkpointRef: "checkpoint-1",
              checkpointTurnCount: 1,
              completedAt: "2026-05-19T10:03:00.000Z",
              files: [
                {
                  additions: 4,
                  deletions: 1,
                  newPath: "README.md",
                  oldPath: "README.md",
                  status: "modified",
                },
              ],
              status: "completed",
              turnId: "turn-1",
            },
          ],
          proposedPlans: [],
          session: {
            activeTurnId: "turn-1",
            lastError: null,
            providerName: "Codex",
            runtimeMode: "full-access",
            status: "running",
            updatedAt: "2026-05-19T10:02:00.000Z",
          },
          latestTurn: {
            assistantMessageId: "assistant-1",
            completedAt: null,
            requestedAt: "2026-05-19T10:00:00.000Z",
            startedAt: "2026-05-19T10:01:00.000Z",
            state: "running",
            turnId: "turn-1",
          },
          updatedAt: "2026-05-19T10:02:00.000Z",
        },
      },
    });

    expect(state.sequence).toBe(10);
    expect(state.title).toBe("Mobile thread");
    expect(state.messages.map((message) => message.id)).toEqual(["user-1", "assistant-1"]);
    expect(state.messages[0]).toMatchObject({
      author: "You",
      avatar: "K",
      text: "Open this on mobile.",
    });
    expect(state.session).toMatchObject({
      activeTurnId: "turn-1",
      providerName: "Codex",
      status: "running",
    });
    expect(state.latestTurn).toMatchObject({
      assistantMessageId: "assistant-1",
      state: "running",
      turnId: "turn-1",
    });
    expect(state.turnDiffSummaries).toEqual([
      {
        assistantMessageId: "assistant-1",
        checkpointRef: "checkpoint-1",
        checkpointTurnCount: 1,
        completedAt: "2026-05-19T10:03:00.000Z",
        files: [
          {
            additions: 4,
            deletions: 1,
            newPath: "README.md",
            oldPath: "README.md",
            path: "README.md",
            status: "modified",
          },
        ],
        id: "turn-1",
        status: "completed",
        turnId: "turn-1",
      },
    ]);
  });

  test("appends streaming assistant deltas and completes with final text like desktop", () => {
    const initial: MobileThreadDetail = {
      ...createEmptyMobileThreadDetail("thread-1"),
      sequence: 10,
    };

    const firstDelta = reduceMobileThreadStreamItem(initial, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 11,
        type: "thread.message-sent",
        payload: makeMessage({
          id: "assistant-1",
          role: "assistant",
          streaming: true,
          text: "Hello",
          turnId: "turn-1",
        }),
      },
    });
    const secondDelta = reduceMobileThreadStreamItem(firstDelta, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 12,
        type: "thread.message-sent",
        payload: makeMessage({
          id: "assistant-1",
          role: "assistant",
          streaming: true,
          text: " there",
          turnId: "turn-1",
        }),
      },
    });
    const completed = reduceMobileThreadStreamItem(secondDelta, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 13,
        type: "thread.message-sent",
        payload: makeMessage({
          id: "assistant-1",
          role: "assistant",
          streaming: false,
          text: "Hello there.",
          turnId: "turn-1",
        }),
      },
    });

    expect(secondDelta.messages[0]).toMatchObject({
      streaming: true,
      text: "Hello there",
    });
    expect(completed.messages[0]).toMatchObject({
      completedAt: "2026-05-19T10:00:00.000Z",
      streaming: false,
      text: "Hello there.",
      turnId: "turn-1",
    });
    expect(completed.latestTurn).toMatchObject({
      assistantMessageId: "assistant-1",
      state: "completed",
      turnId: "turn-1",
    });
  });

  test("applies live message and activity events by increasing sequence", () => {
    const initial: MobileThreadDetail = {
      ...createEmptyMobileThreadDetail("thread-1"),
      sequence: 10,
    };

    const withMessage = reduceMobileThreadStreamItem(initial, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 11,
        type: "thread.message-sent",
        payload: makeMessage({
          id: "assistant-1",
          role: "assistant",
          text: "Streaming update",
        }),
      },
    });
    const withActivity = reduceMobileThreadStreamItem(withMessage, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 12,
        type: "thread.activity-appended",
        payload: {
          activity: makeActivity({
            id: "activity-1",
            kind: "tool.finished",
            summary: "Edited file",
          }),
          threadId: "thread-1",
        },
      },
    });

    expect(withActivity.sequence).toBe(12);
    expect(withActivity.messages).toHaveLength(1);
    expect(withActivity.activities[0]).toMatchObject({
      kind: "tool.finished",
      summary: "Edited file",
    });
  });

  test("ignores stale thread updates and events for other threads", () => {
    const state: MobileThreadDetail = {
      ...createEmptyMobileThreadDetail("thread-1"),
      messages: [makeMappedMessage("current")],
      sequence: 10,
    };

    const stale = reduceMobileThreadStreamItem(state, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        sequence: 10,
        type: "thread.message-sent",
        payload: makeMessage({ id: "stale", role: "assistant", text: "stale" }),
      },
    });
    const otherThread = reduceMobileThreadStreamItem(state, {
      kind: "event",
      event: {
        aggregateId: "thread-2",
        sequence: 11,
        type: "thread.message-sent",
        payload: makeMessage({ id: "other", role: "assistant", text: "other" }),
      },
    });

    expect(stale).toEqual(state);
    expect(otherThread).toEqual(state);
  });

  test("applies live turn diff summaries by increasing sequence", () => {
    const initial: MobileThreadDetail = {
      ...createEmptyMobileThreadDetail("thread-1"),
      sequence: 10,
    };

    const state = reduceMobileThreadStreamItem(initial, {
      kind: "event",
      event: {
        aggregateId: "thread-1",
        payload: {
          checkpointRef: "checkpoint-2",
          checkpointTurnCount: 2,
          completedAt: "2026-05-19T10:05:00.000Z",
          files: [{ newPath: "TODO.md", oldPath: "TODO.md", status: "modified" }],
          status: "completed",
          threadId: "thread-1",
          turnId: "turn-2",
        },
        sequence: 11,
        type: "thread.turn-diff-completed",
      },
    });

    expect(state.turnDiffSummaries).toHaveLength(1);
    expect(state.turnDiffSummaries[0]).toMatchObject({
      checkpointTurnCount: 2,
      files: [{ path: "TODO.md", status: "modified" }],
      turnId: "turn-2",
    });
  });

  test("derives pending approvals and user-input prompts from activities", () => {
    const state = reduceMobileThreadStreamItem(createEmptyMobileThreadDetail("thread-1"), {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 10,
        thread: {
          activities: [
            makeActivity({
              id: "approval-1",
              kind: "approval.requested",
              payload: {
                detail: "Run bun lint",
                requestId: "approval-request",
                requestKind: "command",
              },
              summary: "Command approval requested",
            }),
            makeActivity({
              id: "input-1",
              kind: "user-input.requested",
              payload: {
                questions: [
                  {
                    header: "Mode",
                    id: "mode",
                    options: [{ description: "Keep current mode", label: "Default" }],
                    question: "Which mode should continue?",
                  },
                ],
                requestId: "input-request",
              },
              summary: "User input requested",
            }),
          ],
          id: "thread-1",
          messages: [],
          projectId: "project-1",
          proposedPlans: [],
          session: null,
          title: "Prompts",
          updatedAt: "2026-05-19T10:00:00.000Z",
        },
      },
    });

    expect(derivePendingApprovals(state.activities)).toEqual([
      {
        createdAt: "2026-05-19T10:00:00.000Z",
        detail: "Run bun lint",
        requestId: "approval-request",
        requestKind: "command",
      },
    ]);
    expect(derivePendingUserInputs(state.activities)).toEqual([
      {
        createdAt: "2026-05-19T10:00:00.000Z",
        questions: [
          {
            header: "Mode",
            id: "mode",
            multiSelect: false,
            options: [{ description: "Keep current mode", label: "Default" }],
            question: "Which mode should continue?",
          },
        ],
        requestId: "input-request",
      },
    ]);
  });
});

function makeMessage(input: {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly createdAt?: string;
  readonly streaming?: boolean;
  readonly turnId?: string | null;
}) {
  return {
    createdAt: input.createdAt ?? "2026-05-19T10:00:00.000Z",
    id: input.id,
    role: input.role,
    streaming: input.streaming ?? false,
    text: input.text,
    turnId: input.turnId ?? null,
    updatedAt: input.createdAt ?? "2026-05-19T10:00:00.000Z",
  };
}

function makeMappedMessage(id: string) {
  return {
    author: "T3 Code",
    avatar: "T3",
    createdAt: "2026-05-19T10:00:00.000Z",
    completedAt: "2026-05-19T10:00:00.000Z",
    id,
    role: "assistant" as const,
    streaming: false,
    text: "current",
    turnId: null,
    updatedAt: "2026-05-19T10:00:00.000Z",
  };
}

function makeActivity(input: {
  readonly id: string;
  readonly kind?: string;
  readonly payload?: Record<string, unknown>;
  readonly summary: string;
}) {
  return {
    createdAt: "2026-05-19T10:00:00.000Z",
    id: input.id,
    kind: input.kind ?? "tool.started",
    payload: input.payload ?? {},
    summary: input.summary,
    tone: "tool",
    turnId: "turn-1",
  };
}
