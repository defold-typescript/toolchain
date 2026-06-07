import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type DirectoryWall,
  directoryWallTsconfig,
  groupSourceScriptKindsByDirectory,
  planDirectoryWalls,
  planSourceDirectoryWalls,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";
import type { ScriptKind } from "./script-kind";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-directory-walls-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function writeTsconfig(include: string[]): void {
  touch("tsconfig.json", JSON.stringify({ include }));
}

describe("planDirectoryWalls", () => {
  test("turns each single-kind directory into a narrowing descriptor, sorted by dir", () => {
    touch("ui/hud.gui_script");
    touch("render/cam.render_script");
    expect(planDirectoryWalls(cwd)).toEqual([
      {
        dir: "render",
        kind: "render-script",
        typesEntrypoint: "@defold-typescript/types/render-script",
      },
      {
        dir: "ui",
        kind: "gui-script",
        typesEntrypoint: "@defold-typescript/types/gui-script",
      },
    ] satisfies DirectoryWall[]);
  });

  test("a root-level single-kind component yields a '.' descriptor", () => {
    touch("main.script");
    expect(planDirectoryWalls(cwd)).toEqual([
      {
        dir: ".",
        kind: "script",
        typesEntrypoint: "@defold-typescript/types/script",
      },
    ]);
  });

  test("a mixed-kind directory produces no descriptor", () => {
    touch("a/x.script");
    touch("a/y.gui_script");
    expect(planDirectoryWalls(cwd)).toEqual([]);
  });

  test("a component-free tree yields no descriptors", () => {
    touch("readme.txt");
    expect(planDirectoryWalls(cwd)).toEqual([]);
  });
});

describe("groupSourceScriptKindsByDirectory", () => {
  test("buckets each source's factory-detected kind by its immediate directory", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(
      new Map<string, Set<ScriptKind>>([
        ["src/ui", new Set(["gui-script"])],
        ["src/render", new Set(["render-script"])],
      ]),
    );
  });

  test("a root-level source is bucketed under the key '.'", () => {
    writeTsconfig(["**/*.ts"]);
    touch("main.ts", "export default defineScript({});");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(new Map([[".", new Set(["script"])]]));
  });

  test("a factory-less helper module classifies as 'script'", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/util.ts", "export const add = (a: number, b: number) => a + b;");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(new Map([["src", new Set(["script"])]]));
  });

  test("a directory holding two kinds maps to a set containing both", () => {
    writeTsconfig(["**/*.ts"]);
    touch("a/x.ts", "export default defineScript({});");
    touch("a/y.ts", "export default defineGuiScript({});");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(
      new Map([["a", new Set(["script", "gui-script"])]]),
    );
  });

  test("excludes generated artifacts and node_modules/.defold-types/build segments", () => {
    writeTsconfig(["**/*.ts", "**/*.ts.script"]);
    touch("src/keep.ts", "export default defineScript({});");
    touch("src/main.ts.script");
    touch("node_modules/dep/x.ts", "export default defineScript({});");
    touch(".defold-types/defold-1.12.4/y.ts", "export default defineScript({});");
    touch("build/default/z.ts", "export default defineScript({});");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(new Map([["src", new Set(["script"])]]));
  });
});

describe("planSourceDirectoryWalls", () => {
  test("turns each single-kind source directory into a narrowing descriptor, sorted by dir", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
    expect(planSourceDirectoryWalls(cwd)).toEqual([
      {
        dir: "src/render",
        kind: "render-script",
        typesEntrypoint: "@defold-typescript/types/render-script",
      },
      {
        dir: "src/ui",
        kind: "gui-script",
        typesEntrypoint: "@defold-typescript/types/gui-script",
      },
    ] satisfies DirectoryWall[]);
  });

  test("a mixed-kind source directory produces no descriptor", () => {
    writeTsconfig(["**/*.ts"]);
    touch("a/x.ts", "export default defineScript({});");
    touch("a/y.ts", "export default defineGuiScript({});");
    expect(planSourceDirectoryWalls(cwd)).toEqual([]);
  });

  test("a source-free tree yields no descriptors", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/.gitkeep");
    expect(planSourceDirectoryWalls(cwd)).toEqual([]);
  });
});

function wall(dir: string, kind: ScriptKind, typesEntrypoint: string): DirectoryWall {
  return { dir, kind, typesEntrypoint };
}

