import {
  createExistingBackendClient,
  type ExistingBackendSession,
} from "@/client/ws/existingBackendClient";

export type MobileSourceControlProvider = "github" | "gitlab" | "azure-devops" | "bitbucket";
export type MobileCloneProtocol = "auto" | "ssh" | "https";

export interface MobileFilesystemEntry {
  readonly name: string;
  readonly fullPath: string;
}

export interface MobileFilesystemBrowseResult {
  readonly parentPath: string;
  readonly entries: readonly MobileFilesystemEntry[];
}

export interface MobileRepositoryInfo {
  readonly provider: string;
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

export interface MobileCloneResult {
  readonly cwd: string;
  readonly remoteUrl: string;
  readonly repository: MobileRepositoryInfo | null;
}

export async function browseMobileFilesystem(input: {
  readonly session: ExistingBackendSession;
  readonly partialPath: string;
  readonly cwd?: string | null;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileFilesystemBrowseResult(
      await client.browseFilesystem({
        ...(input.cwd ? { cwd: input.cwd } : {}),
        partialPath: input.partialPath,
      }),
    );
  } finally {
    client.dispose();
  }
}

export async function lookupMobileRepository(input: {
  readonly session: ExistingBackendSession;
  readonly provider: MobileSourceControlProvider;
  readonly repository: string;
  readonly cwd?: string | null;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileRepositoryInfo(
      await client.lookupRepository({
        ...(input.cwd ? { cwd: input.cwd } : {}),
        provider: input.provider,
        repository: input.repository,
      }),
    );
  } finally {
    client.dispose();
  }
}

export async function cloneMobileRepository(input: {
  readonly session: ExistingBackendSession;
  readonly destinationPath: string;
  readonly provider?: MobileSourceControlProvider | null;
  readonly repository?: string | null;
  readonly remoteUrl?: string | null;
  readonly protocol?: MobileCloneProtocol;
}) {
  const client = await createExistingBackendClient(input.session);
  try {
    await client.connect();
    return mapMobileCloneResult(
      await client.cloneRepository({
        destinationPath: input.destinationPath,
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.repository ? { repository: input.repository } : {}),
        ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
        ...(input.protocol ? { protocol: input.protocol } : {}),
      }),
    );
  } finally {
    client.dispose();
  }
}

export function mapMobileFilesystemBrowseResult(value: unknown): MobileFilesystemBrowseResult {
  const result = asRecord(value);
  return {
    entries: readArray(result.entries).map(mapFilesystemEntry).filter(isPresent),
    parentPath: readString(result.parentPath) ?? "",
  };
}

export function mapMobileRepositoryInfo(value: unknown): MobileRepositoryInfo {
  const repository = asRecord(value);
  return {
    nameWithOwner: readString(repository.nameWithOwner) ?? "Repository",
    provider: readString(repository.provider) ?? "unknown",
    sshUrl: readString(repository.sshUrl) ?? "",
    url: readString(repository.url) ?? "",
  };
}

export function mapMobileCloneResult(value: unknown): MobileCloneResult {
  const result = asRecord(value);
  const repository = asRecord(result.repository);
  return {
    cwd: readString(result.cwd) ?? "",
    remoteUrl: readString(result.remoteUrl) ?? "",
    repository: Object.keys(repository).length === 0 ? null : mapMobileRepositoryInfo(repository),
  };
}

export function inferMobileProjectTitle(path: string) {
  const normalized = path.trim().replace(/[/\\]+$/, "");
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  const leaf = segments[segments.length - 1];
  return leaf ?? "New project";
}

export function isLikelyRemoteUrl(value: string) {
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(value.trim());
}

function mapFilesystemEntry(value: unknown): MobileFilesystemEntry | null {
  const entry = asRecord(value);
  const fullPath = readString(entry.fullPath);
  const name = readString(entry.name);
  if (!fullPath || !name) return null;
  return { fullPath, name };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
