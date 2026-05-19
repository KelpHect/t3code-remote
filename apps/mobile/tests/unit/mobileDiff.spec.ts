import { describe, expect, test } from "vitest";

import {
  MOBILE_DIFF_PREVIEW_LINE_LIMIT,
  mapMobileUnifiedDiff,
  parseUnifiedDiffFiles,
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
});
