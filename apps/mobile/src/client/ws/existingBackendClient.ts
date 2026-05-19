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
