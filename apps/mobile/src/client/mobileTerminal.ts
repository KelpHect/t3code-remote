import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export const DEFAULT_MOBILE_TERMINAL_ID = "default";
export const MOBILE_TERMINAL_COLS = 80;
export const MOBILE_TERMINAL_ROWS = 24;

const MAX_SCROLLBACK_CHARS = 80_000;

export type MobileTerminalStatus = "idle" | "starting" | "running" | "exited" | "error";

export interface MobileTerminalSnapshot {
  readonly threadId: string;
  readonly terminalId: string;
  readonly cwd: string;
  readonly worktreePath: string | null;
  readonly status: MobileTerminalStatus;
  readonly pid: number | null;
  readonly history: string;
  readonly exitCode: number | null;
  readonly exitSignal: number | null;
  readonly updatedAt: string;
  readonly hasRunningSubprocess: boolean;
  readonly lastError: string | null;
}

export type MobileTerminalEvent =
  | {
      readonly type: "started" | "restarted";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
      readonly snapshot: MobileTerminalSnapshot;
    }
  | {
      readonly type: "output";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
      readonly data: string;
    }
  | {
      readonly type: "cleared";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "exited";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
      readonly exitCode: number | null;
      readonly exitSignal: number | null;
    }
  | {
      readonly type: "error";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
      readonly message: string;
    }
  | {
      readonly type: "activity";
      readonly threadId: string;
      readonly terminalId: string;
      readonly createdAt: string;
      readonly hasRunningSubprocess: boolean;
    };

export interface MobileTerminalState extends MobileTerminalSnapshot {}

export interface MobileTerminalSessionInput {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly terminalId?: string;
}

export function createEmptyMobileTerminalState(
  threadId = "",
  terminalId = DEFAULT_MOBILE_TERMINAL_ID,
): MobileTerminalState {
  return {
    cwd: "",
    exitCode: null,
    exitSignal: null,
    hasRunningSubprocess: false,
    history: "",
    lastError: null,
    pid: null,
    status: "idle",
    terminalId,
    threadId,
    updatedAt: "",
    worktreePath: null,
  };
}

export async function openMobileTerminal(input: {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly cwd: string;
  readonly worktreePath?: string | null;
  readonly terminalId?: string;
  readonly cols?: number;
  readonly rows?: number;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileTerminalSnapshot(
      await client.terminalOpen({
        cols: input.cols ?? MOBILE_TERMINAL_COLS,
        cwd: input.cwd,
        rows: input.rows ?? MOBILE_TERMINAL_ROWS,
        terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
        threadId: input.threadId,
        ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      }),
    );
  } finally {
    client.dispose();
  }
}

export async function writeMobileTerminal(
  input: MobileTerminalSessionInput & { readonly data: string },
) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    await client.terminalWrite({
      data: input.data,
      terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
      threadId: input.threadId,
    });
  } finally {
    client.dispose();
  }
}

export async function resizeMobileTerminal(
  input: MobileTerminalSessionInput & { readonly cols: number; readonly rows: number },
) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    await client.terminalResize({
      cols: input.cols,
      rows: input.rows,
      terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
      threadId: input.threadId,
    });
  } finally {
    client.dispose();
  }
}

export async function clearMobileTerminal(input: MobileTerminalSessionInput) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    await client.terminalClear({
      terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
      threadId: input.threadId,
    });
  } finally {
    client.dispose();
  }
}

export async function restartMobileTerminal(input: {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly cwd: string;
  readonly worktreePath?: string | null;
  readonly terminalId?: string;
  readonly cols?: number;
  readonly rows?: number;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileTerminalSnapshot(
      await client.terminalRestart({
        cols: input.cols ?? MOBILE_TERMINAL_COLS,
        cwd: input.cwd,
        rows: input.rows ?? MOBILE_TERMINAL_ROWS,
        terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
        threadId: input.threadId,
        ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
      }),
    );
  } finally {
    client.dispose();
  }
}

export async function closeMobileTerminal(input: MobileTerminalSessionInput) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    await client.terminalClose({
      deleteHistory: false,
      terminalId: input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID,
      threadId: input.threadId,
    });
  } finally {
    client.dispose();
  }
}

export async function startMobileTerminalSubscription(input: {
  readonly session: ExistingBackendSession;
  readonly threadId: string;
  readonly terminalId?: string;
  readonly onEvent: (event: MobileTerminalEvent) => void;
  readonly onError?: (error: Error) => void;
}) {
  const terminalId = input.terminalId ?? DEFAULT_MOBILE_TERMINAL_ID;
  const client = await createExistingBackendClient(input.session);
  await client.connect();
  const unsubscribe = client.subscribeTerminalEvents(
    (item) => {
      const event = mapMobileTerminalEvent(item);
      if (!event) return;
      if (event.threadId !== input.threadId || event.terminalId !== terminalId) return;
      input.onEvent(event);
    },
    {
      onError: () => input.onError?.(new Error("Terminal event stream disconnected.")),
    },
  );

  return () => {
    unsubscribe();
    client.dispose();
  };
}

