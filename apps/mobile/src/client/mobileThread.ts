import { computed, ref } from "vue";

import {
  createExistingBackendClient,
  type ExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export type ThreadSyncStatus = "idle" | "no-thread" | "connecting" | "synced" | "failed";

export interface MobileThreadMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly avatar: string;
  readonly author: string;
  readonly text: string;
  readonly streaming: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface MobileThreadActivity {
  readonly id: string;
  readonly kind: string;
  readonly tone: string | null;
  readonly summary: string;
  readonly payload: Record<string, unknown> | null;
  readonly detail: string | null;
  readonly createdAt: string | null;
  readonly requestId: string | null;
  readonly requestKind: "command" | "file-read" | "file-change" | null;
}

export interface MobilePendingApproval {
  readonly requestId: string;
  readonly requestKind: "command" | "file-read" | "file-change";
  readonly createdAt: string | null;
  readonly detail: string | null;
}

export interface MobilePendingUserInputQuestion {
  readonly id: string;
  readonly header: string;
  readonly question: string;
  readonly multiSelect: boolean;
  readonly options: readonly {
    readonly label: string;
    readonly description: string;
  }[];
}

export interface MobilePendingUserInput {
  readonly requestId: string;
  readonly createdAt: string | null;
  readonly questions: readonly MobilePendingUserInputQuestion[];
}

export interface MobileThreadSession {
  readonly status: string;
  readonly providerName: string | null;
  readonly runtimeMode: string | null;
  readonly activeTurnId: string | null;
  readonly lastError: string | null;
  readonly updatedAt: string | null;
}

export interface MobileProposedPlan {
  readonly id: string;
  readonly turnId: string | null;
  readonly planMarkdown: string;
  readonly implementedAt: string | null;
  readonly implementationThreadId: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface MobileThreadDetail {
  readonly threadId: string | null;
  readonly projectId: string | null;
  readonly title: string | null;
  readonly sequence: number | null;
  readonly messages: readonly MobileThreadMessage[];
  readonly activities: readonly MobileThreadActivity[];
  readonly proposedPlans: readonly MobileProposedPlan[];
  readonly session: MobileThreadSession | null;
  readonly updatedAt: string | null;
  readonly deleted: boolean;
  readonly archived: boolean;
}

export interface ThreadSyncSnapshot {
  readonly status: ThreadSyncStatus;
  readonly message: string;
  readonly updatedAt: number;
}

const MAX_RENDERED_MESSAGES = 300;
const MAX_RENDERED_ACTIVITIES = 80;

const activeThreadDetail = ref<MobileThreadDetail>(createEmptyMobileThreadDetail());
const threadSync = ref<ThreadSyncSnapshot>({
  status: "idle",
  message: "Thread sync is idle.",
  updatedAt: Date.now(),
});
let activeClient: ExistingBackendClient | null = null;
let activeUnsubscribe: (() => void) | null = null;
let retryTimer: number | undefined;
let syncGeneration = 0;

export function createEmptyMobileThreadDetail(threadId: string | null = null): MobileThreadDetail {
  return {
    activities: [],
    archived: false,
    deleted: false,
    messages: [],
    projectId: null,
    proposedPlans: [],
    sequence: null,
    session: null,
    threadId,
    title: null,
    updatedAt: null,
  };
}

export function reduceMobileThreadStreamItem(
  state: MobileThreadDetail,
  item: unknown,
): MobileThreadDetail {
  if (!isObject(item)) return state;
  if (item.kind === "snapshot" && isObject(item.snapshot)) {
    return reduceThreadSnapshot(state, item.snapshot);
  }
  if (item.kind === "event" && isObject(item.event)) {
    return reduceThreadEvent(state, item.event);
  }
  return state;
}

const visibleMessages = computed(() =>
  activeThreadDetail.value.messages.slice(-MAX_RENDERED_MESSAGES),
);
const visibleActivities = computed(() =>
  activeThreadDetail.value.activities.slice(-MAX_RENDERED_ACTIVITIES),
);
const pendingApprovals = computed(() =>
  derivePendingApprovals(activeThreadDetail.value.activities),
);
const pendingUserInputs = computed(() =>
  derivePendingUserInputs(activeThreadDetail.value.activities),
);

export function useMobileThreadState() {
  return {
    activeThreadDetail,
    pendingApprovals,
    pendingUserInputs,
    startThreadSync,
    stopThreadSync,
    threadSync,
    visibleActivities,
    visibleMessages,
  };
}

function startThreadSync(session: ExistingBackendSession & { readonly threadId: string | null }) {
  stopThreadSync({ keepState: true });
  if (!session.threadId) {
    activeThreadDetail.value = createEmptyMobileThreadDetail();
    publishThreadStatus("no-thread", "Select a thread to sync messages.");
    return;
  }
  syncGeneration += 1;
  const generation = syncGeneration;
  activeThreadDetail.value = createEmptyMobileThreadDetail(session.threadId);
  publishThreadStatus("connecting", "Subscribing to selected thread.");
  void connectThread({ ...session, threadId: session.threadId }, generation);
}

function stopThreadSync(options?: { readonly keepState?: boolean }) {
  syncGeneration += 1;
  if (retryTimer !== undefined) {
    globalThis.clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  activeUnsubscribe?.();
  activeUnsubscribe = null;
  activeClient?.dispose();
  activeClient = null;
  publishThreadStatus("idle", "Thread sync is idle.");
  if (!options?.keepState) {
    activeThreadDetail.value = createEmptyMobileThreadDetail();
  }
}

async function connectThread(
  session: ExistingBackendSession & { readonly threadId: string },
  generation: number,
) {
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
    activeUnsubscribe = client.subscribeThread(
      session.threadId,
      (item) => {
        activeThreadDetail.value = reduceMobileThreadStreamItem(activeThreadDetail.value, item);
        publishThreadStatus("synced", describeThreadSync(activeThreadDetail.value));
      },
      {
        onError: () => {
          if (generation !== syncGeneration) return;
          scheduleThreadReconnect(session, generation);
        },
      },
    );
  } catch (error) {
    if (generation !== syncGeneration) return;
    const message = error instanceof Error ? error.message : "Thread sync failed.";
    publishThreadStatus("failed", message);
    scheduleThreadReconnect(session, generation);
  }
}

function scheduleThreadReconnect(
  session: ExistingBackendSession & { readonly threadId: string },
  generation: number,
) {
  activeUnsubscribe?.();
  activeUnsubscribe = null;
  activeClient?.dispose();
  activeClient = null;
  publishThreadStatus("failed", "Thread sync disconnected. Retrying shortly.");
  retryTimer = globalThis.setTimeout(() => {
    retryTimer = undefined;
    if (generation !== syncGeneration) return;
    publishThreadStatus("connecting", "Reconnecting selected thread.");
    void connectThread(session, generation);
  }, 3000);
}

function publishThreadStatus(status: ThreadSyncStatus, message: string) {
  threadSync.value = {
    message,
    status,
    updatedAt: Date.now(),
  };
}

function describeThreadSync(state: MobileThreadDetail) {
  const messageCount = state.messages.length;
  const activityCount = state.activities.length;
  return `Synced ${messageCount} message${messageCount === 1 ? "" : "s"} and ${activityCount} action${activityCount === 1 ? "" : "s"}.`;
}

function reduceThreadSnapshot(state: MobileThreadDetail, snapshot: Record<string, unknown>) {
  const sequence = readNonNegativeInt(snapshot.snapshotSequence);
  if (!shouldApplySequence(state.sequence, sequence)) return state;
  const thread = isObject(snapshot.thread) ? snapshot.thread : null;
  if (!thread) return state;
  const threadId = readString(thread.id) ?? state.threadId;
  return {
    activities: sortActivities(
      readArray(thread.activities).map(mapMobileActivity).filter(isPresent),
    ),
    archived: readString(thread.archivedAt) !== null,
    deleted: readString(thread.deletedAt) !== null,
    messages: sortMessages(readArray(thread.messages).map(mapMobileMessage).filter(isPresent)),
    projectId: readString(thread.projectId),
    proposedPlans: sortPlans(
      readArray(thread.proposedPlans).map(mapMobileProposedPlan).filter(isPresent),
    ),
    sequence,
    session: mapMobileSession(thread.session),
    threadId,
    title: readString(thread.title),
    updatedAt: readString(thread.updatedAt),
  };
}

function reduceThreadEvent(state: MobileThreadDetail, event: Record<string, unknown>) {
  const sequence = readNonNegativeInt(event.sequence);
  if (!shouldApplySequence(state.sequence, sequence)) return state;
  const payload = isObject(event.payload) ? event.payload : null;
  const threadId = readString(payload?.threadId) ?? readString(event.aggregateId);
  if (state.threadId && threadId && threadId !== state.threadId) return state;

  switch (event.type) {
    case "thread.message-sent": {
      const message = mapMobileMessage(payload);
      if (!message) return { ...state, sequence };
      return {
        ...state,
        messages: sortMessages(upsertById(state.messages, message)),
        sequence,
        updatedAt: readString(payload?.updatedAt) ?? state.updatedAt,
      };
    }
    case "thread.activity-appended": {
      const activity = mapMobileActivity(payload?.activity);
      if (!activity) return { ...state, sequence };
      return {
        ...state,
        activities: sortActivities(upsertById(state.activities, activity)),
        sequence,
      };
    }
    case "thread.proposed-plan-upserted": {
      const proposedPlan = mapMobileProposedPlan(payload?.proposedPlan);
      if (!proposedPlan) return { ...state, sequence };
      return {
        ...state,
        proposedPlans: sortPlans(upsertById(state.proposedPlans, proposedPlan)),
        sequence,
      };
    }
    case "thread.session-set": {
      return {
        ...state,
        sequence,
        session: mapMobileSession(payload?.session),
      };
    }
    case "thread.meta-updated": {
      return {
        ...state,
        sequence,
        title: readString(payload?.title) ?? state.title,
        updatedAt: readString(payload?.updatedAt) ?? state.updatedAt,
      };
    }
    case "thread.archived": {
      return {
        ...state,
        archived: true,
        sequence,
        updatedAt: readString(payload?.updatedAt) ?? state.updatedAt,
      };
    }
    case "thread.unarchived": {
      return {
        ...state,
        archived: false,
        sequence,
        updatedAt: readString(payload?.updatedAt) ?? state.updatedAt,
      };
    }
    case "thread.deleted": {
      return {
        ...state,
        deleted: true,
        sequence,
        updatedAt: readString(payload?.deletedAt) ?? state.updatedAt,
      };
    }
    default:
      return {
        ...state,
        sequence,
      };
  }
}

function mapMobileMessage(payload: unknown): MobileThreadMessage | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id) ?? readString(payload.messageId);
  const role = readMessageRole(payload.role);
  const text = typeof payload.text === "string" ? payload.text : null;
  if (!id || !role || text === null) return null;
  return {
    author: role === "user" ? "You" : role === "assistant" ? "T3 Code" : "System",
    avatar: role === "user" ? "K" : role === "assistant" ? "T3" : "!",
    createdAt: readString(payload.createdAt),
    id,
    role,
    streaming: payload.streaming === true,
    text,
    updatedAt: readString(payload.updatedAt),
  };
}

