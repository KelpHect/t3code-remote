import { createMobileCommandId, type MobileOutboxCommand } from "@/client/commandOutbox";
import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export interface MobileModelSelection {
  readonly instanceId?: unknown;
  readonly model: unknown;
  readonly options?: unknown;
}

export interface NewThreadBootstrapInput {
  readonly projectId: string;
  readonly title: string;
  readonly modelSelection: MobileModelSelection;
  readonly runtimeMode: string;
  readonly interactionMode: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly createdAt: string;
}

export interface TurnCommandInput {
  readonly threadId: string;
  readonly text: string;
  readonly runtimeMode: string;
  readonly interactionMode: string;
  readonly titleSeed?: string;
  readonly modelSelection?: MobileModelSelection | null;
  readonly bootstrap?: NewThreadBootstrapInput;
  readonly createdAt?: string;
  readonly messageId?: string;
}

export function createMobileEntityId(
  prefix: "message" | "project" | "thread",
  randomUUID = randomUuid,
) {
  return `mobile-${prefix}-${randomUUID()}`;
}

export function buildTurnStartOutboxPayload(input: TurnCommandInput) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const payload: Record<string, unknown> = {
    createdAt,
    interactionMode: input.interactionMode,
    message: {
      attachments: [],
      messageId: input.messageId ?? createMobileEntityId("message"),
      role: "user",
      text: input.text,
    },
    runtimeMode: input.runtimeMode,
    threadId: input.threadId,
  };

  if (input.titleSeed) payload.titleSeed = input.titleSeed;
  if (input.modelSelection) payload.modelSelection = input.modelSelection;
  if (input.bootstrap) {
    payload.bootstrap = {
      createThread: {
        branch: input.bootstrap.branch,
        createdAt: input.bootstrap.createdAt,
        interactionMode: input.bootstrap.interactionMode,
        modelSelection: input.bootstrap.modelSelection,
        projectId: input.bootstrap.projectId,
        runtimeMode: input.bootstrap.runtimeMode,
        title: input.bootstrap.title,
        worktreePath: input.bootstrap.worktreePath,
      },
    };
  }

  return payload;
}

export function buildInterruptOutboxPayload(input: {
  readonly threadId: string;
  readonly turnId?: string | null;
  readonly createdAt?: string;
}) {
  const payload: Record<string, unknown> = {
    createdAt: input.createdAt ?? new Date().toISOString(),
    threadId: input.threadId,
  };
  if (input.turnId) payload.turnId = input.turnId;
  return payload;
}

export function buildThreadMetaUpdateOutboxPayload(input: {
  readonly threadId: string;
  readonly modelSelection: MobileModelSelection;
}) {
  return {
    modelSelection: input.modelSelection,
    threadId: input.threadId,
  };
}

export function buildThreadRuntimeModeOutboxPayload(input: {
  readonly threadId: string;
  readonly runtimeMode: string;
  readonly createdAt?: string;
}) {
  return {
    createdAt: input.createdAt ?? new Date().toISOString(),
    runtimeMode: input.runtimeMode,
    threadId: input.threadId,
  };
}

export function buildThreadInteractionModeOutboxPayload(input: {
  readonly threadId: string;
  readonly interactionMode: string;
  readonly createdAt?: string;
}) {
  return {
    createdAt: input.createdAt ?? new Date().toISOString(),
    interactionMode: input.interactionMode,
    threadId: input.threadId,
  };
}

export function buildProjectCreateOutboxPayload(input: {
  readonly projectId: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly modelSelection: MobileModelSelection;
  readonly createdAt?: string;
  readonly createWorkspaceRootIfMissing?: boolean;
}) {
  return {
    createWorkspaceRootIfMissing: input.createWorkspaceRootIfMissing ?? true,
    createdAt: input.createdAt ?? new Date().toISOString(),
    defaultModelSelection: input.modelSelection,
    projectId: input.projectId,
    title: input.title,
    workspaceRoot: input.workspaceRoot,
  };
}

export async function dispatchMobileOrchestrationCommand(
  session: ExistingBackendSession,
  command: MobileOutboxCommand,
) {
  const client = await createExistingBackendClient(session);
  try {
    await client.connect();
    await client.dispatchCommand(command);
  } finally {
    client.dispose();
  }
}

export function createFallbackModelSelection(): MobileModelSelection {
  return {
    instanceId: "codex",
    model: "gpt-5.5",
  };
}

export function createTitleSeed(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 64) return normalized || "New chat";
  return `${normalized.slice(0, 61).trimEnd()}...`;
}

export function createCommandDispatcher(session: ExistingBackendSession) {
  return (command: MobileOutboxCommand) => dispatchMobileOrchestrationCommand(session, command);
}

function randomUuid() {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return createMobileCommandId().replace(/^mobile-/, "");
}
