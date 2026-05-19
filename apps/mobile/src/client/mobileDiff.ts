import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export interface MobileDiffFile {
  readonly path: string;
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly status: string | null;
  readonly additions: number;
  readonly deletions: number;
}

export type MobileDiffLineType = "file" | "hunk" | "add" | "del" | "context" | "meta";

export interface MobileDiffLine {
  readonly id: string;
  readonly type: MobileDiffLineType;
  readonly text: string;
}

export interface MobileDiffFileBlock extends MobileDiffFile {
  readonly diff: string;
  readonly lines: readonly MobileDiffLine[];
}

export interface MobileUnifiedDiff {
  readonly threadId: string | null;
  readonly fromTurnCount: number | null;
  readonly toTurnCount: number | null;
  readonly diff: string;
  readonly files: readonly MobileDiffFile[];
  readonly fileBlocks: readonly MobileDiffFileBlock[];
  readonly lineCount: number;
  readonly truncated: boolean;
  readonly binary: boolean;
  readonly empty: boolean;
}

export const MOBILE_DIFF_PREVIEW_LINE_LIMIT = 1200;

export async function loadMobileFullThreadDiff(input: {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly toTurnCount: number;
  readonly ignoreWhitespace: boolean;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    const result = await client.getFullThreadDiff({
      ignoreWhitespace: input.ignoreWhitespace,
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
    });
    return mapMobileUnifiedDiff(result);
  } finally {
    client.dispose();
  }
}

export async function loadMobileTurnDiff(input: {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly fromTurnCount: number;
  readonly toTurnCount: number;
  readonly ignoreWhitespace: boolean;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    const result = await client.getTurnDiff({
      fromTurnCount: input.fromTurnCount,
      ignoreWhitespace: input.ignoreWhitespace,
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
    });
    return mapMobileUnifiedDiff(result);
  } finally {
    client.dispose();
  }
}

export function mapMobileUnifiedDiff(result: unknown): MobileUnifiedDiff {
  const value = readObject(result);
  const diff = typeof value?.diff === "string" ? value.diff : "";
  const fileSummaries = readArray(value?.files).map(mapDiffFile).filter(isPresent);
  const parsedFiles = diff ? parseUnifiedDiffFiles(diff) : [];
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  const previewLines = lines.slice(0, MOBILE_DIFF_PREVIEW_LINE_LIMIT);
  const truncated = lines.length > MOBILE_DIFF_PREVIEW_LINE_LIMIT;
  const previewDiff = truncated
    ? `${previewLines.join("\n")}\n... truncated ${lines.length - MOBILE_DIFF_PREVIEW_LINE_LIMIT} lines ...`
    : diff;
  const parsedBlocks = previewDiff ? parseUnifiedDiffFileBlocks(previewDiff) : [];

  return {
    binary: /(^|\n)(Binary files|GIT binary patch)/.test(diff),
    diff: previewDiff,
    empty: diff.trim().length === 0 && fileSummaries.length === 0,
    fileBlocks: parsedBlocks,
    files:
      parsedBlocks.length > 0 ? parsedBlocks : parsedFiles.length > 0 ? parsedFiles : fileSummaries,
    fromTurnCount: readNonNegativeInt(value?.fromTurnCount),
    lineCount: diff.trim().length === 0 ? 0 : lines.length,
    threadId: readString(value?.threadId),
    toTurnCount: readNonNegativeInt(value?.toTurnCount),
    truncated,
  };
}

export function parseUnifiedDiffFiles(diff: string): readonly MobileDiffFile[] {
  const files: MobileDiffFile[] = [];
  let current: {
    path: string;
    oldPath: string | null;
    newPath: string | null;
    additions: number;
    deletions: number;
  } | null = null;

  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      if (current) files.push(toDiffFile(current));
      current = {
        additions: 0,
        deletions: 0,
        newPath: header[2] ?? null,
        oldPath: header[1] ?? null,
        path: header[2] ?? header[1] ?? "unknown",
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("rename to ")) {
      current.newPath = line.slice("rename to ".length).trim() || current.newPath;
      current.path = current.newPath ?? current.path;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      current.newPath = line.slice("+++ b/".length).trim() || current.newPath;
      current.path = current.newPath ?? current.path;
      continue;
    }
    if (line.startsWith("--- a/")) {
      current.oldPath = line.slice("--- a/".length).trim() || current.oldPath;
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }

  if (current) files.push(toDiffFile(current));
  return files;
}

export function parseUnifiedDiffFileBlocks(diff: string): readonly MobileDiffFileBlock[] {
  const blocks: MobileDiffFileBlock[] = [];
  let current: {
    path: string;
    oldPath: string | null;
    newPath: string | null;
    additions: number;
    deletions: number;
    lines: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const blockDiff = current.lines.join("\n");
    blocks.push({
      ...toDiffFile(current),
      diff: blockDiff,
      lines: parseUnifiedDiffLines(blockDiff),
    });
    current = null;
  };

  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (header) {
      flush();
      current = {
        additions: 0,
        deletions: 0,
        lines: [line],
        newPath: header[2] ?? null,
        oldPath: header[1] ?? null,
        path: header[2] ?? header[1] ?? "unknown",
      };
      continue;
    }
    if (!current) {
      current = {
        additions: 0,
        deletions: 0,
        lines: [line],
        newPath: null,
        oldPath: null,
        path: "Diff preview",
      };
      continue;
    }
    current.lines.push(line);
    if (line.startsWith("rename to ")) {
      current.newPath = line.slice("rename to ".length).trim() || current.newPath;
      current.path = current.newPath ?? current.path;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      current.newPath = line.slice("+++ b/".length).trim() || current.newPath;
      current.path = current.newPath ?? current.path;
      continue;
    }
    if (line.startsWith("--- a/")) {
      current.oldPath = line.slice("--- a/".length).trim() || current.oldPath;
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }

  flush();
  return blocks;
}

export function parseUnifiedDiffLines(diff: string): readonly MobileDiffLine[] {
  return diff
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => ({
      id: `${index}-${line.slice(0, 24)}`,
      text: line,
      type: classifyDiffLine(line),
    }));
}

function toDiffFile(input: {
  readonly path: string;
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly additions: number;
  readonly deletions: number;
}): MobileDiffFile {
  return {
    additions: input.additions,
    deletions: input.deletions,
    newPath: input.newPath,
    oldPath: input.oldPath,
    path: input.path,
    status: null,
  };
}

function classifyDiffLine(line: string): MobileDiffLineType {
  if (line.startsWith("diff --git")) return "file";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "add";
  if (line.startsWith("-") && !line.startsWith("---")) return "del";
  if (line.startsWith(" ") || line.length === 0) return "context";
  return "meta";
}

function mapDiffFile(file: unknown): MobileDiffFile | null {
  const value = readObject(file);
  if (!value) return null;
  const oldPath = readString(value.oldPath);
  const newPath = readString(value.newPath);
  const path = readString(value.path) ?? newPath ?? oldPath;
  if (!path) return null;
  return {
    additions: readNonNegativeInt(value.additions) ?? 0,
    deletions: readNonNegativeInt(value.deletions) ?? 0,
    newPath,
    oldPath,
    path,
    status: readString(value.status),
  };
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNonNegativeInt(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