function mapMobileActivity(payload: unknown): MobileThreadActivity | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id) ?? readString(payload.eventId);
  const kind = readString(payload.kind);
  const summary = readString(payload.summary);
  if (!id || !kind || !summary) return null;
  const activityPayload = isObject(payload.payload) ? payload.payload : null;
  return {
    createdAt: readString(payload.createdAt),
    detail: readString(activityPayload?.detail),
    id,
    kind,
    payload: activityPayload,
    requestId: readString(activityPayload?.requestId),
    requestKind: readRequestKind(activityPayload),
    summary,
    tone: readString(payload.tone),
  };
}

function mapMobileProposedPlan(payload: unknown): MobileProposedPlan | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id);
  const planMarkdown = readString(payload.planMarkdown);
  if (!id || !planMarkdown) return null;
  return {
    createdAt: readString(payload.createdAt),
    id,
    implementedAt: readString(payload.implementedAt),
    implementationThreadId: readString(payload.implementationThreadId),
    planMarkdown,
    turnId: readString(payload.turnId),
    updatedAt: readString(payload.updatedAt),
  };
}

function mapMobileSession(payload: unknown): MobileThreadSession | null {
  if (!isObject(payload)) return null;
  const status = readString(payload.status);
  if (!status) return null;
  return {
    activeTurnId: readString(payload.activeTurnId),
    lastError: readString(payload.lastError),
    providerName: readString(payload.providerName),
    runtimeMode: readString(payload.runtimeMode),
    status,
    updatedAt: readString(payload.updatedAt),
  };
}

