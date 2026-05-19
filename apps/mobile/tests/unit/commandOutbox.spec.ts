import { describe, expect, test, vi } from "vitest";

import {
  createInMemoryCommandOutboxStore,
  createMobileCommandId,
  MobileCommandOutbox,
  NewMobileOutboxCommand,
} from "@/client/commandOutbox";

const baseCommand: NewMobileOutboxCommand = {
  intent: "send",
  type: "thread.turn.start",
  payload: {
    threadId: "thread-1",
    message: {
      messageId: "message-1",
      role: "user",
      text: "Continue the work",
      attachments: [],
    },
  },
};

describe("mobile command outbox", () => {
  test("generates mobile command ids", () => {
    expect(
      createMobileCommandId({
        randomUUID: () => "00000000-0000-4000-8000-000000000001",
      }),
    ).toBe("mobile-00000000-0000-4000-8000-000000000001");
  });

  test("persists a generated command before dispatching it", async () => {
    let savedSnapshots: readonly unknown[][] = [];
    const store = createRecordingStore((snapshot) => {
      savedSnapshots = [...savedSnapshots, snapshot];
    });
    const outbox = new MobileCommandOutbox({
      newCommandId: () => "mobile-cmd-1",
      now: () => new Date("2026-05-19T12:00:00.000Z"),
      store,
    });
    const dispatch = vi.fn(async () => {
      const persistedBeforeDispatch = await store.load();
      expect(persistedBeforeDispatch).toHaveLength(1);
      expect(persistedBeforeDispatch[0]?.command.commandId).toBe("mobile-cmd-1");
    });

    await outbox.dispatchNew(baseCommand, dispatch);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "mobile-cmd-1",
        type: "thread.turn.start",
        threadId: "thread-1",
      }),
    );
    expect(savedSnapshots[0]).toHaveLength(1);
    await expect(outbox.list()).resolves.toEqual([]);
  });

  test("keeps failed commands queued for reconnect replay", async () => {
    const store = createInMemoryCommandOutboxStore();
    const outbox = new MobileCommandOutbox({
      newCommandId: () => "mobile-cmd-2",
      now: createSteppedClock(),
      store,
    });
    await outbox.dispatchNew(baseCommand, async () => {
      throw new Error("network offline");
    });

    const queued = await outbox.list();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      attempts: 1,
      commandId: "mobile-cmd-2",
      lastError: "network offline",
      status: "failed",
    });
  });

  test("replays queued send, continue, and stop commands after reconnect", async () => {
    const store = createInMemoryCommandOutboxStore();
    const outbox = new MobileCommandOutbox({
      newCommandId: createCommandIdGenerator(["mobile-send", "mobile-continue", "mobile-stop"]),
      now: createSteppedClock(),
      store,
    });
    await outbox.enqueue(baseCommand);
    await outbox.enqueue({
      ...baseCommand,
      intent: "continue",
      payload: {
        ...baseCommand.payload,
        message: {
          messageId: "message-2",
          role: "user",
          text: "Keep going",
          attachments: [],
        },
      },
    });
    await outbox.enqueue({
      intent: "stop",
      type: "thread.turn.interrupt",
      payload: {
        threadId: "thread-1",
      },
    });
    const dispatched: string[] = [];

    const result = await outbox.replay(async (command) => {
      dispatched.push(command.commandId);
    });

    expect(dispatched).toEqual(["mobile-send", "mobile-continue", "mobile-stop"]);
    expect(result).toMatchObject({ dispatched: 3, failed: 0, remaining: [] });
    await expect(outbox.list()).resolves.toEqual([]);
  });

  test("removes commands only after success or explicit cancel", async () => {
    const store = createInMemoryCommandOutboxStore();
    const outbox = new MobileCommandOutbox({
      newCommandId: createCommandIdGenerator(["mobile-cmd-3", "mobile-cmd-4"]),
      now: createSteppedClock(),
      store,
    });
    await outbox.enqueue(baseCommand);
    await outbox.enqueue({
      intent: "stop",
      type: "thread.turn.interrupt",
      payload: {
        threadId: "thread-1",
      },
    });

    await outbox.cancel("mobile-cmd-3");

    const remaining = await outbox.list();
    expect(remaining.map((command) => command.commandId)).toEqual(["mobile-cmd-4"]);
  });
});

function createRecordingStore(onSave: (commands: readonly unknown[]) => void) {
  const store = createInMemoryCommandOutboxStore();
  return {
    async load() {
      return store.load();
    },
    async save(commands: Parameters<typeof store.save>[0]) {
      onSave(commands);
      await store.save(commands);
    },
  };
}

function createCommandIdGenerator(ids: readonly string[]) {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (!id) throw new Error("No command id left in test generator.");
    return id;
  };
}

function createSteppedClock() {
  let index = 0;
  return () => {
    const date = new Date(Date.UTC(2026, 4, 19, 12, 0, index));
    index += 1;
    return date;
  };
}
