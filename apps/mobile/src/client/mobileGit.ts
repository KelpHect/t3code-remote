import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export type MobileGitAction = "commit" | "push" | "create_pr" | "commit_push" | "commit_push_pr";
export type MobileGitProgressTone = "info" | "success" | "warning" | "danger";

export interface MobileGitFileChange {
  readonly path: string;
  readonly insertions: number;
  readonly deletions: number;
  readonly status: string | null;
}

export interface MobileGitStatus {
  readonly cwd: string;
  readonly isRepo: boolean;
  readonly branch: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly hasPrimaryRemote: boolean;
  readonly hasChanges: boolean;
  readonly insertions: number;
  readonly deletions: number;
  readonly files: readonly MobileGitFileChange[];
  readonly pr: {
    readonly number: number | null;
    readonly title: string;
    readonly url: string | null;
    readonly state: string | null;
  } | null;
}

export interface MobileGitProgressEntry {
  readonly id: string;
  readonly actionId: string;
  readonly action: MobileGitAction | string;
  readonly kind: string;
  readonly label: string;
  readonly detail: string | null;
  readonly tone: MobileGitProgressTone;
  readonly createdAt: string;
}

export interface MobileGitActionResult {
  readonly action: MobileGitAction | string;
  readonly title: string;
  readonly description: string | null;
  readonly prUrl: string | null;
}

export interface MobileRunGitActionInput {
  readonly session: ExistingBackendSession;
  readonly cwd: string;
  readonly action: MobileGitAction;
  readonly commitMessage?: string;
  readonly actionId?: string;
  readonly onProgress?: (entry: MobileGitProgressEntry) => void;
  readonly signal?: AbortSignal;
}

const MAX_PROGRESS_DETAIL_LENGTH = 2000;

export async function refreshMobileGitStatus(input: {
  readonly session: ExistingBackendSession;
  readonly cwd: string;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileGitStatus(await client.refreshVcsStatus(input.cwd), input.cwd);
  } finally {
    client.dispose();
  }
}

export async function startMobileGitStatusSubscription(input: {
  readonly session: ExistingBackendSession;
  readonly cwd: string;
  readonly onStatus: (status: MobileGitStatus) => void;
  readonly onError?: (error: Error) => void;
}) {
  const client = await createExistingBackendClient(input.session);
  await client.connect();
  let current: MobileGitStatus | null = null;
  const unsubscribe = client.subscribeVcsStatus(
    input.cwd,
    (event) => {
      current = reduceMobileGitStatusEvent(current, event, input.cwd);
      if (current) input.onStatus(current);
    },
    {
      onError: () => {
        input.onError?.(new Error("Git status stream disconnected."));
      },
    },
  );

  return () => {
    unsubscribe();
    client.dispose();
  };
}

export async function runMobileGitAction(input: MobileRunGitActionInput) {
  const actionId = input.actionId ?? createMobileGitActionId();
  const payload: Record<string, unknown> = {
    action: input.action,
    actionId,
    cwd: input.cwd,
  };
  if (input.commitMessage?.trim()) {
    payload.commitMessage = input.commitMessage.trim();
  }

  const client = await createExistingBackendClient(input.session);
  let result: MobileGitActionResult | null = null;
  try {
    await client.connect();
    await client.runStackedAction(
      payload,
      (event) => {
        const progress = mapMobileGitProgressEvent(event);
        if (progress) input.onProgress?.(progress);
        const finishedResult = mapMobileGitActionResultFromEvent(event);
        if (finishedResult) result = finishedResult;
      },
      { signal: input.signal },
    );
  } finally {
    client.dispose();
  }

  if (result) return result;
  return {
    action: input.action,
    description: null,
    prUrl: null,
    title: "Git action completed.",
  };
}

export function mapMobileGitStatus(value: unknown, cwd: string): MobileGitStatus {
  const status = asRecord(value);
  const workingTree = asRecord(status.workingTree);
  const filesSource = Array.isArray(workingTree.files)
    ? workingTree.files
    : Array.isArray(status.files)
      ? status.files
      : [];
  const files = filesSource.map(mapGitFileChange).filter(isPresent);
  const insertions = readNumber(workingTree.insertions) ?? sumFiles(files, "insertions");
  const deletions = readNumber(workingTree.deletions) ?? sumFiles(files, "deletions");
  const pr = mapPullRequest(status.pr);

  return {
    ahead: readNumber(status.aheadCount) ?? readNumber(status.ahead) ?? 0,
    behind: readNumber(status.behindCount) ?? readNumber(status.behind) ?? 0,
    branch: readString(status.refName) ?? readString(status.branch),
    cwd: readString(status.cwd) ?? cwd,
    deletions,
    files,
    hasChanges: readBoolean(status.hasWorkingTreeChanges) ?? files.length > 0,
    hasPrimaryRemote: readBoolean(status.hasPrimaryRemote) ?? true,
    insertions,
    isRepo: readBoolean(status.isRepo) ?? true,
    pr,
  };
}

