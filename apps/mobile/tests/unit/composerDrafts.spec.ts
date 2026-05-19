import { describe, expect, test } from "vitest";

import {
  createInMemoryComposerDraftStorage,
  makeComposerDraftKey,
  MobileComposerDraftStore,
} from "@/client/composerDrafts";

describe("mobile composer drafts", () => {
  test("keys drafts by backend, project, and thread", () => {
    const firstThread = makeComposerDraftKey({
      backendUrl: "http://10.0.2.2:3773/session-path",
      projectId: "project-1",
      threadId: "thread-1",
    });
    const secondThread = makeComposerDraftKey({
      backendUrl: "http://10.0.2.2:3773",
      projectId: "project-1",
      threadId: "thread-2",
    });

    expect(firstThread).not.toBe(secondThread);
    expect(firstThread).toBe("http%3A%2F%2F10.0.2.2%3A3773/project-1/thread-1");
  });

  test("persists drafts across store instances using the same device storage", () => {
    const storage = createInMemoryComposerDraftStorage();
    const ref = {
      backendUrl: "http://10.0.2.2:3773",
      projectId: "t3code-remote",
      threadId: "mobile-ui",
    };
    const firstStore = new MobileComposerDraftStore({
      now: () => new Date("2026-05-19T16:00:00.000Z"),
      storage,
    });
    firstStore.save(ref, "Continue polishing the composer");

    const secondStore = new MobileComposerDraftStore({ storage });

    expect(secondStore.load(ref)).toEqual({
      key: "http%3A%2F%2F10.0.2.2%3A3773/t3code-remote/mobile-ui",
      backendUrl: "http://10.0.2.2:3773",
      projectId: "t3code-remote",
      threadId: "mobile-ui",
      text: "Continue polishing the composer",
      updatedAt: "2026-05-19T16:00:00.000Z",
    });
  });

  test("keeps drafts isolated between backends and threads", () => {
    const store = new MobileComposerDraftStore({
      now: createSteppedClock(),
      storage: createInMemoryComposerDraftStorage(),
    });

    store.save(
      {
        backendUrl: "http://10.0.2.2:3773",
        projectId: "project-1",
        threadId: "thread-1",
      },
      "Emulator draft",
    );
    store.save(
      {
        backendUrl: "http://192.168.1.50:3773",
        projectId: "project-1",
        threadId: "thread-1",
      },
      "LAN draft",
    );

    expect(
      store.load({
        backendUrl: "http://10.0.2.2:3773",
        projectId: "project-1",
        threadId: "thread-1",
      })?.text,
    ).toBe("Emulator draft");
    expect(
      store.load({
        backendUrl: "http://192.168.1.50:3773",
        projectId: "project-1",
        threadId: "thread-1",
      })?.text,
    ).toBe("LAN draft");
  });

  test("removes blank drafts instead of keeping empty backend state", () => {
    const store = new MobileComposerDraftStore({
      storage: createInMemoryComposerDraftStorage(),
    });
    const ref = {
      backendUrl: "http://10.0.2.2:3773",
      projectId: "project-1",
      threadId: "thread-1",
    };
    store.save(ref, "Draft");
    store.save(ref, "   ");

    expect(store.load(ref)).toBeNull();
    expect(store.list()).toEqual([]);
  });

  test("ignores malformed persisted storage", () => {
    const storage = createInMemoryComposerDraftStorage({
      "t3.mobile.composerDrafts.v1": JSON.stringify({
        valid: {
          key: "valid",
          backendUrl: "http://10.0.2.2:3773",
          projectId: "project-1",
          threadId: "thread-1",
          text: "Recovered draft",
          updatedAt: "2026-05-19T16:00:00.000Z",
        },
        stale: {
          key: "different-key",
          backendUrl: "http://10.0.2.2:3773",
          projectId: "project-1",
          threadId: "thread-2",
          text: "Ignored draft",
          updatedAt: "2026-05-19T16:01:00.000Z",
        },
        malformed: {
          key: "malformed",
          text: "",
        },
      }),
    });
    const store = new MobileComposerDraftStore({ storage });

    expect(store.list()).toEqual([
      {
        key: "valid",
        backendUrl: "http://10.0.2.2:3773",
        projectId: "project-1",
        threadId: "thread-1",
        text: "Recovered draft",
        updatedAt: "2026-05-19T16:00:00.000Z",
      },
    ]);
  });
});

function createSteppedClock() {
  let index = 0;
  return () => {
    const date = new Date(Date.UTC(2026, 4, 19, 16, 0, index));
    index += 1;
    return date;
  };
}
