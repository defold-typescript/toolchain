import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { LIBRARY_DATA_DIR } from "./package-root";
import { type PrintedLibraryModule, printLibraryModules } from "./print-library";
import type { LibrarySourceTree } from "./source-tree";
import { readAuthoredTargets } from "./sync-authored-types";
import { readLualsTargets } from "./sync-luals-types";
import { readScriptApiTargets } from "./sync-script-api-types";

const CLI_SRC = path.resolve(import.meta.dir, "..");

// Printing every served module outruns Bun's 5s default.
const PRINT_TIMEOUT_MS = 120_000;

describe("the published CLI's bundle", () => {
  test(
    "loads nothing from library-types and bundles no curated page map",
    async () => {
      const build = await Bun.build({
        entrypoints: [path.join(CLI_SRC, "bin.ts"), path.join(CLI_SRC, "index.ts")],
        target: "node",
        format: "esm",
        packages: "external",
      });
      expect(build.success).toBe(true);
      const code = (await Promise.all(build.outputs.map((output) => output.text()))).join("\n");

      expect(code).not.toContain("@defold-typescript/library-types");
      expect(code).not.toContain('"spine.gui"');
    },
    PRINT_TIMEOUT_MS,
  );
});

describe("library data prints every served module", () => {
  const moduleIds = [
    ...readLualsTargets(LIBRARY_DATA_DIR),
    ...readScriptApiTargets(LIBRARY_DATA_DIR),
    ...readAuthoredTargets(LIBRARY_DATA_DIR),
  ].map(({ moduleId }) => moduleId);
  let repoPrinted: PrintedLibraryModule[] = [];

  beforeAll(async () => {
    repoPrinted = (await printLibraryModules(LIBRARY_DATA_DIR, moduleIds, null)).printed;
  }, PRINT_TIMEOUT_MS);

  test("prints every module with no archive", () => {
    expect(repoPrinted.map(({ module }) => module).sort()).toEqual([...moduleIds].sort());
  });

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
      LIBRARY_DATA_DIR,
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