export function mapMobileTerminalSnapshot(value: unknown): MobileTerminalSnapshot {
  const snapshot = asRecord(value);
  return {
    cwd: readString(snapshot.cwd) ?? "",
    exitCode: readNumber(snapshot.exitCode),
    exitSignal: readNumber(snapshot.exitSignal),
    hasRunningSubprocess: readBoolean(snapshot.hasRunningSubprocess) ?? false,
    history: boundTerminalScrollback(readString(snapshot.history) ?? ""),
    lastError: null,
    pid: readNumber(snapshot.pid),
    status: readTerminalStatus(snapshot.status),
    terminalId: readString(snapshot.terminalId) ?? DEFAULT_MOBILE_TERMINAL_ID,
    threadId: readString(snapshot.threadId) ?? "",
    updatedAt: readString(snapshot.updatedAt) ?? "",
    worktreePath: readString(snapshot.worktreePath),
  };
}

export function mapMobileTerminalEvent(value: unknown): MobileTerminalEvent | null {
  const event = asRecord(value);
  const type = readString(event.type);
  const threadId = readString(event.threadId);
  const terminalId = readString(event.terminalId);
  const createdAt = readString(event.createdAt) ?? new Date().toISOString();
  if (!type || !threadId || !terminalId) return null;

  if (type === "started" || type === "restarted") {
    return {
      createdAt,
      snapshot: mapMobileTerminalSnapshot(event.snapshot),
      terminalId,
      threadId,
      type,
    };
  }
  if (type === "output") {
    return {
      createdAt,
      data: readString(event.data, { allowEmpty: true }) ?? "",
      terminalId,
      threadId,
      type,
    };
  }
  if (type === "cleared") {
    return { createdAt, terminalId, threadId, type };
  }
  if (type === "exited") {
    return {
      createdAt,
      exitCode: readNumber(event.exitCode),
      exitSignal: readNumber(event.exitSignal),
      terminalId,
      threadId,
      type,
    };
  }
  if (type === "error") {
    return {
      createdAt,
      message: readString(event.message) ?? "Terminal error.",
      terminalId,
      threadId,
      type,
    };
  }
  if (type === "activity") {
    return {
      createdAt,
      hasRunningSubprocess: readBoolean(event.hasRunningSubprocess) ?? false,
      terminalId,
      threadId,
      type,
    };
  }
  return null;
}

export function reduceMobileTerminalState(
  state: MobileTerminalState,
  event: MobileTerminalEvent,
): MobileTerminalState {
  switch (event.type) {
    case "started":
    case "restarted":
      return {
        ...event.snapshot,
        history: boundTerminalScrollback(event.snapshot.history),
        lastError: null,
      };
    case "output":
      return {
        ...state,
        history: appendTerminalOutput(state.history, event.data),
        lastError: null,
        status: state.status === "idle" ? "running" : state.status,
        updatedAt: event.createdAt,
      };
    case "cleared":
      return {
        ...state,
        history: "",
        lastError: null,
        updatedAt: event.createdAt,
      };
    case "exited":
      return {
        ...state,
        exitCode: event.exitCode,
        exitSignal: event.exitSignal,
        hasRunningSubprocess: false,
        status: "exited",
        updatedAt: event.createdAt,
      };
    case "error":
      return {
        ...state,
        history: appendTerminalOutput(state.history, `\r\n[terminal] ${event.message}\r\n`),
        lastError: event.message,
        status: "error",
        updatedAt: event.createdAt,
      };
    case "activity":
      return {
        ...state,
        hasRunningSubprocess: event.hasRunningSubprocess,
        updatedAt: event.createdAt,
      };
  }
}

export function appendTerminalOutput(history: string, data: string) {
  return boundTerminalScrollback(`${history}${data}`);
}

export function boundTerminalScrollback(history: string) {
  if (history.length <= MAX_SCROLLBACK_CHARS) return history;
  return history.slice(history.length - MAX_SCROLLBACK_CHARS);
}

function readTerminalStatus(value: unknown): MobileTerminalStatus {
  return value === "starting" || value === "running" || value === "exited" || value === "error"
    ? value
    : "idle";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown, options?: { readonly allowEmpty?: boolean }) {
  if (typeof value !== "string") return null;
  if (options?.allowEmpty) return value;
  return value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
