export type MobileSequenceScope = string;

export interface SequencedApplyResult {
  readonly applied: boolean;
  readonly sequence: number | null;
  readonly lastSequence: number | null;
  readonly reason: "accepted" | "missing-sequence" | "stale-or-duplicate";
}

export class MobileSequenceFilter {
  private readonly sequences = new Map<MobileSequenceScope, number>();

  constructor(initialSequences?: ReadonlyMap<MobileSequenceScope, number>) {
    if (!initialSequences) return;
    for (const [scope, sequence] of initialSequences) {
      if (isSequenceNumber(sequence)) {
        this.sequences.set(scope, sequence);
      }
    }
  }

  getLastSequence(scope: MobileSequenceScope) {
    return this.sequences.get(scope) ?? null;
  }

  inspect(scope: MobileSequenceScope, payload: unknown): SequencedApplyResult {
    const sequence = extractMobileSequence(payload);
    const lastSequence = this.getLastSequence(scope);
    if (sequence === null) {
      return {
        applied: false,
        lastSequence,
        reason: "missing-sequence",
        sequence,
      };
    }
    if (lastSequence !== null && sequence <= lastSequence) {
      return {
        applied: false,
        lastSequence,
        reason: "stale-or-duplicate",
        sequence,
      };
    }
    return {
      applied: true,
      lastSequence,
      reason: "accepted",
      sequence,
    };
  }

  accept(scope: MobileSequenceScope, payload: unknown) {
    const result = this.inspect(scope, payload);
    if (result.applied && result.sequence !== null) {
      this.sequences.set(scope, result.sequence);
    }
    return result;
  }

  apply<State>(
    scope: MobileSequenceScope,
    payload: unknown,
    state: State,
    reducer: (state: State, payload: unknown, sequence: number) => State,
  ) {
    const result = this.inspect(scope, payload);
    if (!result.applied || result.sequence === null) {
      return { result, state };
    }

    const nextState = reducer(state, payload, result.sequence);
    this.sequences.set(scope, result.sequence);
    return { result, state: nextState };
  }

  reset(scope?: MobileSequenceScope) {
    if (scope) {
      this.sequences.delete(scope);
      return;
    }
    this.sequences.clear();
  }
}

export function extractMobileSequence(payload: unknown): number | null {
  const direct = readSequenceValue(payload);
  if (direct !== null) return direct;

  if (!isObject(payload)) return null;
  const snapshot = readSequenceValue(payload.snapshot);
  if (snapshot !== null) return snapshot;

  const event = readSequenceValue(payload.event);
  if (event !== null) return event;

  const result = readSequenceValue(payload.result);
  if (result !== null) return result;

  return null;
}

function readSequenceValue(payload: unknown) {
  if (!isObject(payload)) return null;
  const candidate = payload as {
    readonly sequence?: unknown;
    readonly snapshotSequence?: unknown;
  };
  if (isSequenceNumber(candidate.sequence)) return candidate.sequence;
  if (isSequenceNumber(candidate.snapshotSequence)) return candidate.snapshotSequence;
  return null;
}

function isSequenceNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
