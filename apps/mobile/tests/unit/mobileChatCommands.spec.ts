import { describe, expect, test } from "vitest";

import {
  buildInterruptOutboxPayload,
  buildThreadInteractionModeOutboxPayload,
  buildThreadMetaUpdateOutboxPayload,
  buildThreadRuntimeModeOutboxPayload,
  buildTurnStartOutboxPayload,
  createMobileEntityId,
  createTitleSeed,
} from "@/client/mobileChatCommands";

describe("mobile chat commands", () => {
  test("builds turn start payloads with mobile message ids", () => {
    const payload = buildTurnStartOutboxPayload({
      createdAt: "2026-05-19T12:00:00.000Z",
      interactionMode: "default",
      messageId: "message-1",
      modelSelection: { instanceId: "codex", model: "gpt-5.5" },
      runtimeMode: "full-access",
      text: "Continue the work",
      threadId: "thread-1",
      titleSeed: "Continue the work",
    });

    expect(payload).toEqual({
      createdAt: "2026-05-19T12:00:00.000Z",
      interactionMode: "default",
      message: {
        attachments: [],
        messageId: "message-1",
        role: "user",
        text: "Continue the work",
      },
      modelSelection: { instanceId: "codex", model: "gpt-5.5" },
      runtimeMode: "full-access",
      threadId: "thread-1",
      titleSeed: "Continue the work",
    });
  });

  test("builds new-thread bootstrap metadata", () => {
    const payload = buildTurnStartOutboxPayload({
      bootstrap: {
        branch: "main",
        createdAt: "2026-05-19T12:00:00.000Z",
        interactionMode: "default",
        modelSelection: { instanceId: "codex", model: "gpt-5.5" },
        projectId: "project-1",
        runtimeMode: "full-access",
        title: "New mobile chat",
        worktreePath: null,
      },
      createdAt: "2026-05-19T12:00:01.000Z",
      interactionMode: "default",
      messageId: "message-1",
      runtimeMode: "full-access",
      text: "New mobile chat",
      threadId: "thread-1",
    });

    expect(payload.bootstrap).toEqual({
      createThread: {
        branch: "main",
        createdAt: "2026-05-19T12:00:00.000Z",
        interactionMode: "default",
        modelSelection: { instanceId: "codex", model: "gpt-5.5" },
        projectId: "project-1",
        runtimeMode: "full-access",
        title: "New mobile chat",
        worktreePath: null,
      },
    });
  });

  test("builds interrupt payloads with optional active turn", () => {
    expect(
      buildInterruptOutboxPayload({
        createdAt: "2026-05-19T12:00:00.000Z",
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    ).toEqual({
      createdAt: "2026-05-19T12:00:00.000Z",
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  test("builds thread settings payloads", () => {
    expect(
      buildThreadMetaUpdateOutboxPayload({
        modelSelection: { instanceId: "codex", model: "gpt-5.4" },
        threadId: "thread-1",
      }),
    ).toEqual({
      modelSelection: { instanceId: "codex", model: "gpt-5.4" },
      threadId: "thread-1",
    });

    expect(
      buildThreadRuntimeModeOutboxPayload({
        createdAt: "2026-05-19T12:00:00.000Z",
        runtimeMode: "approval-required",
        threadId: "thread-1",
      }),
    ).toEqual({
      createdAt: "2026-05-19T12:00:00.000Z",
      runtimeMode: "approval-required",
      threadId: "thread-1",
    });

    expect(
      buildThreadInteractionModeOutboxPayload({
        createdAt: "2026-05-19T12:00:00.000Z",
        interactionMode: "plan",
        threadId: "thread-1",
      }),
    ).toEqual({
      createdAt: "2026-05-19T12:00:00.000Z",
      interactionMode: "plan",
      threadId: "thread-1",
    });
  });

  test("creates mobile entity ids and concise title seeds", () => {
    expect(createMobileEntityId("thread", () => "uuid-1")).toBe("mobile-thread-uuid-1");
    expect(createTitleSeed("  This   is a concise title  ")).toBe("This is a concise title");
    expect(createTitleSeed("x".repeat(80))).toBe(`${"x".repeat(61)}...`);
  });
});
