import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { newestDataFolder } from "./data-folder";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { type PrintedLibraryModule, printLibraryModules } from "./print-library";
import type { LibrarySourceTree } from "./source-tree";
import { readAuthoredTargets } from "./sync-authored-types";
import { readLualsTargets } from "./sync-luals-types";
import { readScriptApiTargets } from "./sync-script-api-types";

const PKG_DIR = LIBRARY_TYPES_ROOT;
const DATA = path.relative(PKG_DIR, LIBRARY_DATA_DIR).split(path.sep).join("/");
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..");

// Packing and printing every served module twice outruns Bun's 5s default.
const PACKED_PRINT_TIMEOUT_MS = 120_000;

function packedPaths(cwd: string): string[] {
  const proc = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new Error(`bun pm pack --dry-run failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

describe("@defold-typescript/library-types publish surface", () => {
  const paths = packedPaths(PKG_DIR);

  test("ships the per-library resolve manifest the CLI reads to recognize libraries", () => {
    expect(paths).toContain(`${DATA}/druid/library.json`);
    expect(paths).toContain(`${DATA}/druid/reviewed.json`);
    expect(paths).toContain(`${DATA}/druid/recipe.json`);
    expect(paths).toContain(`${DATA}/druid/source/druid/druid/druid.lua`);
  });

  test("ships the script_api resolve manifest so installed packages can resolve bridge", () => {
    expect(paths).toContain(`${DATA}/bridge-defold/recipe.json`);
    expect(paths).toContain(`${DATA}/bridge-defold/source/bridge.bridge.script_api`);
  });

  test("ships the authored resolve manifest so installed packages can resolve defcon", () => {
    expect(paths).toContain(`${DATA}/defcon/library.json`);
    expect(paths).toContain(`${DATA}/defcon/fork/defcon.console.d.ts`);
  });

  test("ships the curated native declarations resolve installs", () => {
    expect(paths).toContain(`${DATA}/defold-daabbcc/library.json`);
    expect(paths).toContain(`${DATA}/defold-daabbcc/fork/daabbcc.d.ts`);
  });

  test("ships the curated extension manifest resolve reads to note extension index bases", () => {
    expect(paths).toContain("defold-extensions.json");
  });

  test("keeps the already-shipped registry JSONs", () => {
    expect(paths).toContain("library-targets.json");
    expect(paths).toContain("library-classification.json");
  });

  test("excludes tests from the published tarball", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/\.test\.ts$/);
    }
  });

  test("ships declarations only, no tooling source (the generators live in the CLI)", () => {
    expect(paths.filter((path) => path.endsWith(".ts") && !path.endsWith(".d.ts"))).toEqual([]);
  });
});

// Loaded by path: the root scripts sit outside this package's tsconfig.
interface PackProof {
  packPackage(pkg: "library-types", dest: string): Uint8Array;
  extractPackage(tar: Uint8Array, dir: string): number;
}

describe("an installed @defold-typescript/library-types prints every served module", () => {
  const moduleIds = [
    ...readLualsTargets(LIBRARY_DATA_DIR),
    ...readScriptApiTargets(LIBRARY_DATA_DIR),
    ...readAuthoredTargets(LIBRARY_DATA_DIR),
  ].map(({ moduleId }) => moduleId);
  let work = "";
  let installDir = "";
  let repoPrinted: PrintedLibraryModule[] = [];

  beforeAll(async () => {
    work = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-library-types-pack-"));
    installDir = path.join(work, "installed");
    mkdirSync(installDir);
    const { extractPackage, packPackage } = (await import(
      path.join(REPO_ROOT, "scripts", "release-pack-proof.ts")
    )) as PackProof;
    extractPackage(packPackage("library-types", work), installDir);
    repoPrinted = (await printLibraryModules(LIBRARY_DATA_DIR, moduleIds, null)).printed;
  }, PACKED_PRINT_TIMEOUT_MS);

  afterAll(() => {
    if (work !== "") rmSync(work, { recursive: true, force: true });
  });

  test(
    "prints from library data alone what the repo prints",
    async () => {
      const installed = await printLibraryModules(newestDataFolder(installDir), moduleIds, null);

      expect(installed.unprintable).toEqual([]);
      expect(installed.printed).toEqual(repoPrinted);
    },
    PACKED_PRINT_TIMEOUT_MS,
  );

  test("prints the pinned sources, with the reason, when the archive holds no files", async () => {
    const [target] = readLualsTargets(LIBRARY_DATA_DIR);
    if (target === undefined) throw new Error("library data holds no LuaLS target");
    const empty: LibrarySourceTree = {
      list: () => [],
      read: (file) => {
        throw new Error(`the archive holds no ${file}`);
      },
    };

    const { printed, unprintable } = await printLibraryModules(
      newestDataFolder(installDir),
      [target.moduleId],
      empty,
    );

    expect(unprintable).toEqual([]);
    expect(printed).toHaveLength(1);
    expect(printed[0]?.from).toBe("pinned");
    expect(printed[0]?.reason).toContain(`${target.moduleId.replace(/\./g, "/")}.lua`);
    expect(printed[0]?.contents).toBe(
      repoPrinted.find(({ module }) => module === target.moduleId)?.contents as string,
    );
  });
});
