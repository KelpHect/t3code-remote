import { describe, expect, test } from "vitest";

import {
  mapMobileGitProgressEvent,
  mapMobileGitStatus,
  reduceMobileGitStatusEvent,
} from "@/client/mobileGit";

describe("mobile git helpers", () => {
  test("maps current vcs status shape", () => {
    const status = mapMobileGitStatus(
      {
        aheadCount: 2,
        behindCount: 1,
        hasPrimaryRemote: true,
        hasWorkingTreeChanges: true,
        isRepo: true,
        pr: { number: 42, state: "open", title: "Mobile git", url: "https://example.test/pr/42" },
        refName: "main",
        workingTree: {
          deletions: 1,
          files: [{ deletions: 1, insertions: 3, path: "apps/mobile/src/client/mobileGit.ts" }],
          insertions: 3,
        },
      },
      "/repo",
    );

    expect(status).toMatchObject({
      ahead: 2,
      behind: 1,
      branch: "main",
      files: [{ deletions: 1, insertions: 3, path: "apps/mobile/src/client/mobileGit.ts" }],
      hasChanges: true,
      pr: { number: 42, state: "open" },
    });
  });

  test("maps legacy fixture status shape", () => {
    expect(
      mapMobileGitStatus(
        {
          ahead: 0,
          behind: 0,
          branch: "main",
          cwd: "/repo",
          files: [{ insertions: 1, path: "TODO.md" }],
        },
        "/fallback",
      ),
    ).toMatchObject({
      branch: "main",
      cwd: "/repo",
      files: [{ deletions: 0, insertions: 1, path: "TODO.md" }],
      hasChanges: true,
    });
  });

  test("reduces status stream snapshots and updates", () => {
    const snapshot = reduceMobileGitStatusEvent(
      null,
      {
        _tag: "snapshot",
        local: {
          hasPrimaryRemote: true,
          hasWorkingTreeChanges: false,
          isRepo: true,
          refName: "main",
          workingTree: { deletions: 0, files: [], insertions: 0 },
        },
        remote: { aheadCount: 0, behindCount: 0, pr: null },
      },
      "/repo",
    );
    const updated = reduceMobileGitStatusEvent(
      snapshot,
      {
        _tag: "localUpdated",
        local: {
          hasPrimaryRemote: true,
          hasWorkingTreeChanges: true,
          isRepo: true,
          refName: "main",
          workingTree: {
            deletions: 2,
            files: [{ deletions: 2, insertions: 0, path: "README.md" }],
            insertions: 0,
          },
        },
      },
      "/repo",
    );

    expect(updated).toMatchObject({
      ahead: 0,
      branch: "main",
      files: [{ deletions: 2, path: "README.md" }],
      hasChanges: true,
    });
  });

  test("maps progress events into bounded log entries", () => {
    expect(
      mapMobileGitProgressEvent({
        action: "commit_push",
        actionId: "action-1",
        kind: "phase_started",
        label: "Creating commit",
        phase: "commit",
      }),
    ).toMatchObject({
      action: "commit_push",
      actionId: "action-1",
      kind: "phase_started",
      label: "Creating commit",
      tone: "info",
    });

    expect(
      mapMobileGitProgressEvent({
        action: "push",
        actionId: "action-2",
        kind: "hook_output",
        stream: "stderr",
        text: "remote rejected",
      }),
    ).toMatchObject({
      detail: "remote rejected",
      tone: "warning",
    });
  });
});
