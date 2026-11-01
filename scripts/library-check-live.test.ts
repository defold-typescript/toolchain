import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import type { DownloadExtensionArchive } from "../packages/cli/src/extension-archive.ts";
import { LIBRARY_DATA_MAIN_URL } from "../packages/cli/src/library-data-archive.ts";
import { writeLibraryTargets } from "../packages/cli/src/library-data-fixture.ts";
import { writeZipArchive, type ZipFixtureEntry } from "../packages/types/test/zip-fixture.ts";
import { runLiveLibraryCheck } from "./library-check-live.ts";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const CLI = "0.55.0";
const CHECK_TIMEOUT = 120_000;

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "library-check-live-"));
}

// One authored fork measured against two upstream functions, so the real check
// passes when the fork declares both and falls below its floor when it does not.
function writeDataFolder(dataDir: string, forkMembers: readonly string[]): void {
  writeLibraryTargets(dataDir, {
    forks: [
      {
        repo: "https://github.com/owner/lib",
        ref: "v1.0.0",
        authored: "fork/lib.main.d.ts",
        moduleId: "lib.main",
        namespace: "lib.main",
        apiDoc: "api-doc/lib.main.json",
        upstreamLua: ["source/upstream/main.lua"],
      },
    ],
    floors: { lib: { "lib.main": { callable: 1, field: 1 } } },
  });
  const members = forkMembers
    .map((name) => `  /** Does ${name}. */\n  export function ${name}(): void;`)
    .join("\n");
  const files = {
    "lib/fork/lib.main.d.ts": `declare module 'lib.main' {\n${members}\n}\n`,
    "lib/source/upstream/main.lua":
      "local M = {}\nfunction M.first() end\nfunction M.second() end\nreturn M\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    const out = join(dataDir, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
  }
}

// An archive as GitHub packs the data repo: every file under one `<repo>-<ref>/data/`
// folder, with the commit in the comment.
function dataArchive(folder: string, forkMembers: readonly string[]): Uint8Array {
  const root = tmp();
  const dataDir = join(root, folder);
  writeDataFolder(dataDir, forkMembers);
  const entries: ZipFixtureEntry[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else {
        const rel = relative(root, path).replaceAll("\\", "/");
        entries.push({ name: `library-data-main/data/${rel}`, text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(root);
  return writeZipArchive(entries, { comment: COMMIT });
}

const serves =
  (bytes: Uint8Array): DownloadExtensionArchive =>
  async () => ({ status: "ok", bytes, etag: '"main"' });

const offline: DownloadExtensionArchive = async () => {
  throw new Error("network down");
};

async function check(
  download: DownloadExtensionArchive,
  cacheDir = tmp(),
): Promise<{ code: number; output: string }> {
  let output = "";
  const code = await runLiveLibraryCheck({
    download,
    cacheDir,
    cliVersion: CLI,
    write: (text) => {
      output += text;
    },
  });
  return { code, output };
}

describe("runLiveLibraryCheck", () => {
  test(
    "live data that passes the library check exits 0",
    async () => {
      const { code, output } = await check(serves(dataArchive(CLI, ["first", "second"])));
      expect(output).not.toContain("floor");
      expect(code).toBe(0);
    },
    CHECK_TIMEOUT,
  );

  test(
    "a library below its coverage floor exits 1 and names the library and the check",
    async () => {
      const { code, output } = await check(serves(dataArchive(CLI, ["first"])));
      expect(code).toBe(1);
      expect(output).toContain("lib: floor: lib.main: callable coverage 0.5 is below its floor 1");
    },
    CHECK_TIMEOUT,
  );

  test(
    "an unreachable data repo exits 1 even with a cached copy, and names the url",
    async () => {
      const cacheDir = tmp();
      const seeded = await check(serves(dataArchive(CLI, ["first", "second"])), cacheDir);
      expect(seeded.code).toBe(0);

      const { code, output } = await check(offline, cacheDir);
      expect(code).toBe(1);
      expect(output).toContain(LIBRARY_DATA_MAIN_URL);
    },
    CHECK_TIMEOUT,
  );

  test("an archive with no data folder for the CLI version exits 1 and names the version", async () => {
    const { code, output } = await check(serves(dataArchive("9.0.0", ["first", "second"])));
    expect(code).toBe(1);
    expect(output).toContain(CLI);
  });
});
