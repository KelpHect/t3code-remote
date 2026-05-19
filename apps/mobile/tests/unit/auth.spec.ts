import { describe, expect, test, vi } from "vitest";

import { bootstrapBearerSession, issueWebSocketToken, resolvePairingTarget } from "@/client/auth";

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
      backendUrl: "http://10.0.2.2:3773",
      credential: "pairing-token",
    });
  });

  test("keeps a discovered emulator backend when a pasted pairing URL uses desktop loopback", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://10.0.2.2:3773",
        pairingInput: "http://127.0.0.1:3773/pair#token=pairing-token",
      }),
    ).toEqual({
      backendUrl: "http://10.0.2.2:3773",
      credential: "pairing-token",
    });
  });

  test("keeps a discovered LAN backend when a pasted pairing URL uses localhost", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://192.168.0.152:3773",
        pairingInput: "http://localhost:3773/pair#token=pairing-token",
      }),
    ).toEqual({
      backendUrl: "http://192.168.0.152:3773",
      credential: "pairing-token",
    });
  });

  test("uses the pairing URL host when it is reachable from another device", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://10.0.2.2:3773",
        pairingInput: "http://192.168.0.152:3773/pair#token=pairing-token",
      }),
    ).toEqual({
      backendUrl: "http://192.168.0.152:3773",
      credential: "pairing-token",
    });
  });

  test("extracts hosted pairing backend URLs from the host query parameter", () => {
    expect(
      resolvePairingTarget({
        backendUrl: "http://10.0.2.2:3773",
        pairingInput:
          "https://app.t3.codes/pair?host=http%3A%2F%2F10.0.2.2%3A3773#token=pairing-token",
      }),
    ).toEqual({
      backendUrl: "http://10.0.2.2:3773",
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

  test("uses bound global fetch when no test fetcher is provided", async () => {
    const originalFetch = globalThis.fetch;
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
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetcher,
    });

    try {
      await expect(
        bootstrapBearerSession({
          backendUrl: "http://127.0.0.1:3773",
          pairingInput: "pairing-token",
        }),
      ).resolves.toMatchObject({
        sessionToken: "session-token",
      });

      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
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

  test("requests a short-lived WebSocket token with bearer authorization", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: "ws-token",
          expiresAt: "2026-05-18T20:01:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      issueWebSocketToken({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "session-token",
        fetcher,
      }),
    ).resolves.toEqual({
      token: "ws-token",
      expiresAt: "2026-05-18T20:01:00.000Z",
    });

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3773/api/auth/ws-token", {
      headers: {
        authorization: "Bearer session-token",
      },
      method: "POST",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test("surfaces WebSocket token auth denial clearly", async () => {
    await expect(
      issueWebSocketToken({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "expired-session-token",
        fetcher: async () =>
          new Response(JSON.stringify({ error: "Session expired" }), { status: 401 }),
      }),
    ).rejects.toThrow("Session expired");
  });

  test("rejects WebSocket token responses without token", async () => {
    await expect(
      issueWebSocketToken({
        backendUrl: "http://127.0.0.1:3773",
        sessionToken: "session-token",
        fetcher: async () =>
          new Response(JSON.stringify({ expiresAt: "2026-05-18T20:01:00.000Z" }), {
            status: 200,
          }),
      }),
    ).rejects.toThrow("WebSocket token response");
  });
});
