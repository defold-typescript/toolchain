import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type DirectoryWall,
  directoryWallTsconfig,
  groupSourceScriptKindsByDirectory,
  groupSourceScriptKindsBySubtree,
  materializedSurfaceKinds,
  nearestWall,
  planSourceDirectoryWalls,
  type ResolvedDirectoryWall,
  resolveActivePinnedSurface,
  resolveSourceWalls,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";
import { MATERIALIZED_ROOT } from "./materialize";
import type { ScriptKind } from "./script-kind";

// The kinds every materialized surface writes today. Named here so a test that
// means "the surface holds the runtime trio" reads as that, not as a list.
const RUNTIME_KINDS: readonly string[] = ["script", "gui-script", "render-script"];

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

function seedSurface(surface: string, kinds: readonly string[]): void {
  const kindsDir = path.join(cwd, MATERIALIZED_ROOT, surface, "kinds");
  mkdirSync(kindsDir, { recursive: true });
  for (const kind of kinds) {
    writeFileSync(path.join(kindsDir, `${kind}.d.ts`), "export {};\n");
  }
}

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

  test("a factory-less helper module is ignored", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/util.ts", "export const add = (a: number, b: number) => a + b;");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(new Map());
  });

  test("a component plus helper directory groups by only the component kind", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/ui/hud-util.ts", "export const add = (a: number, b: number) => a + b;");
    expect(groupSourceScriptKindsByDirectory(cwd)).toEqual(
      new Map<string, Set<ScriptKind>>([["src/ui", new Set(["gui-script"])]]),
    );
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

describe("groupSourceScriptKindsBySubtree", () => {
  test("folds each directory's kinds into every ancestor, stopping before '.'", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");
    touch("src/logic/b.ts", "export default defineScript({});");
    expect(groupSourceScriptKindsBySubtree(cwd)).toEqual(
      new Map<string, Set<ScriptKind>>([
        ["src/gui/hud", new Set(["gui-script"])],
        ["src/gui", new Set(["gui-script"])],
        ["src", new Set(["gui-script", "script"])],
        ["src/logic", new Set(["script"])],
      ]),
    );
  });

  test("'.' keeps only its own direct sources, never a descendant's", () => {
    writeTsconfig(["**/*.ts"]);
    touch("main.ts", "export default defineScript({});");
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    expect(groupSourceScriptKindsBySubtree(cwd).get(".")).toEqual(new Set(["script"]));
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

  test("a helper-only source tree yields no descriptors", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/util.ts", "export const add = (a: number, b: number) => a + b;");
    expect(planSourceDirectoryWalls(cwd)).toEqual([]);
  });

  test("an editor-script-only directory yields an editor-script descriptor", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/editor/menu.ts", "export default defineEditorScript({});");
    expect(planSourceDirectoryWalls(cwd)).toEqual([
      {
        dir: "src",
        kind: "editor-script",
        typesEntrypoint: "@defold-typescript/types/editor-script",
      },
      {
        dir: "src/editor",
        kind: "editor-script",
        typesEntrypoint: "@defold-typescript/types/editor-script",
      },
    ] satisfies DirectoryWall[]);
  });

  test("a directory mixing an editor script with a runtime script yields no wall", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/tools/menu.ts", "export default defineEditorScript({});");
    touch("src/tools/logic.ts", "export default defineScript({});");
    expect(planSourceDirectoryWalls(cwd)).toEqual([]);
  });

  test("an editor directory beside a gui-script directory yields both walls but no shared ancestor", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/editor/menu.ts", "export default defineEditorScript({});");
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    expect(planSourceDirectoryWalls(cwd)).toEqual([
      {
        dir: "src/editor",
        kind: "editor-script",
        typesEntrypoint: "@defold-typescript/types/editor-script",
      },
      {
        dir: "src/ui",
        kind: "gui-script",
        typesEntrypoint: "@defold-typescript/types/gui-script",
      },
    ] satisfies DirectoryWall[]);
  });

  test("a directory holding no direct sources is eligible when its whole subtree is one kind", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");
    touch("src/gui/menu/b.ts", "export default defineGuiScript({});");
    expect(planSourceDirectoryWalls(cwd).map((w) => [w.dir, w.kind])).toEqual([
      ["src", "gui-script"],
      ["src/gui", "gui-script"],
      ["src/gui/hud", "gui-script"],
      ["src/gui/menu", "gui-script"],
    ]);
  });

  test("an ancestor whose subtree mixes kinds yields only its single-kind leaves", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/x/ui/a.ts", "export default defineGuiScript({});");
    touch("src/x/logic/b.ts", "export default defineScript({});");
    expect(planSourceDirectoryWalls(cwd).map((w) => [w.dir, w.kind])).toEqual([
      ["src/x/logic", "script"],
      ["src/x/ui", "gui-script"],
    ]);
  });

  test("roll-up stops before '.', so a single-kind project yields src but never a root wall", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/a/one.ts", "export default defineScript({});");
    touch("src/b/two.ts", "export default defineScript({});");
    expect(planSourceDirectoryWalls(cwd).map((w) => w.dir)).toEqual(["src", "src/a", "src/b"]);
  });

  test("a root-level source still yields a '.' descriptor from its own direct kind", () => {
    writeTsconfig(["**/*.ts"]);
    touch("main.ts", "export default defineScript({});");
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    expect(planSourceDirectoryWalls(cwd).map((w) => [w.dir, w.kind])).toEqual([
      [".", "script"],
      ["src", "gui-script"],
      ["src/ui", "gui-script"],
    ]);
  });

  test("an editor-script-only subtree rolls up into ancestor descriptors", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/editor/tools/menu.ts", "export default defineEditorScript({});");
    expect(planSourceDirectoryWalls(cwd).map((w) => [w.dir, w.kind])).toEqual([
      ["src", "editor-script"],
      ["src/editor", "editor-script"],
      ["src/editor/tools", "editor-script"],
    ]);
  });

  test("a helper-only subtree neither walls itself nor blocks its ancestor's roll-up", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");
    touch("src/gui/shared/util.ts", "export const add = (a: number, b: number) => a + b;");
    expect(planSourceDirectoryWalls(cwd).map((w) => w.dir)).toEqual([
      "src",
      "src/gui",
      "src/gui/hud",
    ]);
  });

  test("a wall's kind comes from the directory's TypeScript source, not its co-located Defold component", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/ui/hud.ts", "export default defineScript({});");
    touch("src/ui/hud.gui_script");
    expect(planSourceDirectoryWalls(cwd)).toEqual([
      {
        dir: "src",
        kind: "script",
        typesEntrypoint: "@defold-typescript/types/script",
      },
      {
        dir: "src/ui",
        kind: "script",
        typesEntrypoint: "@defold-typescript/types/script",
      },
    ] satisfies DirectoryWall[]);
  });
});

