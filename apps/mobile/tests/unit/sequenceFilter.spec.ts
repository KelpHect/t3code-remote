import { describe, expect, test } from "vitest";

import { extractMobileSequence, MobileSequenceFilter } from "@/client/sequenceFilter";

interface ThreadPreviewState {
  readonly title: string;
  readonly messageCount: number;
}

describe("mobile sequence filtering", () => {
  test("extracts direct, snapshot, event, and result sequences", () => {
    expect(extractMobileSequence({ sequence: 10 })).toBe(10);
    expect(extractMobileSequence({ snapshot: { snapshotSequence: 11 } })).toBe(11);
    expect(extractMobileSequence({ event: { sequence: 12 } })).toBe(12);
    expect(extractMobileSequence({ result: { sequence: 13 } })).toBe(13);
    expect(extractMobileSequence({ snapshot: { snapshotSequence: -1 } })).toBeNull();
  });

  test("ignores stale and duplicate shell events so project/thread state cannot regress", () => {
    const filter = new MobileSequenceFilter();
    let state: ThreadPreviewState = {
      messageCount: 1,
      title: "Current title",
    };

    state = filter.apply(
      "shell",
      makeThreadEvent(20, "New title", 2),
      state,
      applyThreadEvent,
    ).state;
    state = filter.apply(
      "shell",
      makeThreadEvent(20, "Duplicate old title", 1),
      state,
      applyThreadEvent,
    ).state;
    state = filter.apply(
      "shell",
      makeThreadEvent(19, "Stale old title", 0),
      state,
      applyThreadEvent,
    ).state;

    expect(state).toEqual({
      messageCount: 2,
      title: "New title",
    });
    expect(filter.getLastSequence("shell")).toBe(20);
  });

  test("accepts thread snapshots only when snapshotSequence increases", () => {
    const filter = new MobileSequenceFilter();
    let state: ThreadPreviewState = {
      messageCount: 0,
      title: "Empty",
    };

    state = filter.apply(
      "thread:1",
      makeSnapshot(50, "Live thread", 4),
      state,
      applyThreadSnapshot,
    ).state;
    state = filter.apply(
      "thread:1",
      makeSnapshot(49, "Older snapshot", 1),
      state,
      applyThreadSnapshot,
    ).state;
    state = filter.apply(
      "thread:1",
      makeSnapshot(51, "Fresh snapshot", 5),
      state,
      applyThreadSnapshot,
    ).state;

    expect(state).toEqual({
      messageCount: 5,
      title: "Fresh snapshot",
    });
    expect(filter.getLastSequence("thread:1")).toBe(51);
  });

  test("keeps shell and per-thread scopes independent", () => {
    const filter = new MobileSequenceFilter(new Map([["shell", 100]]));

    expect(filter.accept("shell", { sequence: 100 }).reason).toBe("stale-or-duplicate");
    expect(filter.accept("thread:1", { sequence: 1 }).reason).toBe("accepted");
    expect(filter.getLastSequence("shell")).toBe(100);
    expect(filter.getLastSequence("thread:1")).toBe(1);
  });

  test("does not advance a scope for malformed updates", () => {
    const filter = new MobileSequenceFilter();

    expect(filter.accept("shell", { kind: "thread-upserted" })).toMatchObject({
      applied: false,
      reason: "missing-sequence",
    });
    expect(filter.getLastSequence("shell")).toBeNull();
  });
});

function makeThreadEvent(sequence: number, title: string, messageCount: number) {
  return {
    kind: "thread-upserted",
    messageCount,
    sequence,
    thread: {
      title,
    },
  };
}

function makeSnapshot(sequence: number, title: string, messageCount: number) {
  return {
    kind: "snapshot",
    snapshot: {
      messageCount,
      snapshotSequence: sequence,
      thread: {
        title,
      },
    },
  };
}

function applyThreadEvent(state: ThreadPreviewState, payload: unknown): ThreadPreviewState {
  const event = payload as ReturnType<typeof makeThreadEvent>;
  return {
    messageCount: event.messageCount,
    title: event.thread.title,
  };
}

function applyThreadSnapshot(state: ThreadPreviewState, payload: unknown): ThreadPreviewState {
  const snapshot = (payload as ReturnType<typeof makeSnapshot>).snapshot;
  return {
    messageCount: snapshot.messageCount,
    title: snapshot.thread.title,
  };
}
