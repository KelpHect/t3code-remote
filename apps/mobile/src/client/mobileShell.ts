import { computed, ref } from "vue";

import {
  createExistingBackendClient,
  type ExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export type ShellSyncStatus = "idle" | "auth-required" | "connecting" | "synced" | "failed";

export interface MobileShellProject {
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string | null;
  readonly repositoryDisplayName: string | null;
  readonly updatedAt: string | null;
}

export interface MobileShellThread {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly modelLabel: string | null;
  readonly runtimeMode: string | null;
  readonly interactionMode: string | null;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly updatedAt: string | null;
  readonly latestUserMessageAt: string | null;
  readonly archived: boolean;
  readonly active: boolean;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly hasActionableProposedPlan: boolean;
}

export interface MobileShellState {
  readonly sequence: number | null;
  readonly projects: readonly MobileShellProject[];
  readonly threads: readonly MobileShellThread[];
}

export interface MobileShellProjectGroup extends MobileShellProject {
  readonly threads: readonly MobileShellThread[];
}

export interface ShellSyncSnapshot {
  readonly status: ShellSyncStatus;
  readonly message: string;
  readonly updatedAt: number;
}

const shellState = ref<MobileShellState>(createEmptyMobileShellState());
const activeThreadId = ref<string | null>(null);
const shellSync = ref<ShellSyncSnapshot>({
  status: "idle",
  message: "Shell sync is idle.",
  updatedAt: Date.now(),
});
let activeClient: ExistingBackendClient | null = null;
let activeUnsubscribe: (() => void) | null = null;
let retryTimer: number | undefined;
let syncGeneration = 0;

export function createEmptyMobileShellState(): MobileShellState {
  return {
    projects: [],
    sequence: null,
    threads: [],
  };
}

export function reduceMobileShellStreamItem(
  state: MobileShellState,
  item: unknown,
): MobileShellState {
  if (!isObject(item)) return state;
  if (item.kind === "snapshot" && isObject(item.snapshot)) {
    const sequence = readNonNegativeInt(item.snapshot.snapshotSequence);
    if (!shouldApplySequence(state.sequence, sequence)) return state;
    return {
      projects: readArray(item.snapshot.projects).map(mapMobileProject).filter(isPresent),
      sequence,
      threads: sortThreads(readArray(item.snapshot.threads).map(mapMobileThread).filter(isPresent)),
    };
  }

  const sequence = readNonNegativeInt(item.sequence);
  if (!shouldApplySequence(state.sequence, sequence)) return state;

  switch (item.kind) {
    case "project-upserted": {
      const project = mapMobileProject(item.project);
      if (!project) return state;
      return {
        ...state,
        projects: upsertById(state.projects, project),
        sequence,
      };
    }
    case "project-removed": {
      const projectId = readString(item.projectId);
      if (!projectId) return state;
      return {
        projects: state.projects.filter((project) => project.id !== projectId),
        sequence,
        threads: state.threads.filter((thread) => thread.projectId !== projectId),
      };
    }
    case "thread-upserted": {
      const thread = mapMobileThread(item.thread);
      if (!thread) return state;
      return {
        ...state,
        sequence,
        threads: sortThreads(upsertById(state.threads, thread)),
      };
    }
    case "thread-removed": {
      const threadId = readString(item.threadId);
      if (!threadId) return state;
      return {
        ...state,
        sequence,
        threads: state.threads.filter((thread) => thread.id !== threadId),
      };
    }
    default:
      return state;
  }
}

const activeThread = computed(
  () => shellState.value.threads.find((thread) => thread.id === activeThreadId.value) ?? null,
);
const activeProject = computed(() => {
  const thread = activeThread.value;
  if (!thread) return null;
  return shellState.value.projects.find((project) => project.id === thread.projectId) ?? null;
});
const shellProjectGroups = computed<readonly MobileShellProjectGroup[]>(() =>
  shellState.value.projects.map((project) => ({
    ...project,
    threads: shellState.value.threads.filter(
      (thread) => thread.projectId === project.id && !thread.archived,
    ),
  })),
);

export function useMobileShellState() {
  return {
    activeProject,
    activeThread,
    activeThreadId,
    projects: shellProjectGroups,
    rawShellState: shellState,
    selectThread,
    shellSync,
    startShellSync,
    stopShellSync,
  };
}

function startShellSync(session: ExistingBackendSession) {
  stopShellSync({ keepState: true });
  syncGeneration += 1;
  const generation = syncGeneration;
  publishShellStatus("connecting", "Subscribing to desktop projects and threads.");
  void connectShell(session, generation);
}

function stopShellSync(options?: { readonly keepState?: boolean }) {
  syncGeneration += 1;
  if (retryTimer !== undefined) {
    globalThis.clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  activeUnsubscribe?.();
  activeUnsubscribe = null;
  activeClient?.dispose();
  activeClient = null;
  publishShellStatus("idle", "Shell sync is idle.");
  if (!options?.keepState) {
    shellState.value = createEmptyMobileShellState();
    activeThreadId.value = null;
  }
}

function selectThread(threadId: string | null) {
  activeThreadId.value = threadId;
}

async function connectShell(session: ExistingBackendSession, generation: number) {
  try {
    const client = await createExistingBackendClient(session);
    if (generation !== syncGeneration) {
      client.dispose();
      return;
    }
    activeClient = client;
    await client.connect();
    if (generation !== syncGeneration) {
      client.dispose();
      return;
    }
    activeUnsubscribe = client.subscribeShell(
      (item) => {
        shellState.value = reduceMobileShellStreamItem(shellState.value, item);
        ensureActiveThread();
        publishShellStatus("synced", describeShellSync(shellState.value));
      },
      {
        onError: () => {
          if (generation !== syncGeneration) return;
          scheduleShellReconnect(session, generation);
        },
      },
    );
  } catch (error) {
    if (generation !== syncGeneration) return;
    const message = error instanceof Error ? error.message : "Shell sync failed.";
    publishShellStatus("failed", message);
    scheduleShellReconnect(session, generation);
  }
}

function scheduleShellReconnect(session: ExistingBackendSession, generation: number) {
  activeUnsubscribe?.();
  activeUnsubscribe = null;
  activeClient?.dispose();
  activeClient = null;
  publishShellStatus("failed", "Project sync disconnected. Retrying shortly.");
  retryTimer = globalThis.setTimeout(() => {
    retryTimer = undefined;
    if (generation !== syncGeneration) return;
    publishShellStatus("connecting", "Reconnecting project sync.");
    void connectShell(session, generation);
  }, 3000);
}

function publishShellStatus(status: ShellSyncStatus, message: string) {
  shellSync.value = {
    message,
    status,
    updatedAt: Date.now(),
  };
}

function ensureActiveThread() {
  if (
    activeThreadId.value &&
    shellState.value.threads.some(
      (thread) => thread.id === activeThreadId.value && !thread.archived,
    )
  ) {
    return;
  }
  activeThreadId.value = shellState.value.threads.find((thread) => !thread.archived)?.id ?? null;
}

function describeShellSync(state: MobileShellState) {
  const projectCount = state.projects.length;
  const threadCount = state.threads.filter((thread) => !thread.archived).length;
  return `Synced ${projectCount} project${projectCount === 1 ? "" : "s"} and ${threadCount} thread${threadCount === 1 ? "" : "s"}.`;
}

function mapMobileProject(payload: unknown): MobileShellProject | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id);
  const title = readString(payload.title);
  if (!id || !title) return null;
  const repositoryIdentity = isObject(payload.repositoryIdentity)
    ? payload.repositoryIdentity
    : null;
  return {
    id,
    repositoryDisplayName: readString(repositoryIdentity?.displayName),
    title,
    updatedAt: readString(payload.updatedAt),
    workspaceRoot: readString(payload.workspaceRoot),
  };
}

