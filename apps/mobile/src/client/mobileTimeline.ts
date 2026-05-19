import type {
  MobileLatestTurn,
  MobileProposedPlan,
  MobileThreadActivity,
  MobileThreadDetail,
  MobileThreadMessage,
  MobileTurnDiffSummary,
} from "@/client/mobileThread";

export const MAX_VISIBLE_MOBILE_WORK_ENTRIES = 4;

export interface MobileWorkLogEntry {
  readonly id: string;
  readonly createdAt: string | null;
  readonly label: string;
  readonly detail: string | null;
  readonly command: string | null;
  readonly changedFiles: readonly string[];
  readonly tone: "thinking" | "tool" | "info" | "error";
  readonly itemType: string | null;
  readonly turnId: string | null;
}

export type MobileTimelineRow =
  | {
      readonly kind: "message";
      readonly id: string;
      readonly createdAt: string | null;
      readonly message: MobileThreadMessage;
      readonly durationLabel: string | null;
      readonly changedFiles: readonly MobileTurnDiffSummary["files"][number][];
    }
  | {
      readonly kind: "work";
      readonly id: string;
      readonly createdAt: string | null;
      readonly entries: readonly MobileWorkLogEntry[];
      readonly hiddenCount: number;
    }
  | {
      readonly kind: "proposed-plan";
      readonly id: string;
      readonly createdAt: string | null;
      readonly proposedPlan: MobileProposedPlan;
    }
  | {
      readonly kind: "working";
      readonly id: "working";
      readonly createdAt: string | null;
    };

export function deriveMobileTimelineRows(thread: MobileThreadDetail): readonly MobileTimelineRow[] {
  const latestTurnId = thread.latestTurn?.turnId ?? null;
  const workEntries = deriveMobileWorkLogEntries(thread.activities, latestTurnId);
  const timelineEntries = [
    ...thread.messages.map((message) => ({
      createdAt: message.createdAt,
      id: message.id,
      kind: "message" as const,
      message,
    })),
    ...thread.proposedPlans.map((proposedPlan) => ({
      createdAt: proposedPlan.createdAt,
      id: proposedPlan.id,
      kind: "proposed-plan" as const,
      proposedPlan,
    })),
    ...workEntries.map((entry) => ({
      createdAt: entry.createdAt,
      entry,
      id: entry.id,
      kind: "work" as const,
    })),
  ].toSorted(compareTimelineEntries);

  const turnDiffByAssistantMessageId = new Map(
    thread.turnDiffSummaries.flatMap((summary) =>
      summary.assistantMessageId ? [[summary.assistantMessageId, summary] as const] : [],
    ),
  );
  const messageDurationStart = computeMessageDurationStart(thread.messages);
  const rows: MobileTimelineRow[] = [];

  for (let index = 0; index < timelineEntries.length; index += 1) {
    const entry = timelineEntries[index];
    if (!entry) continue;

    if (entry.kind === "work") {
      const groupedEntries = [entry.entry];
      let cursor = index + 1;
      while (cursor < timelineEntries.length) {
        const next = timelineEntries[cursor];
        if (!next || next.kind !== "work") break;
        groupedEntries.push(next.entry);
        cursor += 1;
      }
      const visibleEntries =
        groupedEntries.length > MAX_VISIBLE_MOBILE_WORK_ENTRIES
          ? groupedEntries.slice(-MAX_VISIBLE_MOBILE_WORK_ENTRIES)
          : groupedEntries;
      rows.push({
        createdAt: entry.createdAt,
        entries: visibleEntries,
        hiddenCount: groupedEntries.length - visibleEntries.length,
        id: entry.id,
        kind: "work",
      });
      index = cursor - 1;
      continue;
    }

    if (entry.kind === "proposed-plan") {
      rows.push({
        createdAt: entry.createdAt,
        id: entry.id,
        kind: "proposed-plan",
        proposedPlan: entry.proposedPlan,
      });
      continue;
    }

    const summary = turnDiffByAssistantMessageId.get(entry.message.id);
    rows.push({
      changedFiles: summary?.files ?? [],
      createdAt: entry.createdAt,
      durationLabel: formatMessageDuration(
        messageDurationStart.get(entry.message.id) ?? entry.message.createdAt,
        entry.message.completedAt,
        thread.latestTurn,
      ),
      id: entry.id,
      kind: "message",
      message: entry.message,
    });
  }

  if (isThreadWorking(thread)) {
    rows.push({
      createdAt: thread.latestTurn?.startedAt ?? thread.session?.updatedAt ?? null,
      id: "working",
      kind: "working",
    });
  }

  return rows;
}

export function deriveMobileWorkLogEntries(
  activities: readonly MobileThreadActivity[],
  latestTurnId: string | null,
): readonly MobileWorkLogEntry[] {
  const entries = sortActivities(activities)
    .filter((activity) => (latestTurnId ? activity.turnId === latestTurnId : true))
    .filter((activity) => activity.kind !== "tool.started")
    .filter((activity) => activity.kind !== "task.started")
    .filter((activity) => activity.kind !== "context-window.updated")
    .filter((activity) => activity.summary !== "Checkpoint captured")
    .filter((activity) => !isPlanBoundaryToolActivity(activity))
    .map(toMobileWorkLogEntry)
    .filter((entry) => entry !== null);
  return collapseMobileWorkEntries(entries);
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";
  const deltaMs = Date.now() - timestamp;
  if (deltaMs < 30_000) return "now";
  if (deltaMs < 60_000) return "1m";
  if (deltaMs < 60 * 60_000) return `${Math.round(deltaMs / 60_000)}m`;
  if (deltaMs < 24 * 60 * 60_000) return `${Math.round(deltaMs / 3_600_000)}h`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function computeMessageDurationStart(messages: readonly MobileThreadMessage[]) {
  const result = new Map<string, string | null>();
  let lastBoundary: string | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      lastBoundary = message.createdAt;
    }
    result.set(message.id, lastBoundary ?? message.createdAt);
    if (message.role === "assistant" && message.completedAt) {
      lastBoundary = message.completedAt;
    }
  }
  return result;
}

