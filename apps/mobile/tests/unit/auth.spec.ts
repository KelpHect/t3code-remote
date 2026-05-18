import { describe, expect, test, vi } from "vitest";

import { bootstrapBearerSession, resolvePairingTarget } from "@/client/auth";

describe("mobile auth client", () => {
  test("resolves a manual pairing token against the selected backend", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://127.0.0.1:3773",
        pairingInput: " pairing-token ",
      }),
    ).toEqual({
      backendUrl: "http://127.0.0.1:3773",
      credential: "pairing-token",
    });
  });

  test("extracts pairing tokens from URL fragments", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://10.0.2.2:3773",
        pairingInput: "http://127.0.0.1:3773/pair#token=pairing-token",
      }),
    ).toEqual({
      backendUrl: "http://127.0.0.1:3773",
      credential: "pairing-token",
    });
  });

  test("extracts pairing tokens from query strings", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://10.0.2.2:3773",
        pairingInput: "http://127.0.0.1:3773/pair?token=pairing-token",
      }),
    ).toMatchObject({
      credential: "pairing-token",
    });
  });

  test("bootstraps a bearer session without logging credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          role: "client",
          sessionMethod: "bearer-session-token",
          expiresAt: "2026-05-18T20:00:00.000Z",
          sessionToken: "session-token",
        }),
        { status: 200 },
      ),
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      bootstrapBearerSession({
        backendUrl: "http://127.0.0.1:3773",
        pairingInput: "pairing-token",
        fetcher,
      }),
    ).resolves.toMatchObject({
      sessionMethod: "bearer-session-token",
      sessionToken: "session-token",
    });

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3773/api/auth/bootstrap/bearer", {
      body: JSON.stringify({
        credential: "pairing-token",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test("rejects bearer bootstrap responses without sessionToken", async () => {
    await expect(
      bootstrapBearerSession({
        backendUrl: "http://127.0.0.1:3773",
        pairingInput: "pairing-token",
        fetcher: async () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              role: "client",
              sessionMethod: "bearer-session-token",
              expiresAt: "2026-05-18T20:00:00.000Z",
            }),
            { status: 200 },
          ),
      }),
    ).rejects.toThrow("bearer session token");
  });
});
