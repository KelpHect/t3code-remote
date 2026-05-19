export type MobileOutboxIntent = "send" | "continue" | "stop" | "settings";

export interface MobileOutboxCommand {
  readonly type: string;
  readonly commandId: string;
  readonly [key: string]: unknown;
}

export interface QueuedMobileCommand {
  readonly commandId: string;
  readonly intent: MobileOutboxIntent;
  readonly command: MobileOutboxCommand;
  readonly status: "queued" | "dispatching" | "failed";
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
}

export interface NewMobileOutboxCommand {
  readonly intent: MobileOutboxIntent;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface CommandOutboxStore {
  readonly load: () => Promise<readonly QueuedMobileCommand[]>;
  readonly save: (commands: readonly QueuedMobileCommand[]) => Promise<void>;
}

export interface BrowserCommandOutboxStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export type MobileCommandDispatcher = (command: MobileOutboxCommand) => Promise<void>;

export interface CommandReplayResult {
  readonly dispatched: number;
  readonly failed: number;
  readonly remaining: readonly QueuedMobileCommand[];
}

const DEFAULT_COMMAND_OUTBOX_KEY = "t3.mobile.commandOutbox.v1";

export function createMobileCommandId(options?: {
  readonly now?: () => number;
  readonly randomUUID?: () => string;
  readonly random?: () => number;
}) {
  const now = options?.now?.() ?? Date.now();
  const randomUUID =
    options?.randomUUID ??
    (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? () => globalThis.crypto.randomUUID()
      : undefined);
  if (randomUUID) return `mobile-${randomUUID()}`;

  const random = Math.floor((options?.random?.() ?? Math.random()) * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .padStart(8, "0");
  return `mobile-${now.toString(36)}-${random}`;
}

export function createInMemoryCommandOutboxStore(
  seed: readonly QueuedMobileCommand[] = [],
): CommandOutboxStore {
  let commands = [...seed];
  return {
    async load() {
      return commands;
    },
    async save(nextCommands) {
      commands = [...nextCommands];
    },
  };
}

export function createBrowserCommandOutboxStore(
  key = DEFAULT_COMMAND_OUTBOX_KEY,
  storage: BrowserCommandOutboxStorage | null = typeof globalThis.window === "undefined"
    ? null
    : globalThis.window.localStorage,
): CommandOutboxStore {
  return {
    async load() {
      if (!storage) return [];
      return parseQueuedCommands(storage.getItem(key));
    },
    async save(commands) {
      if (!storage) return;
      storage.setItem(key, JSON.stringify(commands));
    },
  };
}

export class MobileCommandOutbox {
  private readonly store: CommandOutboxStore;
  private readonly now: () => Date;
  private readonly newCommandId: () => string;

  constructor(options?: {
    readonly store?: CommandOutboxStore;
    readonly now?: () => Date;
    readonly newCommandId?: () => string;
  }) {
    this.store = options?.store ?? createBrowserCommandOutboxStore();
    this.now = options?.now ?? (() => new Date());
    this.newCommandId = options?.newCommandId ?? (() => createMobileCommandId());
  }

  async list() {
    return this.store.load();
  }

  async enqueue(input: NewMobileOutboxCommand) {
    const commandId = this.newCommandId();
    const timestamp = this.now().toISOString();
    const queuedCommand: QueuedMobileCommand = {
      commandId,
      intent: input.intent,
      command: {
        type: input.type,
        commandId,
        ...input.payload,
      },
      status: "queued",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const existing = await this.store.load();
    await this.store.save([...withoutCommand(existing, commandId), queuedCommand]);
    return queuedCommand;
  }

  async dispatchNew(input: NewMobileOutboxCommand, dispatch: MobileCommandDispatcher) {
    const queuedCommand = await this.enqueue(input);
    await this.dispatchQueued(queuedCommand.commandId, dispatch);
    return queuedCommand;
  }

  async replay(dispatch: MobileCommandDispatcher): Promise<CommandReplayResult> {
    const commands = await this.store.load();
    let dispatched = 0;
    let failed = 0;

    for (const command of commands) {
      const current = await this.find(command.commandId);
      if (!current) continue;
      const succeeded = await this.dispatchRecord(current, dispatch);
      if (succeeded) {
        dispatched += 1;
      } else {
        failed += 1;
      }
    }

    return {
      dispatched,
      failed,
      remaining: await this.store.load(),
    };
  }

  async dispatchQueued(commandId: string, dispatch: MobileCommandDispatcher) {
    const queuedCommand = await this.find(commandId);
    if (!queuedCommand) return;
    await this.dispatchRecord(queuedCommand, dispatch);
  }

  async cancel(commandId: string) {
    const commands = await this.store.load();
    await this.store.save(withoutCommand(commands, commandId));
  }

  async clear() {
    await this.store.save([]);
  }

  private async find(commandId: string) {
    const commands = await this.store.load();
    return commands.find((command) => command.commandId === commandId) ?? null;
  }

  private async dispatchRecord(command: QueuedMobileCommand, dispatch: MobileCommandDispatcher) {
    const started = updateQueuedCommand(command, {
      status: "dispatching",
      attempts: command.attempts + 1,
      updatedAt: this.now().toISOString(),
      lastError: undefined,
    });
    await this.replace(started);

    try {
      await dispatch(started.command);
      await this.cancel(started.commandId);
      return true;
    } catch (error) {
      await this.replace(
        updateQueuedCommand(started, {
          status: "failed",
          updatedAt: this.now().toISOString(),
          lastError: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  private async replace(command: QueuedMobileCommand) {
    const commands = await this.store.load();
    await this.store.save([...withoutCommand(commands, command.commandId), command]);
  }
}

export const mobileCommandOutbox = new MobileCommandOutbox();

function withoutCommand(commands: readonly QueuedMobileCommand[], commandId: string) {
  return commands.filter((command) => command.commandId !== commandId);
}

function updateQueuedCommand(
  command: QueuedMobileCommand,
  updates: Partial<Omit<QueuedMobileCommand, "command" | "commandId" | "createdAt" | "intent">>,
): QueuedMobileCommand {
  return {
    ...command,
    ...updates,
  };
}

function parseQueuedCommands(raw: string | null) {
  if (!raw) return [];
  try {
    const payload = JSON.parse(raw) as unknown;
    return Array.isArray(payload) ? payload.filter(isQueuedMobileCommand) : [];
  } catch {
    return [];
  }
}

function isQueuedMobileCommand(payload: unknown): payload is QueuedMobileCommand {
  const command = payload as Partial<QueuedMobileCommand>;
  return (
    typeof command.commandId === "string" &&
    isOutboxIntent(command.intent) &&
    isMobileOutboxCommand(command.command) &&
    (command.status === "queued" ||
      command.status === "dispatching" ||
      command.status === "failed") &&
    typeof command.attempts === "number" &&
    Number.isInteger(command.attempts) &&
    command.attempts >= 0 &&
    typeof command.createdAt === "string" &&
    typeof command.updatedAt === "string" &&
    (command.lastError === undefined || typeof command.lastError === "string")
  );
}

function isOutboxIntent(value: unknown): value is MobileOutboxIntent {
  return value === "send" || value === "continue" || value === "stop";
}

function isMobileOutboxCommand(payload: unknown): payload is MobileOutboxCommand {
  const command = payload as Partial<MobileOutboxCommand>;
  return typeof command.type === "string" && typeof command.commandId === "string";
}