function mapMobileThread(payload: unknown): MobileShellThread | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id);
  const projectId = readString(payload.projectId);
  const title = readString(payload.title);
  if (!id || !projectId || !title) return null;
  const modelSelection = isObject(payload.modelSelection) ? payload.modelSelection : null;
  return {
    active: Boolean(payload.session),
    archived: readString(payload.archivedAt) !== null,
    branch: readString(payload.branch),
    hasActionableProposedPlan: payload.hasActionableProposedPlan === true,
    hasPendingApprovals: payload.hasPendingApprovals === true,
    hasPendingUserInput: payload.hasPendingUserInput === true,
    id,
    interactionMode: readString(payload.interactionMode),
    latestUserMessageAt: readString(payload.latestUserMessageAt),
    modelLabel: formatModelLabel(modelSelection),
    projectId,
    runtimeMode: readString(payload.runtimeMode),
    title,
    updatedAt: readString(payload.updatedAt),
    worktreePath: readString(payload.worktreePath),
  };
}

function formatModelLabel(modelSelection: Record<string, unknown> | null) {
  const model = readString(modelSelection?.model);
  const instanceId = readString(modelSelection?.instanceId);
  if (model && instanceId) return `${instanceId} · ${model}`;
  return model ?? instanceId;
}

function shouldApplySequence(
  lastSequence: number | null,
  sequence: number | null,
): sequence is number {
  return sequence !== null && (lastSequence === null || sequence > lastSequence);
}

function upsertById<TValue extends { readonly id: string }>(
  values: readonly TValue[],
  nextValue: TValue,
) {
  const existingIndex = values.findIndex((value) => value.id === nextValue.id);
  if (existingIndex === -1) return [...values, nextValue];
  return values.map((value, index) => (index === existingIndex ? nextValue : value));
}

function sortThreads(threads: readonly MobileShellThread[]) {
  return threads.toSorted((left, right) => {
    const leftDate = left.latestUserMessageAt ?? left.updatedAt ?? "";
    const rightDate = right.latestUserMessageAt ?? right.updatedAt ?? "";
    return rightDate.localeCompare(leftDate);
  });
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresent<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}
