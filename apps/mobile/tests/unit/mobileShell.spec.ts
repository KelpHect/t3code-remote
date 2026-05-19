import { describe, expect, test } from "vitest";

import {
  createEmptyMobileShellState,
  reduceMobileShellStreamItem,
  type MobileShellState,
} from "@/client/mobileShell";

describe("mobile shell state", () => {
  test("maps shell snapshots into app-owned projects and threads", () => {
    const state = reduceMobileShellStreamItem(createEmptyMobileShellState(), {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 10,
        projects: [
          {
            id: "project-1",
            title: "t3code-remote",
            workspaceRoot: "/redacted/t3code-remote",
            repositoryIdentity: {
              displayName: "owner/t3code-remote",
            },
            updatedAt: "2026-05-19T10:00:00.000Z",
          },
        ],
        threads: [
          makeThread({
            id: "thread-old",
            latestUserMessageAt: "2026-05-19T09:00:00.000Z",
            title: "Older work",
          }),
          makeThread({
            id: "thread-new",
            latestUserMessageAt: "2026-05-19T11:00:00.000Z",
            title: "Newer work",
          }),
        ],
      },
    });

    expect(state.sequence).toBe(10);
    expect(state.projects).toEqual([
      {
        id: "project-1",
        repositoryDisplayName: "owner/t3code-remote",
        title: "t3code-remote",
        updatedAt: "2026-05-19T10:00:00.000Z",
        workspaceRoot: "/redacted/t3code-remote",
      },
    ]);
    expect(state.threads.map((thread) => thread.id)).toEqual(["thread-new", "thread-old"]);
    expect(state.threads[0]).toMatchObject({
      branch: "main",
      hasPendingApprovals: false,
      interactionMode: "default",
      modelLabel: "codex · gpt-5.5",
      runtimeMode: "full-access",
    });
  });

  test("applies project and thread upserts by increasing sequence", () => {
    const initial: MobileShellState = {
      projects: [],
      sequence: 4,
      threads: [],
    };

    const withProject = reduceMobileShellStreamItem(initial, {
      kind: "project-upserted",
      sequence: 5,
      project: {
        id: "project-1",
        title: "lockwell",
        workspaceRoot: "/redacted/lockwell",
      },
    });
    const withThread = reduceMobileShellStreamItem(withProject, {
      kind: "thread-upserted",
      sequence: 6,
      thread: makeThread({
        id: "thread-1",
        projectId: "project-1",
        title: "Investigate backend compatibility",
      }),
    });

    expect(withThread.sequence).toBe(6);
    expect(withThread.projects[0]?.title).toBe("lockwell");
    expect(withThread.threads[0]?.title).toBe("Investigate backend compatibility");
  });

  test("ignores stale or duplicate shell events", () => {
    const state = reduceMobileShellStreamItem(createEmptyMobileShellState(), {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 10,
        projects: [{ id: "project-1", title: "Original", workspaceRoot: "/repo" }],
        threads: [],
      },
    });
    const stale = reduceMobileShellStreamItem(state, {
      kind: "project-upserted",
      sequence: 10,
      project: {
        id: "project-1",
        title: "Stale",
        workspaceRoot: "/repo",
      },
    });

    expect(stale).toEqual(state);
  });

  test("removes projects and their threads", () => {
    const state = reduceMobileShellStreamItem(createEmptyMobileShellState(), {
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 10,
        projects: [{ id: "project-1", title: "Project", workspaceRoot: "/repo" }],
        threads: [makeThread({ id: "thread-1", projectId: "project-1" })],
      },
    });

    const next = reduceMobileShellStreamItem(state, {
      kind: "project-removed",
      projectId: "project-1",
      sequence: 11,
    });

    expect(next.projects).toEqual([]);
    expect(next.threads).toEqual([]);
  });
});

function makeThread(input: {
  readonly id: string;
  readonly projectId?: string;
  readonly title?: string;
  readonly latestUserMessageAt?: string | null;
}) {
  return {
    archivedAt: null,
    branch: "main",
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    id: input.id,
    interactionMode: "default",
    latestUserMessageAt: input.latestUserMessageAt ?? null,
    modelSelection: {
      instanceId: "codex",
      model: "gpt-5.5",
    },
    projectId: input.projectId ?? "project-1",
    runtimeMode: "full-access",
    session: null,
    title: input.title ?? "Thread",
    updatedAt: "2026-05-19T10:00:00.000Z",
    worktreePath: null,
  };
}