function formatMessageDuration(
  startedAt: string | null,
  completedAt: string | null,
  latestTurn: MobileLatestTurn | null,
) {
  if (!startedAt || !completedAt) return null;
  if (latestTurn?.completedAt === null && latestTurn.startedAt === startedAt) return null;
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (Number.isNaN(started) || Number.isNaN(completed) || completed < started) return null;
  return formatDuration(completed - started);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.max(1, Math.round(durationMs))}ms`;
  if (durationMs < 10_000) return `${(durationMs / 1_000).toFixed(1)}s`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1_000)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function isThreadWorking(thread: MobileThreadDetail) {
  return (
    thread.session?.status === "running" ||
    thread.latestTurn?.state === "running" ||
    thread.messages.some((message) => message.role === "assistant" && message.streaming)
  );
}

function toMobileWorkLogEntry(activity: MobileThreadActivity): MobileWorkLogEntry | null {
  const payload = activity.payload;
  const detail = extractDetail(payload);
  const command = extractCommand(payload, detail);
  const changedFiles = extractChangedFiles(payload);
  const title = readString(payload?.title);
  const itemType = readString(payload?.itemType);
  const isTaskActivity = activity.kind === "task.progress" || activity.kind === "task.completed";
  const label =
    (isTaskActivity ? readString(payload?.summary) : null) ??
    title ??
    normalizeCompactToolLabel(activity.summary);
  if (!label) return null;
  return {
    changedFiles,
    command,
    createdAt: activity.createdAt,
    detail: command ? null : detail,
    id: activity.id,
    itemType,
    label,
    tone:
      activity.kind === "task.progress"
        ? "thinking"
        : activity.tone === "error"
          ? "error"
          : activity.tone === "tool"
            ? "tool"
            : "info",
    turnId: activity.turnId,
  };
}

function collapseMobileWorkEntries(
  entries: readonly MobileWorkLogEntry[],
): readonly MobileWorkLogEntry[] {
  const collapsed: MobileWorkLogEntry[] = [];
  for (const entry of entries) {
    const previous = collapsed.at(-1);
    if (previous && shouldCollapseWorkEntry(previous, entry)) {
      collapsed[collapsed.length - 1] = {
        ...previous,
        ...entry,
        changedFiles: [...new Set([...previous.changedFiles, ...entry.changedFiles])],
        command: entry.command ?? previous.command,
        detail: entry.detail ?? previous.detail,
      };
      continue;
    }
    collapsed.push(entry);
  }
  return collapsed;
}

function shouldCollapseWorkEntry(previous: MobileWorkLogEntry, next: MobileWorkLogEntry) {
  if (previous.turnId !== next.turnId) return false;
  if (previous.itemType && previous.itemType === next.itemType) return true;
  return (
    normalizeCompactToolLabel(previous.label).toLowerCase() ===
      normalizeCompactToolLabel(next.label).toLowerCase() &&
    (previous.command === next.command || previous.detail === next.detail)
  );
}

function isPlanBoundaryToolActivity(activity: MobileThreadActivity): boolean {
  if (activity.kind !== "tool.updated" && activity.kind !== "tool.completed") return false;
  return readString(activity.payload?.detail)?.startsWith("ExitPlanMode:") === true;
}

function extractDetail(payload: Record<string, unknown> | null) {
  const detail = readString(payload?.detail);
  if (!detail) return null;
  return stripTrailingExitCode(detail);
}

function extractCommand(payload: Record<string, unknown> | null, detail: string | null) {
  const data = readRecord(payload?.data);
  const direct = readString(data?.command);
  if (direct) return unwrapKnownShellCommandWrapper(direct);
  if (payload?.itemType === "command_execution" && detail) {
    return unwrapKnownShellCommandWrapper(detail);
  }
  return null;
}

function extractChangedFiles(payload: Record<string, unknown> | null): readonly string[] {
  const data = readRecord(payload?.data);
  const rawOutput = readRecord(data?.rawOutput);
  const files = readArray(rawOutput?.files)
    .map((file) => (typeof file === "string" ? file : null))
    .filter((file) => file !== null);
  return files.slice(0, 6);
}

function stripTrailingExitCode(value: string) {
  return value.replace(/\n?\s*Exit code:\s*-?\d+\s*$/i, "").trim();
}

function unwrapKnownShellCommandWrapper(value: string) {
  const trimmed = value.trim();
  const match = /(?:^|\/)(?:bash|sh|zsh)\s+-l?c\s+(['"])([\s\S]*)\1$/u.exec(trimmed);
  return match?.[2]?.trim() || trimmed;
}

function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

function compareTimelineEntries(
  left: { readonly createdAt: string | null; readonly id: string },
  right: { readonly createdAt: string | null; readonly id: string },
) {
  return (
    (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.id.localeCompare(right.id)
  );
}

function sortActivities(activities: readonly MobileThreadActivity[]) {
  return activities.toSorted((left, right) => {
    if (left.sequence !== null && right.sequence !== null && left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
    return (
      (left.createdAt ?? "").localeCompare(right.createdAt ?? "") || left.id.localeCompare(right.id)
    );
  });
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
