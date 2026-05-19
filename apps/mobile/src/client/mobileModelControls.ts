import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

import { createFallbackModelSelection, type MobileModelSelection } from "./mobileChatCommands";

export type MobileRuntimeMode = "approval-required" | "auto-accept-edits" | "full-access";
export type MobileInteractionMode = "default" | "plan";

export interface MobileModelChoice {
  readonly id: string;
  readonly selection: MobileModelSelection;
  readonly providerLabel: string;
  readonly modelLabel: string;
  readonly status: "ready" | "disabled" | "unavailable";
  readonly supportsPlanMode: boolean;
}

export const mobileRuntimeModeOptions: readonly {
  readonly value: MobileRuntimeMode;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "approval-required",
    label: "Supervised",
    detail: "Ask before commands and file changes.",
  },
  {
    value: "auto-accept-edits",
    label: "Auto-accept edits",
    detail: "Approve edits, ask before other actions.",
  },
  {
    value: "full-access",
    label: "Full access",
    detail: "Allow commands and edits without prompts.",
  },
];

export const mobileInteractionModeOptions: readonly {
  readonly value: MobileInteractionMode;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "default",
    label: "Build",
    detail: "Work directly on the requested change.",
  },
  {
    value: "plan",
    label: "Plan",
    detail: "Ask for a plan before implementation.",
  },
];

export async function loadMobileModelChoices(session: ExistingBackendSession) {
  const client = await createExistingBackendClient(session);
  try {
    await client.connect();
    const config = await client.getConfig();
    return mapServerConfigToModelChoices(config);
  } finally {
    client.dispose();
  }
}

export async function refreshMobileModelChoices(session: ExistingBackendSession) {
  const client = await createExistingBackendClient(session);
  try {
    await client.connect();
    const result = await client.refreshProviders();
    return mapServerProvidersToModelChoices(readArray(readObject(result)?.providers));
  } finally {
    client.dispose();
  }
}

export function mapServerConfigToModelChoices(config: unknown) {
  return mapServerProvidersToModelChoices(readArray(readObject(config)?.providers));
}

export function mapServerProvidersToModelChoices(providers: readonly unknown[]) {
  const choices = providers.flatMap((provider) => {
    const providerObject = readObject(provider);
    if (!providerObject) return [];
    const instanceId = readString(providerObject.instanceId);
    if (!instanceId) return [];
    const providerLabel =
      readString(providerObject.displayName) ??
      readString(providerObject.badgeLabel) ??
      readString(providerObject.driver) ??
      instanceId;
    const enabled = providerObject.enabled === true;
    const installed = providerObject.installed === true;
    const unavailable = providerObject.availability === "unavailable";
    const status: MobileModelChoice["status"] =
      enabled && installed && !unavailable ? "ready" : unavailable ? "unavailable" : "disabled";
    const supportsPlanMode = providerObject.showInteractionModeToggle !== false;

    return readArray(providerObject.models).flatMap((model) => {
      const modelObject = readObject(model);
      const slug = readString(modelObject?.slug);
      if (!slug) return [];
      const modelLabel =
        readString(modelObject?.shortName) ?? readString(modelObject?.name) ?? slug;
      return [
        {
          id: `${instanceId}:${slug}`,
          modelLabel,
          providerLabel,
          selection: {
            instanceId,
            model: slug,
          },
          status,
          supportsPlanMode,
        },
      ];
    });
  });

  return choices.length > 0
    ? choices
    : [
        {
          id: "fallback:gpt-5.5",
          modelLabel: "GPT-5.5",
          providerLabel: "Codex",
          selection: createFallbackModelSelection(),
          status: "ready" as const,
          supportsPlanMode: true,
        },
      ];
}

export function normalizeRuntimeMode(value: unknown): MobileRuntimeMode {
  return value === "approval-required" || value === "auto-accept-edits" || value === "full-access"
    ? value
    : "full-access";
}

export function normalizeInteractionMode(value: unknown): MobileInteractionMode {
  return value === "plan" ? "plan" : "default";
}

export function formatMobileModelSelection(selection: MobileModelSelection | null | undefined) {
  const model = typeof selection?.model === "string" ? selection.model : null;
  const instanceId = typeof selection?.instanceId === "string" ? selection.instanceId : null;
  if (model && instanceId) return `${instanceId} · ${model}`;
  return model ?? instanceId ?? "GPT-5.5";
}

export function sameMobileModelSelection(
  left: MobileModelSelection | null | undefined,
  right: MobileModelSelection | null | undefined,
) {
  return (
    formatSelectionKey(left) === formatSelectionKey(right) &&
    JSON.stringify(left?.options ?? null) === JSON.stringify(right?.options ?? null)
  );
}

function formatSelectionKey(selection: MobileModelSelection | null | undefined) {
  const instanceId = typeof selection?.instanceId === "string" ? selection.instanceId : "";
  const model = typeof selection?.model === "string" ? selection.model : "";
  return `${instanceId}:${model}`;
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
