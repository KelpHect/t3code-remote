import { describe, expect, test } from "vitest";

import {
  MOBILE_DIFF_PREVIEW_LINE_LIMIT,
  mapMobileUnifiedDiff,
  parseUnifiedDiffFileBlocks,
  parseUnifiedDiffFiles,
  parseUnifiedDiffLines,
} from "@/client/mobileDiff";

describe("mobile diff helpers", () => {
  test("parses unified diff files and line stats", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1,2 @@",
      "-old",
      "+new",
      "+line",
      " context",
    ].join("\n");

    expect(parseUnifiedDiffFiles(diff)).toEqual([
      {
        additions: 2,
        deletions: 1,
        newPath: "src/a.ts",
        oldPath: "src/a.ts",
        path: "src/a.ts",
        status: null,
      },
    ]);
  });

  test("maps current diff result shape", () => {
    const result = mapMobileUnifiedDiff({
      diff: "diff --git a/TODO.md b/TODO.md\n+done",
      fromTurnCount: 0,
      threadId: "thread-1",
      toTurnCount: 1,
    });

    expect(result).toMatchObject({
      empty: false,
      files: [{ additions: 1, deletions: 0, path: "TODO.md" }],
      fileBlocks: [{ additions: 1, deletions: 0, path: "TODO.md" }],
      fromTurnCount: 0,
      threadId: "thread-1",
      toTurnCount: 1,
      truncated: false,
    });
  });

  test("maps legacy file-only result shape and empty states", () => {
    expect(
      mapMobileUnifiedDiff({
        files: [{ newPath: "README.md", oldPath: "README.md", status: "modified" }],
      }),
    ).toMatchObject({
      empty: false,
      files: [{ path: "README.md", status: "modified" }],
      lineCount: 0,
    });
    expect(mapMobileUnifiedDiff({ diff: "" }).empty).toBe(true);
  });

  test("bounds large patches for mobile rendering", () => {
    const diff = Array.from({ length: MOBILE_DIFF_PREVIEW_LINE_LIMIT + 3 }, (_, index) =>
      index === 0 ? "diff --git a/a b/a" : `+line ${index}`,
    ).join("\n");

    const result = mapMobileUnifiedDiff({ diff });

    expect(result.truncated).toBe(true);
    expect(result.diff).toContain("truncated 3 lines");
  });

  test("splits a unified diff into selectable file blocks and typed lines", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -2 +2 @@",
      " context",
    ].join("\n");

    expect(parseUnifiedDiffFileBlocks(diff)).toMatchObject([
      {
        additions: 1,
        deletions: 1,
        lines: [
          { text: "diff --git a/src/a.ts b/src/a.ts", type: "file" },
          { text: "--- a/src/a.ts", type: "meta" },
          { text: "+++ b/src/a.ts", type: "meta" },
          { text: "@@ -1 +1 @@", type: "hunk" },
          { text: "-old", type: "del" },
          { text: "+new", type: "add" },
        ],
        path: "src/a.ts",
      },
      {
        additions: 0,
        deletions: 0,
        path: "src/b.ts",
      },
    ]);
  });

  test("classifies standalone diff preview lines", () => {
    expect(parseUnifiedDiffLines("+added\n-removed\n unchanged\n@@ -1 +1 @@")).toMatchObject([
      { text: "+added", type: "add" },
      { text: "-removed", type: "del" },
      { text: " unchanged", type: "context" },
      { text: "@@ -1 +1 @@", type: "hunk" },
    ]);
  });
});
