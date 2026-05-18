import { describe, expect, test } from "vitest";

import {
  classifyProbeError,
  generateBackendCandidates,
  normalizeBackendUrl,
  probeBackendCandidate,
} from "@/client/discovery";

const androidCandidates = () =>
  generateBackendCandidates({
    platform: "android",
    manualUrl: " http://10.0.2.2:3773/ ",
  });

describe("mobile backend discovery", () => {
  test("normalizes backend URLs", () => {
    expect(normalizeBackendUrl("10.0.2.2:3773/")).toBe("http://10.0.2.2:3773");
    expect(normalizeBackendUrl("https://example.test:3773/path?x=1#token")).toBe(
      "https://example.test:3773",
    );
    expect(normalizeBackendUrl("")).toBeNull();
  });

  test("prioritizes the Android emulator host and removes duplicates", () => {
    const candidates = androidCandidates();

    expect(candidates[0]).toMatchObject({
      url: "http://10.0.2.2:3773",
      source: "emulator",
    });
    expect(candidates.map((candidate) => candidate.url)).toEqual([
      "http://10.0.2.2:3773",
      "http://127.0.0.1:3773",
      "http://localhost:3773",
    ]);
  });

  test("adds desktop browser defaults", () => {
    expect(
      generateBackendCandidates({ platform: "web" }).map((candidate) => candidate.url),
    ).toEqual(["http://127.0.0.1:3773", "http://localhost:3773"]);
  });

  test("accepts unauthenticated T3 auth session responses", async () => {
    const [candidate] = generateBackendCandidates({ platform: "web" });
    const result = await probeBackendCandidate(candidate, {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            authenticated: false,
            auth: {
              policy: "desktop-managed-local",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      now: () => 1000,
    });

    expect(result.status).toBe("valid");
    expect(result.authenticated).toBe(false);
    expect(result.message).toContain("pairing required");
  });

  test("rejects invalid auth session responses", async () => {
    const [candidate] = generateBackendCandidates({ platform: "web" });
    const result = await probeBackendCandidate(candidate, {
      fetcher: async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    expect(result.status).toBe("invalid-response");
  });

  test("classifies timeout and refused probes", () => {
    const [candidate] = generateBackendCandidates({ platform: "web" });

    expect(classifyProbeError(new DOMException("Aborted", "AbortError"), candidate)).toBe(
      "timeout",
    );
    expect(classifyProbeError(new Error("Failed to fetch"), candidate)).toBe("connection-refused");
  });

  test("does not treat Capacitor Android cleartext as browser mixed content", () => {
    const [candidate] = androidCandidates();
    const originalCapacitor = (window as Window & { Capacitor?: { getPlatform?: () => string } })
      .Capacitor;
    const originalSecureContext = window.isSecureContext;

    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: {
        getPlatform: () => "android",
      },
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });

    expect(classifyProbeError(new Error("Failed to fetch"), candidate)).toBe("connection-refused");

    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: originalCapacitor,
    });
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: originalSecureContext,
    });
  });
});
