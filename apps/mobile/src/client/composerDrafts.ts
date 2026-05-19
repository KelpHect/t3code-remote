export interface ComposerDraftRef {
  readonly backendUrl?: string | null;
  readonly projectId?: string | null;
  readonly threadId?: string | null;
}

export interface ComposerDraft {
  readonly key: string;
  readonly backendUrl: string;
  readonly projectId: string;
  readonly threadId: string;
  readonly text: string;
  readonly updatedAt: string;
}

export interface ComposerDraftStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

const DEFAULT_DRAFT_STORE_KEY = "t3.mobile.composerDrafts.v1";

export function makeComposerDraftKey(ref: ComposerDraftRef) {
  return [
    normalizeDraftSegment(ref.backendUrl, "unpaired"),
    normalizeDraftSegment(ref.projectId, "no-project"),
    normalizeDraftSegment(ref.threadId, "new-thread"),
  ]
    .map(encodeURIComponent)
    .join("/");
}

export function createInMemoryComposerDraftStorage(
  seed: Record<string, string> = {},
): ComposerDraftStorage {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

export function createBrowserComposerDraftStorage() {
  if (typeof globalThis.window === "undefined") return createInMemoryComposerDraftStorage();
  return globalThis.window.localStorage;
}

export class MobileComposerDraftStore {
  private readonly storeKey: string;
  private readonly storage: ComposerDraftStorage;
  private readonly now: () => Date;

  constructor(options?: {
    readonly storage?: ComposerDraftStorage;
    readonly storeKey?: string;
    readonly now?: () => Date;
  }) {
    this.storage = options?.storage ?? createBrowserComposerDraftStorage();
    this.storeKey = options?.storeKey ?? DEFAULT_DRAFT_STORE_KEY;
    this.now = options?.now ?? (() => new Date());
  }

  load(ref: ComposerDraftRef) {
    const drafts = this.readAll();
    return drafts[makeComposerDraftKey(ref)] ?? null;
  }

  save(ref: ComposerDraftRef, text: string) {
    const trimmedText = text.trimEnd();
    if (trimmedText.length === 0) {
      this.remove(ref);
      return null;
    }

    const key = makeComposerDraftKey(ref);
    const draft: ComposerDraft = {
      key,
      backendUrl: normalizeDraftSegment(ref.backendUrl, "unpaired"),
      projectId: normalizeDraftSegment(ref.projectId, "no-project"),
      threadId: normalizeDraftSegment(ref.threadId, "new-thread"),
      text: trimmedText,
      updatedAt: this.now().toISOString(),
    };
    this.writeAll({
      ...this.readAll(),
      [key]: draft,
    });
    return draft;
  }

  remove(ref: ComposerDraftRef) {
    const key = makeComposerDraftKey(ref);
    const drafts = this.readAll();
    if (!(key in drafts)) return;
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    this.writeAll(nextDrafts);
  }

  list() {
    return Object.values(this.readAll()).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  clear() {
    this.storage.removeItem(this.storeKey);
  }

  private readAll() {
    const raw = this.storage.getItem(this.storeKey);
    if (!raw) return {};
    try {
      const payload = JSON.parse(raw) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
      return Object.fromEntries(
        Object.entries(payload).filter(
          (entry): entry is [string, ComposerDraft] =>
            typeof entry[0] === "string" && isComposerDraft(entry[1]) && entry[0] === entry[1].key,
        ),
      );
    } catch {
      return {};
    }
  }

  private writeAll(drafts: Record<string, ComposerDraft>) {
    const draftValues = Object.values(drafts);
    if (draftValues.length === 0) {
      this.storage.removeItem(this.storeKey);
      return;
    }
    this.storage.setItem(this.storeKey, JSON.stringify(drafts));
  }
}

export const mobileComposerDrafts = new MobileComposerDraftStore();

function normalizeDraftSegment(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (!trimmed.includes("://")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function isComposerDraft(payload: unknown): payload is ComposerDraft {
  const draft = payload as Partial<ComposerDraft>;
  return (
    typeof draft.key === "string" &&
    typeof draft.backendUrl === "string" &&
    typeof draft.projectId === "string" &&
    typeof draft.threadId === "string" &&
    typeof draft.text === "string" &&
    draft.text.length > 0 &&
    typeof draft.updatedAt === "string"
  );
}
