import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Writable } from "node:stream";
import type { DispatchIo } from "../packages/cli/src/dispatch.ts";
import { LIBRARY_DATA_DIR } from "../packages/cli/src/library/package-root.ts";
import { writeLibraryTargets } from "../packages/cli/src/library-data-fixture.ts";
import { type LibraryCheckRunner, runLibraryDataCheck } from "./library-check-data.ts";

const CHECK_TIMEOUT = 120_000;
const REPO_DATA = dirname(LIBRARY_DATA_DIR);

const slash = (path: string): string => path.replaceAll("\\", "/");

function captureIo(): { io: DispatchIo; output: () => string } {
  let text = "";
  const sink = (): Writable =>
    new Writable({
      write(chunk, _enc, cb) {
        text += String(chunk);
        cb();
      },
    });
  return { io: { stdout: sink(), stderr: sink() }, output: () => text };
}

// A data base holding one version folder: one authored fork measured against two
// upstream functions, so the real check passes when the fork declares both and
// falls below its floor when it does not.
function dataBase(forkMembers: readonly string[]): string {
  const base = mkdtempSync(join(tmpdir(), "library-check-data-"));
  const dataDir = join(base, "0.55.0");
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
  return base;
}

describe("runLibraryDataCheck", () => {
  test("runs library check over this repo's library data folder and nothing else", async () => {
    const calls: string[][] = [];
    const run: LibraryCheckRunner = async (args) => {
      calls.push(args.map(slash));
      return 0;
    };
    const code = await runLibraryDataCheck({ run, io: captureIo().io });
    expect(calls).toEqual([["library", "check", "--data", slash(REPO_DATA)]]);
    expect(code).toBe(0);
  });

  test("returns the check's exit code", async () => {
    const code = await runLibraryDataCheck({ run: async () => 1, io: captureIo().io });
    expect(code).toBe(1);
  });

  test(
    "data that passes the check with this repo's CLI exits 0",
    async () => {
      const { io, output } = captureIo();
      const code = await runLibraryDataCheck({ dataDir: dataBase(["first", "second"]), io });
      expect(output()).toContain("no problems");
      expect(code).toBe(0);
    },
    CHECK_TIMEOUT,
  );

  test(
    "a library below its coverage floor exits 1 and prints the library and the check",
    async () => {
      const { io, output } = captureIo();
      const code = await runLibraryDataCheck({ dataDir: dataBase(["first"]), io });
      expect(code).toBe(1);
      expect(output()).toContain(
        "lib: floor: lib.main: callable coverage 0.5 is below its floor 1",
      );
    },
    CHECK_TIMEOUT,
  );
});
