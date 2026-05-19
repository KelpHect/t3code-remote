import { describe, expect, test } from "vitest";

import {
  inferMobileProjectTitle,
  isLikelyRemoteUrl,
  mapMobileCloneResult,
  mapMobileFilesystemBrowseResult,
  mapMobileProjectSearchResult,
  mapMobileRepositoryInfo,
} from "@/client/mobileFiles";

describe("mobile file and clone helpers", () => {
  test("maps filesystem browse results", () => {
    expect(
      mapMobileFilesystemBrowseResult({
        entries: [
          { fullPath: "/repo/apps", name: "apps" },
          { fullPath: "", name: "ignored" },
        ],
        parentPath: "/repo",
      }),
    ).toEqual({
      entries: [{ fullPath: "/repo/apps", name: "apps" }],
      parentPath: "/repo",
    });
  });

  test("maps project file search entries", () => {
    expect(
      mapMobileProjectSearchResult({
        entries: [
          { kind: "file", parentPath: "src", path: "src/App.vue" },
          { kind: "directory", path: "src/client" },
          { kind: "other", path: "ignored" },
        ],
        truncated: true,
      }),
    ).toEqual({
      entries: [
        { kind: "file", parentPath: "src", path: "src/App.vue" },
        { kind: "directory", parentPath: null, path: "src/client" },
      ],
      truncated: true,
    });
  });

  test("maps repository lookup and clone results", () => {
    expect(
      mapMobileRepositoryInfo({
        nameWithOwner: "KelpHect/t3code-remote",
        provider: "github",
        sshUrl: "git@github.com:KelpHect/t3code-remote.git",
        url: "https://github.com/KelpHect/t3code-remote",
      }),
    ).toMatchObject({
      nameWithOwner: "KelpHect/t3code-remote",
      provider: "github",
    });

    expect(
      mapMobileCloneResult({
        cwd: "/repo/t3code-remote",
        remoteUrl: "git@github.com:KelpHect/t3code-remote.git",
        repository: { nameWithOwner: "KelpHect/t3code-remote", provider: "github" },
      }),
    ).toMatchObject({
      cwd: "/repo/t3code-remote",
      repository: { nameWithOwner: "KelpHect/t3code-remote" },
    });
  });

  test("infers project title and remote URL inputs", () => {
    expect(inferMobileProjectTitle("/home/user/Projects/t3code-remote/")).toBe("t3code-remote");
    expect(isLikelyRemoteUrl("https://github.com/KelpHect/t3code-remote")).toBe(true);
    expect(isLikelyRemoteUrl("KelpHect/t3code-remote")).toBe(false);
  });
});
