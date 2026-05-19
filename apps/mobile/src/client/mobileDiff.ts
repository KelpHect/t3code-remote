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

export interface MobileUnifiedDiff {
  readonly threadId: string | null;
  readonly fromTurnCount: number | null;
  readonly toTurnCount: number | null;
  readonly diff: string;
  readonly files: readonly MobileDiffFile[];
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

  return {
    binary: /(^|\n)(Binary files|GIT binary patch)/.test(diff),
    diff: previewDiff,
    empty: diff.trim().length === 0 && fileSummaries.length === 0,
    files: parsedFiles.length > 0 ? parsedFiles : fileSummaries,
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
