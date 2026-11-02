import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { FIXTURE_DATA_DIR } from "../library-data-fixture";
import { printLibraryModules } from "./print-library";
import type { LibrarySourceTree } from "./source-tree";

const CLI_SRC = path.resolve(import.meta.dir, "..");

// Bundling the CLI outruns Bun's 5s default.
const BUILD_TIMEOUT_MS = 120_000;

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
    BUILD_TIMEOUT_MS,
  );
});

describe("printLibraryModules", () => {
  test("prints the pinned sources, with the reason, when the archive holds no files", async () => {
    const moduleId = "glow-kit.glow";
    const empty: LibrarySourceTree = {
      list: () => [],
      read: (file) => {
        throw new Error(`the archive holds no ${file}`);
      },
    };
    const pinned = await printLibraryModules(FIXTURE_DATA_DIR, [moduleId], null);

    const { printed, unprintable } = await printLibraryModules(FIXTURE_DATA_DIR, [moduleId], empty);

    expect(unprintable).toEqual([]);
    expect(printed).toHaveLength(1);
    expect(printed[0]?.from).toBe("pinned");
    expect(printed[0]?.reason).toContain("glow-kit/glow.lua");
    expect(printed[0]?.contents).toBe(pinned.printed[0]?.contents as string);
  });
});
