import { describe, expect, test } from "vitest";

import {
  formatMobileModelSelection,
  mapServerConfigToModelChoices,
  normalizeInteractionMode,
  normalizeRuntimeMode,
  sameMobileModelSelection,
} from "@/client/mobileModelControls";

describe("mobile model controls", () => {
  test("maps backend providers into selectable model choices", () => {
    const choices = mapServerConfigToModelChoices({
      providers: [
        {
          badgeLabel: "Codex",
          displayName: "Codex CLI",
          enabled: true,
          installed: true,
          instanceId: "codex",
          models: [
            {
              name: "GPT-5.5",
              shortName: "GPT-5.5",
              slug: "gpt-5.5",
            },
          ],
          showInteractionModeToggle: true,
        },
      ],
    });

    expect(choices).toEqual([
      {
        id: "codex:gpt-5.5",
        modelLabel: "GPT-5.5",
        providerLabel: "Codex CLI",
        selection: {
          instanceId: "codex",
          model: "gpt-5.5",
        },
        status: "ready",
        supportsPlanMode: true,
      },
    ]);
  });

  test("marks disabled and unavailable providers without hiding their models", () => {
    const choices = mapServerConfigToModelChoices({
      providers: [
        {
          enabled: false,
          installed: true,
          instanceId: "claudeAgent",
          models: [{ name: "Claude Sonnet", slug: "claude-sonnet" }],
        },
        {
          availability: "unavailable",
          enabled: false,
          installed: false,
          instanceId: "forkProvider",
          models: [{ name: "Fork model", slug: "fork-model" }],
        },
      ],
    });

    expect(choices.map((choice) => choice.status)).toEqual(["disabled", "unavailable"]);
  });

  test("normalizes malformed modes and formats selection labels", () => {
    expect(normalizeRuntimeMode("approval-required")).toBe("approval-required");
    expect(normalizeRuntimeMode("unknown")).toBe("full-access");
    expect(normalizeInteractionMode("plan")).toBe("plan");
    expect(normalizeInteractionMode("other")).toBe("default");
    expect(formatMobileModelSelection({ instanceId: "codex", model: "gpt-5.4" })).toBe(
      "codex · gpt-5.4",
    );
  });

  test("compares model selections including options", () => {
    expect(
      sameMobileModelSelection(
        { instanceId: "codex", model: "gpt-5.5", options: [{ id: "fast", value: true }] },
        { instanceId: "codex", model: "gpt-5.5", options: [{ id: "fast", value: true }] },
      ),
    ).toBe(true);
    expect(
      sameMobileModelSelection(
        { instanceId: "codex", model: "gpt-5.5" },
        { instanceId: "codex", model: "gpt-5.4" },
      ),
    ).toBe(false);
  });
});
