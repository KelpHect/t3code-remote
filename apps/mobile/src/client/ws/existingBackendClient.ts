import { issueWebSocketToken } from "@/client/auth";

import { ExistingWsTransport } from "./effectRpcTransport";

export interface ExistingBackendSession {
  readonly backendUrl: string;
  readonly sessionToken: string;
}

export interface ExistingBackendClientOptions {
  readonly backendUrl: string;
  readonly wsToken: string;
}

export class ExistingBackendClient {
  private readonly transport: ExistingWsTransport;

  constructor(options: ExistingBackendClientOptions) {
    this.transport = new ExistingWsTransport({
      backendUrl: options.backendUrl,
      wsToken: options.wsToken,
    });
  }

  connect() {
    return this.transport.connect();
  }

  subscribeShell(listener: (item: unknown) => void, options?: { readonly onError?: () => void }) {
    return this.transport.subscribe("orchestration.subscribeShell", {}, listener, {
      onComplete: options?.onError,
      onError: options?.onError,
    });
  }

  subscribeThread(
    threadId: string,
    listener: (item: unknown) => void,
    options?: { readonly onError?: () => void },
  ) {
    return this.transport.subscribe("orchestration.subscribeThread", { threadId }, listener, {
      onComplete: options?.onError,
      onError: options?.onError,
    });
  }

  dispatchCommand(command: Record<string, unknown>) {
    return this.transport.request<{ readonly sequence: number }>(
      "orchestration.dispatchCommand",
      command,
    );
  }

  getTurnDiff(input: Record<string, unknown>) {
    return this.transport.request<unknown>("orchestration.getTurnDiff", input);
  }

  getFullThreadDiff(input: Record<string, unknown>) {
    return this.transport.request<unknown>("orchestration.getFullThreadDiff", input);
  }

  refreshVcsStatus(cwd: string) {
    return this.transport.request<unknown>("vcs.refreshStatus", { cwd });
  }

  subscribeVcsStatus(
    cwd: string,
    listener: (item: unknown) => void,
    options?: { readonly onError?: () => void },
  ) {
    return this.transport.subscribe("subscribeVcsStatus", { cwd }, listener, {
      onComplete: options?.onError,
      onError: options?.onError,
    });
  }

  async runStackedAction(
    input: Record<string, unknown>,
    listener: (item: unknown) => void,
    options?: { readonly signal?: AbortSignal },
  ) {
    return this.transport.requestStream("git.runStackedAction", input, listener, options);
  }

  browseFilesystem(input: Record<string, unknown>) {
    return this.transport.request<unknown>("filesystem.browse", input);
  }

  searchProjectEntries(input: Record<string, unknown>) {
    return this.transport.request<unknown>("projects.searchEntries", input);
  }

  lookupRepository(input: Record<string, unknown>) {
    return this.transport.request<unknown>("sourceControl.lookupRepository", input);
  }

  cloneRepository(input: Record<string, unknown>) {
    return this.transport.request<unknown>("sourceControl.cloneRepository", input);
  }

  terminalOpen(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.open", input);
  }

  terminalWrite(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.write", input);
  }

  terminalResize(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.resize", input);
  }

  terminalClear(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.clear", input);
  }

  terminalRestart(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.restart", input);
  }

  terminalClose(input: Record<string, unknown>) {
    return this.transport.request<unknown>("terminal.close", input);
  }

  subscribeTerminalEvents(
    listener: (item: unknown) => void,
    options?: { readonly onError?: () => void },
  ) {
    return this.transport.subscribe("subscribeTerminalEvents", {}, listener, {
      onComplete: options?.onError,
      onError: options?.onError,
    });
  }

  getConfig() {
    return this.transport.request<unknown>("server.getConfig", {});
  }

  refreshProviders() {
    return this.transport.request<unknown>("server.refreshProviders", {});
  }

  dispose() {
    this.transport.dispose();
  }
}

export async function createExistingBackendClient(input: ExistingBackendSession) {
  const wsToken = await issueWebSocketToken({
    backendUrl: input.backendUrl,
    sessionToken: input.sessionToken,
  });
  return new ExistingBackendClient({
    backendUrl: input.backendUrl,
    wsToken: wsToken.token,
  });
}