describe("nearestWall", () => {
  const declared = [
    wall("src/gui", "gui-script", "@defold-typescript/types/gui-script"),
    wall("src/gui/hud", "script", "@defold-typescript/types/script"),
  ];

  test("picks the longest declared prefix over an enclosing one", () => {
    expect(nearestWall("src/gui/hud/a.ts", declared)?.dir).toBe("src/gui/hud");
  });

  test("falls back to the enclosing wall when no nearer one is declared", () => {
    expect(nearestWall("src/gui/menu/b.ts", declared)?.dir).toBe("src/gui");
  });

  test("a directory equal to a declared wall resolves to itself", () => {
    expect(nearestWall("src/gui/hud", declared)?.dir).toBe("src/gui/hud");
  });

  test("a sibling outside every walled subtree resolves to null", () => {
    expect(nearestWall("src/other/a.ts", declared)).toBe(null);
  });

  test("a sibling sharing a name prefix is not treated as enclosed", () => {
    expect(nearestWall("src/guix/a.ts", declared)).toBe(null);
  });
});

describe("resolveSourceWalls", () => {
  test("reports declared and inherited provenance and omits ungoverned source dirs", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");
    touch("src/gui/menu/deep/b.ts", "export default defineGuiScript({});");
    touch("src/other/c.ts", "export default defineScript({});");

    expect(resolveSourceWalls(cwd, ["src/gui", "src/gui/hud"])).toEqual([
      {
        dir: "src/gui/hud",
        kind: "gui-script",
        typesEntrypoint: "@defold-typescript/types/gui-script",
        declaredIn: "src/gui/hud",
        origin: "declared",
      },
      {
        dir: "src/gui/menu/deep",
        kind: "gui-script",
        typesEntrypoint: "@defold-typescript/types/gui-script",
        declaredIn: "src/gui",
        origin: "inherited",
      },
    ] satisfies ResolvedDirectoryWall[]);
  });

  test("a directory holding sources of its own is declared, its descendants inherited", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/x/logic.ts", "export default defineScript({});");
    touch("src/x/deep/more.ts", "export default defineScript({});");

    expect(resolveSourceWalls(cwd, ["src/x"]).map((r) => [r.dir, r.declaredIn, r.origin])).toEqual([
      ["src/x", "src/x", "declared"],
      ["src/x/deep", "src/x", "inherited"],
    ]);
  });

  test("a declared dir that is no longer eligible governs nothing", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch("src/mix/a.ts", "export default defineScript({});");
    touch("src/mix/b.ts", "export default defineGuiScript({});");

    expect(resolveSourceWalls(cwd, ["src/mix"])).toEqual([]);
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

  test("a pinned nested wall points typeRoots at the materialized root and types at the pinned per-kind subpath", () => {
    expect(
      directoryWallTsconfig(
        wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
        "1.9.8",
        [],
        RUNTIME_KINDS,
      ),
    ).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: [`../../${MATERIALIZED_ROOT}`],
        types: ["1.9.8/gui-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("a pinned depth-1 wall uses one less '../' for the typeRoots path", () => {
    expect(
      directoryWallTsconfig(
        wall("render", "render-script", "@defold-typescript/types/render-script"),
        "1.9.8",
        [],
        RUNTIME_KINDS,
      ),
    ).toEqual({
      extends: "../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: [`../${MATERIALIZED_ROOT}`],
        types: ["1.9.8/render-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("a declared nested wall is excluded from its ancestor's program", () => {
    expect(
      directoryWallTsconfig(wall("src/x", "script", "@defold-typescript/types/script"), null, [
        "src/x/ui",
      ]).exclude,
    ).toEqual(["ui/**"]);
  });

  test("several nested walls are excluded, sorted, each relative to the ancestor", () => {
    expect(
      directoryWallTsconfig(wall("src", "script", "@defold-typescript/types/script"), null, [
        "src/ui/hud",
        "src/logic",
      ]).exclude,
    ).toEqual(["logic/**", "ui/hud/**"]);
  });

  test("no nested wall keeps the empty exclude", () => {
    expect(
      directoryWallTsconfig(wall("src/x", "script", "@defold-typescript/types/script")).exclude,
    ).toEqual([]);
  });

  test("an editor-script wall keeps the installed entrypoint when the surface wrote no such kind", () => {
    expect(
      directoryWallTsconfig(
        wall("src/editor", "editor-script", "@defold-typescript/types/editor-script"),
        "1.9.8",
        [],
        RUNTIME_KINDS,
      ),
    ).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: null,
        types: ["@defold-typescript/types/editor-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("an editor-script wall points at the pinned surface once that surface wrote the kind", () => {
    expect(
      directoryWallTsconfig(
        wall("src/editor", "editor-script", "@defold-typescript/types/editor-script"),
        "1.9.8",
        [],
        [...RUNTIME_KINDS, "editor-script"],
      ),
    ).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: [`../../${MATERIALIZED_ROOT}`],
        types: ["1.9.8/editor-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
  });

  test("a wall keeps the installed entrypoint for a kind the surface omitted", () => {
    expect(
      directoryWallTsconfig(
        wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
        "1.9.8",
        [],
        ["script", "editor-script"],
      ).compilerOptions,
    ).toEqual({
      composite: true,
      typeRoots: null,
      types: ["@defold-typescript/types/gui-script"],
    });
  });

  test("a null pinned surface keeps the installed-package form", () => {
    expect(
      directoryWallTsconfig(
        wall("src/ui", "gui-script", "@defold-typescript/types/gui-script"),
        null,
      ),
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

  test("an editor-script wall names the editor entrypoint and leaves its subtree out of the root program", () => {
    touch("tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] }));
    touch("src/editor/menu.ts", "export default defineEditorScript({});");
    const walls = [wall("src/editor", "editor-script", "@defold-typescript/types/editor-script")];
    expect(writeDirectoryWallTsconfigs(cwd, walls)).toEqual(["src/editor/tsconfig.json"]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/editor/tsconfig.json"), "utf8"))).toEqual(
      directoryWallTsconfig(walls[0] as DirectoryWall),
    );
    expect(
      (
        JSON.parse(readFileSync(path.join(cwd, "src/editor/tsconfig.json"), "utf8")) as {
          compilerOptions: { types: string[] };
        }
      ).compilerOptions.types,
    ).toEqual(["@defold-typescript/types/editor-script"]);

    wireWallReferences(cwd, walls);
    expect(JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"))).toEqual({
      include: ["src/**/*.ts"],
      references: [{ path: "src/editor" }],
      exclude: ["src/editor"],
      files: [],
    });
  });

  test("an ancestor wall excludes its declared descendants so they are not in its program", () => {
    writeDirectoryWallTsconfigs(cwd, [
      wall("src/x", "script", "@defold-typescript/types/script"),
      wall("src/x/ui", "gui-script", "@defold-typescript/types/gui-script"),
    ]);
    const read = (rel: string): { exclude: string[] } =>
      JSON.parse(readFileSync(path.join(cwd, rel), "utf8"));
    expect(read("src/x/tsconfig.json").exclude).toEqual(["ui/**"]);
    expect(read("src/x/ui/tsconfig.json").exclude).toEqual([]);
  });

  test("only the nearest descendant is excluded when walls nest two deep", () => {
    writeDirectoryWallTsconfigs(cwd, [
      wall("src/x", "script", "@defold-typescript/types/script"),
      wall("src/x/ui", "gui-script", "@defold-typescript/types/gui-script"),
      wall("src/x/ui/deep", "script", "@defold-typescript/types/script"),
    ]);
    const read = (rel: string): { exclude: string[] } =>
      JSON.parse(readFileSync(path.join(cwd, rel), "utf8"));
    expect(read("src/x/tsconfig.json").exclude).toEqual(["ui/**"]);
    expect(read("src/x/ui/tsconfig.json").exclude).toEqual(["deep/**"]);
  });

  test("dropping a nested wall rewrites the ancestor back to an empty exclude", () => {
    const ancestor = wall("src/x", "script", "@defold-typescript/types/script");
    writeDirectoryWallTsconfigs(cwd, [
      ancestor,
      wall("src/x/ui", "gui-script", "@defold-typescript/types/gui-script"),
    ]);

    expect(writeDirectoryWallTsconfigs(cwd, [ancestor])).toEqual(["src/x/tsconfig.json"]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/x/tsconfig.json"), "utf8")).exclude).toEqual(
      [],
    );
  });

  test("a pinned-surface wall writes the per-kind typeRoots/types and skips when unchanged", () => {
    seedSurface("1.9.8", RUNTIME_KINDS);
    const walls = [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")];
    expect(writeDirectoryWallTsconfigs(cwd, walls, "1.9.8")).toEqual(["src/ui/tsconfig.json"]);
    const target = path.join(cwd, "src/ui/tsconfig.json");
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(
      directoryWallTsconfig(walls[0] as DirectoryWall, "1.9.8", [], RUNTIME_KINDS),
    );

    const before = statSync(target).mtimeMs;
    expect(writeDirectoryWallTsconfigs(cwd, walls, "1.9.8")).toEqual([]);
    expect(statSync(target).mtimeMs).toBe(before);
  });

  test("switching a wall from installed to pinned form rewrites it", () => {
    seedSurface("1.9.8", RUNTIME_KINDS);
    const walls = [wall("src/ui", "gui-script", "@defold-typescript/types/gui-script")];
    writeDirectoryWallTsconfigs(cwd, walls);
    expect(writeDirectoryWallTsconfigs(cwd, walls, "1.9.8")).toEqual(["src/ui/tsconfig.json"]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/ui/tsconfig.json"), "utf8"))).toEqual(
      directoryWallTsconfig(walls[0] as DirectoryWall, "1.9.8", [], RUNTIME_KINDS),
    );
  });

  test("an editor-script wall goes pinned only once the surface has written that kind", () => {
    const walls = [wall("src/editor", "editor-script", "@defold-typescript/types/editor-script")];
    const target = path.join(cwd, "src/editor/tsconfig.json");
    const types = (): string[] =>
      (JSON.parse(readFileSync(target, "utf8")) as { compilerOptions: { types: string[] } })
        .compilerOptions.types;

    seedSurface("1.9.8", RUNTIME_KINDS);
    writeDirectoryWallTsconfigs(cwd, walls, "1.9.8");
    expect(types()).toEqual(["@defold-typescript/types/editor-script"]);

    seedSurface("1.9.8", [...RUNTIME_KINDS, "editor-script"]);
    expect(writeDirectoryWallTsconfigs(cwd, walls, "1.9.8")).toEqual(["src/editor/tsconfig.json"]);
    expect(types()).toEqual(["1.9.8/editor-script"]);
  });
});

describe("materializedSurfaceKinds", () => {
  test("reports the kinds the surface itself wrote", () => {
    seedSurface("1.9.8", [...RUNTIME_KINDS, "editor-script"]);
    expect(materializedSurfaceKinds(cwd, "1.9.8").sort()).toEqual(
      [...RUNTIME_KINDS, "editor-script"].sort(),
    );
  });

  test("a surface with no kinds directory, or none pinned at all, reports nothing", () => {
    mkdirSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8"), { recursive: true });
    expect(materializedSurfaceKinds(cwd, "1.9.8")).toEqual([]);
    expect(materializedSurfaceKinds(cwd, null)).toEqual([]);
  });

  test("a file that is not a wallable kind is not reported as one", () => {
    seedSurface("1.9.8", ["script"]);
    writeFileSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8", "kinds", "index.d.ts"), "");
    expect(materializedSurfaceKinds(cwd, "1.9.8")).toEqual(["script"]);
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

describe("resolveActivePinnedSurface", () => {
  test("returns the surface id when root tsconfig is repointed and kinds/ exists", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { typeRoots: [MATERIALIZED_ROOT], types: ["1.9.8"] },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8", "kinds"), { recursive: true });
    expect(resolveActivePinnedSurface(cwd)).toBe("1.9.8");
  });

  test("returns null for an installed project (no materialized root)", () => {
    writeTsconfig(["src/**/*.ts"]);
    expect(resolveActivePinnedSurface(cwd)).toBe(null);
  });

  test("returns null when typeRoots is anything but the materialized root", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { typeRoots: ["node_modules/@types"], types: ["1.9.8"] },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8", "kinds"), { recursive: true });
    expect(resolveActivePinnedSurface(cwd)).toBe(null);
  });

  test("returns null when no types entry has a kinds/ directory on disk", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { typeRoots: [MATERIALIZED_ROOT], types: ["1.9.8"] },
        include: ["src/**/*.ts"],
      }),
    );
    expect(resolveActivePinnedSurface(cwd)).toBe(null);
  });

  test("skips a coexisting 'extensions' types entry without kinds/", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          typeRoots: [MATERIALIZED_ROOT],
          types: ["extensions", "1.9.8"],
        },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8", "kinds"), { recursive: true });
    expect(resolveActivePinnedSurface(cwd)).toBe("1.9.8");
  });

  test("a pre-producer surface (no kinds/ dir) returns null so walls fall back to the installed entrypoint", () => {
    writeTsconfig(["src/**/*.ts"]);
    touch(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { typeRoots: [MATERIALIZED_ROOT], types: ["1.9.8"] },
        include: ["src/**/*.ts"],
      }),
    );
    mkdirSync(path.join(cwd, MATERIALIZED_ROOT, "1.9.8"), { recursive: true });
    expect(resolveActivePinnedSurface(cwd)).toBe(null);
  });

  test("a missing root tsconfig returns null", () => {
    expect(resolveActivePinnedSurface(cwd)).toBe(null);
  });
});