export function derivePendingApprovals(
  activities: readonly MobileThreadActivity[],
): readonly MobilePendingApproval[] {
  const openByRequestId = new Map<string, MobilePendingApproval>();
  for (const activity of sortActivities(activities)) {
    if (!activity.requestId) continue;
    if (activity.kind === "approval.requested" && activity.requestKind) {
      openByRequestId.set(activity.requestId, {
        createdAt: activity.createdAt,
        detail: activity.detail,
        requestId: activity.requestId,
        requestKind: activity.requestKind,
      });
      continue;
    }
    if (
      activity.kind === "approval.resolved" ||
      (activity.kind === "provider.approval.respond.failed" &&
        isStalePendingRequestFailureDetail(activity.detail))
    ) {
      openByRequestId.delete(activity.requestId);
    }
  }
  return [...openByRequestId.values()].toSorted(compareByCreatedAt);
}

export function derivePendingUserInputs(
  activities: readonly MobileThreadActivity[],
): readonly MobilePendingUserInput[] {
  const openByRequestId = new Map<string, MobilePendingUserInput>();
  for (const activity of sortActivities(activities)) {
    if (!activity.requestId) continue;
    if (activity.kind === "user-input.requested") {
      const questions = parseUserInputQuestions(activity);
      if (!questions) continue;
      openByRequestId.set(activity.requestId, {
        createdAt: activity.createdAt,
        questions,
        requestId: activity.requestId,
      });
      continue;
    }
    if (
      activity.kind === "user-input.resolved" ||
      (activity.kind === "provider.user-input.respond.failed" &&
        isStalePendingRequestFailureDetail(activity.detail))
    ) {
      openByRequestId.delete(activity.requestId);
    }
  }
  return [...openByRequestId.values()].toSorted(compareByCreatedAt);
}

