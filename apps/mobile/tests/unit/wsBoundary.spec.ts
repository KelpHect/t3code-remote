import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "../..");
const sourceRoot = path.join(projectRoot, "src");
const privateWireRoot = path.join(sourceRoot, "client", "ws");

const privateWirePatterns = [
  {
    label: "imports private Effect RPC transport",
    pattern: /from\s+["'][^"']*client\/ws\/effectRpcTransport["']/,
  },
  {
    label: "matches private Effect RPC envelope tags",
    pattern:
      /_tag\s*:\s*["'](?:Ack|Chunk|ClientProtocolError|Defect|Exit|Failure|Interrupt|Ping|Pong|Request|Success)["']/,
  },
  {
    label: "matches private Effect RPC JSON envelope keys",
    pattern:
      /["_']_tag["_']\s*:\s*["'](?:Ack|Chunk|ClientProtocolError|Defect|Exit|Failure|Interrupt|Ping|Pong|Request|Success)["']/,
  },
];

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return await listSourceFiles(fullPath);
      }
      return [fullPath];
    }),
  );
  return files.flat();
}

describe("mobile /ws private wire boundary", () => {
  test("keeps Effect RPC parsing out of Vue components and app state", async () => {
    const files = (await listSourceFiles(sourceRoot)).filter((file) => {
      if (!/\.(ts|vue)$/.test(file)) return false;
      const privateWireRelativePath = path.relative(privateWireRoot, file);
      const isPrivateWireFile =
        privateWireRelativePath === "" ||
        (!privateWireRelativePath.startsWith("..") && !path.isAbsolute(privateWireRelativePath));
      return !isPrivateWireFile;
    });

    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const relativePath = path.relative(projectRoot, file);
      for (const { label, pattern } of privateWirePatterns) {
        if (pattern.test(source)) {
          violations.push(`${relativePath}: ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