describe("directoryWallTsconfig", () => {
  test("a nested gui-script wall extends up to the root tsconfig and narrows types", () => {
    expect(
      directoryWallTsconfig(wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")),
    ).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: null,
        types: ["@defold-typescript/types/gui-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("a depth-1 render-script wall extends one level up", () => {
    expect(
      directoryWallTsconfig(
        wall("render", "render-script", "@defold-typescript/types/render-script"),
      ),
    ).toEqual({
      extends: "../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: null,
        types: ["@defold-typescript/types/render-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });
});

describe("writeDirectoryWallTsconfigs", () => {
  test("writes a tsconfig per wall and returns the rel paths sorted", () => {
    const walls = [
      wall("src/render", "render-script", "@defold-typescript/types/render-script"),
      wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
    ];
    expect(writeDirectoryWallTsconfigs(cwd, walls)).toEqual([
      "src/render/tsconfig.json",
      "src/ui/tsconfig.json",
    ]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/ui/tsconfig.json"), "utf8"))).toEqual(
      directoryWallTsconfig(walls[1] as DirectoryWall),
    );
  });

  test("skips a '.' wall so the root tsconfig is never overwritten", () => {
    touch("tsconfig.json", JSON.stringify({ include: ["**/*.ts"] }));
    expect(
      writeDirectoryWallTsconfigs(cwd, [wall(".", "script", "@defold-typescript/types/script")]),
    ).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      include: ["**/*.ts"],
    });
  });

  test("does not rewrite a wall tsconfig already set to the same entrypoint", () => {
    const walls = [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")];
    writeDirectoryWallTsconfigs(cwd, walls);
    const target = path.join(cwd, "src/ui/tsconfig.json");
    const before = statSync(target).mtimeMs;
    expect(writeDirectoryWallTsconfigs(cwd, walls)).toEqual([]);
    expect(statSync(target).mtimeMs).toBe(before);
  });

  test("merges into an existing child tsconfig, preserving other keys", () => {
    touch(
      "src/ui/tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, include: ["*.ts"] }),
    );
    writeDirectoryWallTsconfigs(cwd, [
      wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
    ]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/ui/tsconfig.json"), "utf8"))).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        strict: true,
        composite: true,
        typeRoots: null,
        types: ["@defold-typescript/types/gui-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("writes nothing for an empty wall list", () => {
    expect(writeDirectoryWallTsconfigs(cwd, [])).toEqual([]);
  });
});

describe("wireWallReferences", () => {
  test("rewrites root references and merges wall dirs into exclude", () => {
    touch(
      "tsconfig.json",
      JSON.stringify({ compilerOptions: { strict: true }, exclude: ["node_modules"] }),
    );

    wireWallReferences(cwd, [
      wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
      wall("src/render", "render-script", "@defold-typescript/types/render-script"),
    ]);

    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      compilerOptions: { strict: true },
      exclude: ["node_modules", "src/render", "src/ui"],
      files: [],
      references: [{ path: "src/render" }, { path: "src/ui" }],
    });
  });

  test("does not set root files when a non-wall source remains root-owned", () => {
    touch("tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    touch("src/shared/util.ts", "export const n = 1;");

    wireWallReferences(cwd, [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")]);

    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      include: ["src/**/*.ts"],
      exclude: ["src/ui"],
      references: [{ path: "src/ui" }],
    });
  });

  test("is idempotent when the root tsconfig is already wired", () => {
    touch("tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    const walls = [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")];

    wireWallReferences(cwd, walls);
    const before = statSync(path.join(cwd, "tsconfig.json")).mtimeMs;
    wireWallReferences(cwd, walls);

    expect(statSync(path.join(cwd, "tsconfig.json")).mtimeMs).toBe(before);
  });

  test("prunes removed wall references and excludes while preserving unrelated excludes", () => {
    touch(
      "tsconfig.json",
      JSON.stringify({
        exclude: ["node_modules", "src/render", "src/ui"],
        references: [{ path: "src/render" }, { path: "src/ui" }],
      }),
    );

    wireWallReferences(cwd, [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")]);

    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      exclude: ["node_modules", "src/ui"],
      files: [],
      references: [{ path: "src/ui" }],
    });
  });

  test("zero walls removes managed graph keys and preserves unrelated fields", () => {
    touch(
      "tsconfig.json",
      JSON.stringify({ include: ["src/**/*.ts"], references: [{ path: "src/ui" }] }),
    );

    wireWallReferences(cwd, []);

    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      include: ["src/**/*.ts"],
    });
  });
});