export function reduceMobileGitStatusEvent(
  previous: MobileGitStatus | null,
  event: unknown,
  cwd: string,
): MobileGitStatus | null {
  const payload = asRecord(event);
  switch (payload._tag ?? payload.kind) {
    case "snapshot": {
      return mapMobileGitStatus(
        {
          ...asRecord(payload.local),
          ...asRecord(payload.remote),
          cwd,
        },
        cwd,
      );
    }
    case "localUpdated": {
      return mapMobileGitStatus(
        {
          ...(previous ? statusToRawRemote(previous) : {}),
          ...asRecord(payload.local),
          cwd,
        },
        cwd,
      );
    }
    case "remoteUpdated": {
      return mapMobileGitStatus(
        {
          ...(previous ? statusToRawLocal(previous) : {}),
          ...asRecord(payload.remote),
          cwd,
        },
        cwd,
      );
    }
    default:
      return mapMobileGitStatus(event, cwd);
  }
}

export function mapMobileGitProgressEvent(value: unknown): MobileGitProgressEntry | null {
  const event = asRecord(value);
  const kind = readString(event.kind);
  const actionId = readString(event.actionId);
  const action = readString(event.action);
  if (!kind || !actionId || !action) return null;
  const now = new Date().toISOString();
  const phase = readString(event.phase);
  const hookName = readString(event.hookName);
  const text = readString(event.text);
  const message = readString(event.message);
  const label = readString(event.label) ?? progressKindLabel(kind, phase ?? hookName ?? action);
  const detail = truncateProgressDetail(text ?? message ?? progressDetail(event));

  return {
    action,
    actionId,
    createdAt: now,
    detail,
    id: `${actionId}:${kind}:${phase ?? hookName ?? event.stream ?? "event"}:${now}`,
    kind,
    label,
    tone: progressTone(kind, event),
  };
}

function mapMobileGitActionResultFromEvent(value: unknown): MobileGitActionResult | null {
  const event = asRecord(value);
  if (event.kind !== "action_finished") return null;
  const result = asRecord(event.result);
  const toast = asRecord(result.toast);
  const pr = asRecord(result.pr);
  const cta = asRecord(toast.cta);
  return {
    action: readString(result.action) ?? readString(event.action) ?? "git",
    description: readString(toast.description),
    prUrl: readString(pr.url) ?? readString(cta.url),
    title: readString(toast.title) ?? "Git action completed.",
  };
}

function mapGitFileChange(value: unknown): MobileGitFileChange | null {
  const file = asRecord(value);
  const path = readString(file.path);
  if (!path) return null;
  return {
    deletions: readNumber(file.deletions) ?? 0,
    insertions: readNumber(file.insertions) ?? 0,
    path,
    status: readString(file.status),
  };
}

function mapPullRequest(value: unknown): MobileGitStatus["pr"] {
  const pr = asRecord(value);
  const title = readString(pr.title);
  const url = readString(pr.url);
  const number = readNumber(pr.number);
  if (!title && !url && number === null) return null;
  return {
    number,
    state: readString(pr.state),
    title: title ?? (number === null ? "Pull request" : `Pull request #${number}`),
    url,
  };
}

function progressKindLabel(kind: string, detail: string) {
  switch (kind) {
    case "action_started":
      return "Starting git action";
    case "phase_started":
      return `Running ${detail}`;
    case "hook_started":
      return `Running ${detail}`;
    case "hook_output":
      return "Git output";
    case "hook_finished":
      return `Finished ${detail}`;
    case "action_finished":
      return "Git action finished";
    case "action_failed":
      return "Git action failed";
    default:
      return kind;
  }
}

function progressDetail(event: Record<string, unknown>) {
  const result = asRecord(event.result);
  const toast = asRecord(result.toast);
  return readString(toast.description) ?? readString(toast.title);
}

function progressTone(kind: string, event: Record<string, unknown>): MobileGitProgressTone {
  if (kind === "action_failed") return "danger";
  if (kind === "action_finished") return "success";
  if (kind === "hook_output" && event.stream === "stderr") return "warning";
  return "info";
}

function truncateProgressDetail(value: string | null) {
  if (!value) return null;
  if (value.length <= MAX_PROGRESS_DETAIL_LENGTH) return value;
  return `${value.slice(0, MAX_PROGRESS_DETAIL_LENGTH).trimEnd()}\n... truncated`;
}

function statusToRawLocal(status: MobileGitStatus) {
  return {
    hasPrimaryRemote: status.hasPrimaryRemote,
    hasWorkingTreeChanges: status.hasChanges,
    isRepo: status.isRepo,
    refName: status.branch,
    workingTree: {
      deletions: status.deletions,
      files: status.files,
      insertions: status.insertions,
    },
  };
}

function statusToRawRemote(status: MobileGitStatus) {
  return {
    aheadCount: status.ahead,
    behindCount: status.behind,
    pr: status.pr,
  };
}

function sumFiles(files: readonly MobileGitFileChange[], field: "insertions" | "deletions") {
  return files.reduce((total, file) => total + file[field], 0);
}

function createMobileGitActionId() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `mobile-git-${globalThis.crypto.randomUUID()}`;
  }
  return `mobile-git-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