function parseUserInputQuestions(
  activity: MobileThreadActivity,
): readonly MobilePendingUserInputQuestion[] | null {
  const questions = readArray(activity.payload?.questions)
    .map(mapUserInputQuestion)
    .filter(isPresent);
  return questions.length > 0 ? questions : null;
}

function mapUserInputQuestion(payload: unknown): MobilePendingUserInputQuestion | null {
  if (!isObject(payload)) return null;
  const id = readString(payload.id);
  const header = readString(payload.header);
  const question = readString(payload.question);
  if (!id || !header || !question) return null;
  const options = readArray(payload.options)
    .map((option) => {
      if (!isObject(option)) return null;
      const label = readString(option.label);
      const description = readString(option.description);
      return label && description ? { description, label } : null;
    })
    .filter(isPresent);
  if (options.length === 0) return null;
  return {
    header,
    id,
    multiSelect: payload.multiSelect === true,
    options,
    question,
  };
}

function readMessageRole(value: unknown): MobileThreadMessage["role"] | null {
  if (value === "user" || value === "assistant" || value === "system") return value;
  return null;
}

function readRequestKind(payload: Record<string, unknown> | null) {
  if (
    payload?.requestKind === "command" ||
    payload?.requestKind === "file-read" ||
    payload?.requestKind === "file-change"
  ) {
    return payload.requestKind;
  }
  switch (payload?.requestType) {
    case "command_execution_approval":
    case "exec_command_approval":
    case "dynamic_tool_call":
      return "command";
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return null;
  }
}

function isStalePendingRequestFailureDetail(detail: string | null): boolean {
  const normalized = detail?.toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request")
  );
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

function sortMessages(messages: readonly MobileThreadMessage[]) {
  return messages.toSorted(compareByCreatedAt);
}

function sortActivities(activities: readonly MobileThreadActivity[]) {
  return activities.toSorted(compareByCreatedAt);
}

function sortPlans(plans: readonly MobileProposedPlan[]) {
  return plans.toSorted(compareByCreatedAt);
}

function compareByCreatedAt(
  left: { readonly createdAt: string | null; readonly id?: string },
  right: { readonly createdAt: string | null; readonly id?: string },
) {
  const leftDate = left.createdAt ?? "";
  const rightDate = right.createdAt ?? "";
  const dateCompare = leftDate.localeCompare(rightDate);
  if (dateCompare !== 0) return dateCompare;
  return (left.id ?? "").localeCompare(right.id ?? "");
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
