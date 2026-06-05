import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SCRIPT_HOOK_NAMES } from "@defold-typescript/types";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { runInit, SCAFFOLD_DEV_DEPS } from "./init";
import { MISE_TASKS_TOML } from "./mise-scaffold";

const CLI_VERSION = (
  JSON.parse(readFileSync(path.join(import.meta.dir, "..", "package.json"), "utf8")) as {
    version: string;
  }
).version;
const TYPES_SPEC = `^${CLI_VERSION}`;

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  writeFileSync(path.join(cwd, rel), contents);
}

describe("runInit (add-TS mode)", () => {
  test("writes src/main.ts, tsconfig.json, and package.json when game.project exists", () => {
    touch("game.project", "[project]\ntitle = test\n");

    const result = runInit({ cwd });

    expect(result.written.sort()).toEqual(
      [
        ".gitignore",
        ".vscode/defold-debug.ts",
        ".vscode/defold-typescript.code-snippets",
        ".vscode/extensions.json",
        ".vscode/launch.json",
        ".vscode/settings.json",
        "biome.json",
        "mise.toml",
        "package.json",
        "src/main.ts",
        "tsconfig.json",
      ].sort(),
    );
    expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
    expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(true);
    expect(existsSync(path.join(cwd, "package.json"))).toBe(true);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(true);
  });

  // The old "throws and writes nothing when game.project is missing" case
  // is superseded by new-project mode below; an empty tempdir now succeeds.

  test("refuses on existing tsconfig.json and writes nothing else", () => {
    touch("game.project", "[project]\n");
    touch("tsconfig.json", "{}\n");

    expect(() => runInit({ cwd })).toThrow(/tsconfig\.json/);
    expect(() => runInit({ cwd })).toThrow(/defold-typescript init/);
    expect(() => runInit({ cwd })).toThrow(/--force/);
    expect(() => runInit({ cwd })).not.toThrow(/not yet implemented/);

    expect(existsSync(path.join(cwd, "src"))).toBe(false);
    expect(existsSync(path.join(cwd, "package.json"))).toBe(false);
  });

  test("force overwrites a conflicting tsconfig.json with the scaffold config", () => {
    touch("game.project", "[project]\n");
    touch("tsconfig.json", "{}\n");

    const result = runInit({ cwd, force: true });

    expect(result.written.sort()).toEqual(
      [
        ".gitignore",
        ".vscode/defold-debug.ts",
        ".vscode/defold-typescript.code-snippets",
        ".vscode/extensions.json",
        ".vscode/launch.json",
        ".vscode/settings.json",
        "biome.json",
        "mise.toml",
        "package.json",
        "src/main.ts",
        "tsconfig.json",
      ].sort(),
    );
    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.types).toContain("@defold-typescript/types");
  });

  test("refuses on existing defold-typescript.config.* and lists the new config family", () => {
    touch("game.project", "[project]\n");
    touch("defold-typescript.config.ts", "");

    expect(() => runInit({ cwd })).toThrow(/defold-typescript\.config\.ts/);
    expect(() => runInit({ cwd })).toThrow(/defold-typescript init/);
  });

  test("merges devDependencies into an existing package.json without touching other keys", () => {
    touch("game.project", "[project]\n");
    const original = {
      name: "user-project",
      version: "1.2.3",
      scripts: { test: "echo hi" },
      devDependencies: { "some-other-dep": "^1.0.0" },
      keywords: ["defold"],
    };
    touch("package.json", `${JSON.stringify(original, null, 2)}\n`);

    runInit({ cwd });

    const merged = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(merged.name).toBe("user-project");
    expect(merged.version).toBe("1.2.3");
    expect(merged.scripts).toEqual({ test: "echo hi" });
    expect(merged.keywords).toEqual(["defold"]);
    expect(merged.devDependencies).toEqual({
      "some-other-dep": "^1.0.0",
      "@defold-typescript/types": TYPES_SPEC,
      "@defold-typescript/cli": TYPES_SPEC,
      "@biomejs/biome": "^2.2.0",
    });
  });

  test("pins @defold-typescript/types and the CLI to the published version and omits the transpiler", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(pkg.devDependencies["@defold-typescript/types"]).toBe(TYPES_SPEC);
    expect(pkg.devDependencies["@defold-typescript/types"]).not.toBe("workspace:*");
    expect(pkg.devDependencies["@defold-typescript/cli"]).toBe(TYPES_SPEC);
    expect(pkg.devDependencies["@defold-typescript/cli"]).not.toBe("workspace:*");
    expect(pkg.devDependencies["@defold-typescript/transpiler"]).toBeUndefined();
  });

  test("seeds the defold-version pin with current-stable in a fresh package.json", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(pkg["defold-typescript"]).toEqual({
      "defold-version": CURRENT_STABLE_DEFOLD_VERSION,
    });
  });

  test("augments an existing package.json with the pin without clobbering other keys", () => {
    touch("game.project", "[project]\n");
    const original = { name: "user-project", version: "1.2.3", keywords: ["defold"] };
    touch("package.json", `${JSON.stringify(original, null, 2)}\n`);

    runInit({ cwd });

    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(pkg.name).toBe("user-project");
    expect(pkg.keywords).toEqual(["defold"]);
    expect(pkg["defold-typescript"]).toEqual({
      "defold-version": CURRENT_STABLE_DEFOLD_VERSION,
    });
  });

  test("does not overwrite an existing defold-version pin", () => {
    touch("game.project", "[project]\n");
    const original = { name: "user-project", "defold-typescript": { "defold-version": "1.9.8" } };
    touch("package.json", `${JSON.stringify(original, null, 2)}\n`);

    runInit({ cwd });

    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(pkg["defold-typescript"]).toEqual({ "defold-version": "1.9.8" });
  });

  test("emitted tsconfig.json references @defold-typescript/types and main.ts uses vmath and msg", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.types).toContain("@defold-typescript/types");
    expect(tsconfig.compilerOptions.outDir).toBeUndefined();

    const main = readFileSync(path.join(cwd, "src", "main.ts"), "utf8");
    expect(main).toMatch(/vmath/);
    expect(main).toMatch(/msg/);
  });

  test("scaffolded .gitignore ignores generated Lua next to source", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^src\/\*\*\/\*\.ts\.script$/m);
    expect(gitignore).toMatch(/^src\/\*\*\/\*\.ts\.script\.map$/m);
  });

  test("appends ignore lines to an existing .gitignore without clobbering, idempotently", () => {
    touch("game.project", "[project]\n");
    touch(".gitignore", "node_modules\n*.log\n");

    runInit({ cwd });
    const afterFirst = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(afterFirst).toContain("node_modules");
    expect(afterFirst).toContain("*.log");
    expect(afterFirst).toMatch(/^src\/\*\*\/\*\.ts\.script$/m);
    expect(afterFirst).toMatch(/^src\/\*\*\/\*\.ts\.script\.map$/m);

    // A second run must not duplicate the ignore lines.
    const second = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-rerun-"));
    try {
      writeFileSync(path.join(second, "game.project"), "[project]\n");
      writeFileSync(path.join(second, ".gitignore"), afterFirst);
      runInit({ cwd: second });
      const afterSecond = readFileSync(path.join(second, ".gitignore"), "utf8");
      expect(afterSecond).toBe(afterFirst);
    } finally {
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe("runInit (repairs stale managed devDeps)", () => {
  function devDepsAfterInit(
    devDependencies: Record<string, string>,
    force = false,
  ): Record<string, string> {
    touch("game.project", "[project]\n");
    const original = { name: "user-project", version: "1.2.3", devDependencies };
    touch("package.json", `${JSON.stringify(original, null, 2)}\n`);
    runInit({ cwd, force });
    return JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")).devDependencies;
  }

  test("removes a stale transpiler workspace dep, leaving other deps and a concrete types pin", () => {
    const devDeps = devDepsAfterInit({
      "@defold-typescript/transpiler": "workspace:*",
      "@defold-typescript/types": "^0.2.0",
      "some-dep": "^1.0.0",
    });

    expect(devDeps["@defold-typescript/transpiler"]).toBeUndefined();
    expect(devDeps["@defold-typescript/types"]).toBe("^0.2.0");
    expect(devDeps["some-dep"]).toBe("^1.0.0");
  });

  test("rewrites a workspace:* types pin to the published CLI version", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/types": "workspace:*" });

    expect(devDeps["@defold-typescript/types"]).toBe(TYPES_SPEC);
    expect(devDeps["@defold-typescript/types"]).not.toBe("workspace:*");
  });

  test("leaves a concrete user-chosen types pin untouched", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/types": "0.1.0" });

    expect(devDeps["@defold-typescript/types"]).toBe("0.1.0");
  });

  test("--force rewrites a stale concrete types pin to the published CLI version", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/types": "^0.0.1" }, true);

    expect(devDeps["@defold-typescript/types"]).toBe(TYPES_SPEC);
  });

  test("--force still deletes a stale transpiler dep", () => {
    const devDeps = devDepsAfterInit(
      { "@defold-typescript/transpiler": "workspace:*", "@defold-typescript/types": "^0.0.1" },
      true,
    );

    expect(devDeps["@defold-typescript/transpiler"]).toBeUndefined();
  });

  test("rewrites a workspace:* CLI pin to the published CLI version", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/cli": "workspace:*" });

    expect(devDeps["@defold-typescript/cli"]).toBe(TYPES_SPEC);
    expect(devDeps["@defold-typescript/cli"]).not.toBe("workspace:*");
  });

  test("leaves a concrete user-chosen CLI pin untouched", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/cli": "0.1.0" });

    expect(devDeps["@defold-typescript/cli"]).toBe("0.1.0");
  });

  test("--force rewrites a stale concrete CLI pin to the published CLI version", () => {
    const devDeps = devDepsAfterInit({ "@defold-typescript/cli": "^0.0.1" }, true);

    expect(devDeps["@defold-typescript/cli"]).toBe(TYPES_SPEC);
  });

  test("--force does not overwrite a user's third-party pin or other deps", () => {
    const devDeps = devDepsAfterInit(
      {
        "@defold-typescript/types": "^0.0.1",
        "@biomejs/biome": "^2.0.0",
        "some-dep": "^1.0.0",
      },
      true,
    );

    expect(devDeps["@biomejs/biome"]).toBe("^2.0.0");
    expect(devDeps["some-dep"]).toBe("^1.0.0");
  });
});

describe("scaffolded deps satisfy the managed mise tasks", () => {
  test("the package providing the defold-typescript bin is a scaffolded devDependency", () => {
    // The managed `defold-typescript:build`/`:watch` tasks run
    // `bunx --no-install defold-typescript`, which only resolves a locally
    // installed bin. That bin ships in `@defold-typescript/cli`, so the
    // scaffold must always install it — guard against the dep ever dropping.
    expect(MISE_TASKS_TOML).toContain("bunx --no-install defold-typescript");
    expect(SCAFFOLD_DEV_DEPS).toHaveProperty("@defold-typescript/cli");
  });
});

describe("runInit (new-project mode)", () => {
  const NEW_PROJECT_FILES = [
    "game.project",
    "main/main.collection",
    "main/main.script",
    "src/main.ts",
    "tsconfig.json",
    "package.json",
    ".gitignore",
    "biome.json",
    ".vscode/extensions.json",
    ".vscode/settings.json",
    ".vscode/defold-typescript.code-snippets",
    ".vscode/launch.json",
    ".vscode/defold-debug.ts",
    "mise.toml",
  ];

  test("missing target directory: creates the directory and writes the scaffold files", () => {
    const target = path.join(cwd, "fresh-project");
    expect(existsSync(target)).toBe(false);

    const result = runInit({ cwd: target });

    expect(result.written.sort()).toEqual([...NEW_PROJECT_FILES].sort());
    for (const rel of NEW_PROJECT_FILES) {
      expect(existsSync(path.join(target, rel))).toBe(true);
    }
  });

  test("empty existing directory: writes the same scaffold files in place", () => {
    const result = runInit({ cwd });

    expect(result.written.sort()).toEqual([...NEW_PROJECT_FILES].sort());
    for (const rel of NEW_PROJECT_FILES) {
      expect(existsSync(path.join(cwd, rel))).toBe(true);
    }
  });

  test("emitted game.project has [project], title, and main_collection", () => {
    runInit({ cwd });
    const content = readFileSync(path.join(cwd, "game.project"), "utf8");
    expect(content).toMatch(/\[project\]/);
    expect(content).toMatch(new RegExp(`title\\s*=\\s*${path.basename(cwd)}`));
    expect(content).toMatch(/main_collection\s*=\s*\/main\/main\.collectionc/);
  });

  test("emitted main/main.collection has name and component reference", () => {
    runInit({ cwd });
    const content = readFileSync(path.join(cwd, "main", "main.collection"), "utf8");
    expect(content).toMatch(/name:\s*"main"/);
    expect(content).toMatch(/component:.*\/main\/main\.script/);
  });

  test("emitted main/main.script defines the four lifecycle hooks", () => {
    runInit({ cwd });
    const content = readFileSync(path.join(cwd, "main", "main.script"), "utf8");
    expect(content).toMatch(/function init\b/);
    expect(content).toMatch(/function update\b/);
    expect(content).toMatch(/function on_message\b/);
    expect(content).toMatch(/function final\b/);
  });

  test("scaffolds mise.toml with the three managed tasks", () => {
    runInit({ cwd });
    const content = readFileSync(path.join(cwd, "mise.toml"), "utf8");
    expect(content).toContain('[tasks."defold-typescript:build"]');
    expect(content).toContain('[tasks."defold-typescript:watch"]');
    expect(content).toContain('[tasks."defold-typescript:upgrade"]');
  });

  test("merges into an existing user mise.toml additively, preserving user content", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");
    writeFileSync(path.join(cwd, "mise.toml"), '[tools]\nbun = "1.3"\n');

    runInit({ cwd, force: true });

    const content = readFileSync(path.join(cwd, "mise.toml"), "utf8");
    expect(content).toContain('[tools]\nbun = "1.3"');
    expect(content).toContain('[tasks."defold-typescript:build"]');
  });

  test("non-empty directory without game.project: refuses with --force message, writes nothing", () => {
    writeFileSync(path.join(cwd, "README.md"), "hello\n");
    const before = readdirSync(cwd).sort();

    expect(() => runInit({ cwd })).toThrow(/--force/);
    expect(() => runInit({ cwd })).not.toThrow(/not yet implemented/);

    expect(readdirSync(cwd).sort()).toEqual(before);
    expect(existsSync(path.join(cwd, "game.project"))).toBe(false);
    expect(existsSync(path.join(cwd, "src"))).toBe(false);
    expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "main"))).toBe(false);
  });

  test("force synthesizes into a non-empty directory, leaving stray files untouched", () => {
    writeFileSync(path.join(cwd, "README.md"), "hello\n");

    const result = runInit({ cwd, force: true });

    expect(result.written.sort()).toEqual([...NEW_PROJECT_FILES].sort());
    for (const rel of NEW_PROJECT_FILES) {
      expect(existsSync(path.join(cwd, rel))).toBe(true);
    }
    expect(readFileSync(path.join(cwd, "README.md"), "utf8")).toBe("hello\n");
  });

  test("shared-helper proof: TS surface matches add-TS mode byte-for-byte", () => {
    // Add-TS mode in a sibling tempdir.
    const addTsDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-addts-"));
    try {
      writeFileSync(path.join(addTsDir, "game.project"), "[project]\n");
      mkdirSync(path.join(addTsDir, "main"), { recursive: true });
      writeFileSync(path.join(addTsDir, "main", "main.script"), "");
      runInit({ cwd: addTsDir });
      runInit({ cwd });

      const addMain = readFileSync(path.join(addTsDir, "src", "main.ts"), "utf8");
      const newMain = readFileSync(path.join(cwd, "src", "main.ts"), "utf8");
      expect(newMain).toBe(addMain);

      const addTsconfig = JSON.parse(readFileSync(path.join(addTsDir, "tsconfig.json"), "utf8"));
      const newTsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
      expect(newTsconfig).toEqual(addTsconfig);

      const addPkg = JSON.parse(readFileSync(path.join(addTsDir, "package.json"), "utf8"));
      const newPkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
      // basename(cwd) differs between the two tempdirs; compare everything else.
      delete addPkg.name;
      delete newPkg.name;
      expect(newPkg).toEqual(addPkg);
    } finally {
      rmSync(addTsDir, { recursive: true, force: true });
    }
  });
});

describe("runInit (script-kind auto-selection)", () => {
  function tsconfigTypes(dir: string): string[] {
    return JSON.parse(readFileSync(path.join(dir, "tsconfig.json"), "utf8")).compilerOptions.types;
  }

  test("new-project synthesis narrows to the per-kind script entrypoint", () => {
    const result = runInit({ cwd });

    expect(tsconfigTypes(cwd)).toEqual(["@defold-typescript/types/script"]);
    expect(result.scriptKind).toBe("script");
  });

  test("add-TS mode in a *.gui_script project narrows to the gui-script entrypoint", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, "ui"), { recursive: true });
    writeFileSync(path.join(cwd, "ui", "hud.gui_script"), "");

    const result = runInit({ cwd });

    expect(tsconfigTypes(cwd)).toEqual(["@defold-typescript/types/gui-script"]);
    expect(result.scriptKind).toBe("gui-script");
  });

  test("add-TS mode in a mixed-kind project keeps the full-surface default", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, "main"), { recursive: true });
    writeFileSync(path.join(cwd, "main", "main.script"), "");
    mkdirSync(path.join(cwd, "ui"), { recursive: true });
    writeFileSync(path.join(cwd, "ui", "hud.gui_script"), "");

    const result = runInit({ cwd });

    expect(tsconfigTypes(cwd)).toEqual(["@defold-typescript/types"]);
    expect(result.scriptKind).toBeNull();
  });

  test("add-TS mode in a kindless project keeps the full-surface default", () => {
    touch("game.project", "[project]\n");

    const result = runInit({ cwd });

    expect(tsconfigTypes(cwd)).toEqual(["@defold-typescript/types"]);
    expect(result.scriptKind).toBeNull();
  });
});

describe("runInit (biome scaffold)", () => {
  test("new-project mode writes a biome.json with a linter block and lists it", () => {
    const result = runInit({ cwd });

    expect(result.written).toContain("biome.json");
    const biome = JSON.parse(readFileSync(path.join(cwd, "biome.json"), "utf8"));
    expect(biome.linter).toBeDefined();
  });

  test("add-TS mode writes a biome.json and lists it", () => {
    touch("game.project", "[project]\n");

    const result = runInit({ cwd });

    expect(result.written).toContain("biome.json");
    expect(existsSync(path.join(cwd, "biome.json"))).toBe(true);
  });

  test("both modes add @biomejs/biome to package.json devDependencies", () => {
    touch("game.project", "[project]\n");
    runInit({ cwd });
    const addTsPkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(addTsPkg.devDependencies["@biomejs/biome"]).toBeDefined();

    const fresh = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-biome-"));
    try {
      runInit({ cwd: fresh });
      const newPkg = JSON.parse(readFileSync(path.join(fresh, "package.json"), "utf8"));
      expect(newPkg.devDependencies["@biomejs/biome"]).toBeDefined();
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test("an existing biome.json is left untouched and is not re-listed", () => {
    touch("game.project", "[project]\n");
    const sentinel = '{ "sentinel": true }\n';
    touch("biome.json", sentinel);

    const result = runInit({ cwd });

    expect(readFileSync(path.join(cwd, "biome.json"), "utf8")).toBe(sentinel);
    expect(result.written).not.toContain("biome.json");
  });
});

describe("runInit (.vscode editor config)", () => {
  function readJson(rel: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path.join(cwd, rel), "utf8"));
  }

  test("new-project mode recommends sumneko + Defold Kit and marks Luau LSP unwanted", () => {
    runInit({ cwd });

    const ext = readJson(".vscode/extensions.json");
    expect(ext.recommendations).toContain("sumneko.lua");
    expect(ext.recommendations).toContain("astronachos.defold");
    expect(ext.recommendations).toContain("tomblind.local-lua-debugger-vscode");
    expect(ext.unwantedRecommendations).toContain("johnnymorganz.luau-lsp");
  });

  test("new-project mode ignores the generated Lua dir in settings.json", () => {
    runInit({ cwd });

    const settings = readJson(".vscode/settings.json");
    expect(settings["Lua.workspace.ignoreDir"]).toContain("src");
  });

  test("add-TS mode also writes both .vscode files", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    expect(existsSync(path.join(cwd, ".vscode", "extensions.json"))).toBe(true);
    expect(existsSync(path.join(cwd, ".vscode", "settings.json"))).toBe(true);
  });

  test("merges into an existing extensions.json, preserving user entries and keys", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    touch(
      ".vscode/extensions.json",
      `${JSON.stringify(
        { recommendations: ["dbaeumer.vscode-eslint"], someOtherKey: 42 },
        null,
        2,
      )}\n`,
    );

    const result = runInit({ cwd });

    const ext = readJson(".vscode/extensions.json");
    expect(ext.recommendations).toContain("dbaeumer.vscode-eslint");
    expect(ext.recommendations).toContain("sumneko.lua");
    expect(ext.recommendations).toContain("astronachos.defold");
    expect(ext.someOtherKey).toBe(42);
    const recs = ext.recommendations as string[];
    expect(recs.length).toBe(new Set(recs).size);
    expect(result.written).not.toContain(".vscode/extensions.json");
  });

  test("merges into a JSONC settings.json with comments, keeping unrelated settings", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    touch(".vscode/settings.json", '{\n  // user preference\n  "editor.tabSize": 4,\n}\n');

    expect(() => runInit({ cwd })).not.toThrow();

    const settings = readJson(".vscode/settings.json");
    expect(settings["editor.tabSize"]).toBe(4);
    expect(settings["Lua.workspace.ignoreDir"]).toContain("src");
  });

  test("does not add a second src entry when ignoreDir already lists it", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    touch(
      ".vscode/settings.json",
      `${JSON.stringify({ "Lua.workspace.ignoreDir": ["src", "build"] }, null, 2)}\n`,
    );

    runInit({ cwd });

    const dirs = readJson(".vscode/settings.json")["Lua.workspace.ignoreDir"] as string[];
    expect(dirs.filter((d) => d === "src").length).toBe(1);
    expect(dirs).toContain("build");
  });

  test("leaves an unparseable extensions.json untouched", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    const garbage = "this is not json at all {{{\n";
    touch(".vscode/extensions.json", garbage);

    runInit({ cwd });

    expect(readFileSync(path.join(cwd, ".vscode", "extensions.json"), "utf8")).toBe(garbage);
  });
});

describe("runInit (.vscode debugger launch scaffold)", () => {
  function readJson(rel: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path.join(cwd, rel), "utf8"));
  }

  test("add-TS mode recommends the Local Lua Debugger extension", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const ext = readJson(".vscode/extensions.json");
    expect(ext.recommendations).toContain("tomblind.local-lua-debugger-vscode");
  });

  test("both modes scaffold launch.json and defold-debug.ts", () => {
    touch("game.project", "[project]\n");
    const result = runInit({ cwd });

    expect(result.written).toContain(".vscode/launch.json");
    expect(result.written).toContain(".vscode/defold-debug.ts");
    expect(existsSync(path.join(cwd, ".vscode", "launch.json"))).toBe(true);
    expect(existsSync(path.join(cwd, ".vscode", "defold-debug.ts"))).toBe(true);

    const fresh = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-debug-"));
    try {
      const freshResult = runInit({ cwd: fresh });
      expect(freshResult.written).toContain(".vscode/launch.json");
      expect(freshResult.written).toContain(".vscode/defold-debug.ts");
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test("merges the debug config into an existing launch.json, keeping user configs", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    const userConfig = { name: "My Launcher", type: "node", request: "launch" };
    touch(
      ".vscode/launch.json",
      `${JSON.stringify({ version: "0.2.0", configurations: [userConfig] }, null, 2)}\n`,
    );

    const result = runInit({ cwd });

    const launch = readJson(".vscode/launch.json");
    const configs = launch.configurations as Array<Record<string, unknown>>;
    const names = configs.map((c) => c.name);
    expect(names).toContain("My Launcher");
    expect(names).toContain("Defold: Debug (TypeScript)");
    expect(result.written).not.toContain(".vscode/launch.json");
  });

  test("leaves an existing defold-debug.ts untouched", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    const sentinel = "// user launcher\n";
    touch(".vscode/defold-debug.ts", sentinel);

    const result = runInit({ cwd });

    expect(readFileSync(path.join(cwd, ".vscode", "defold-debug.ts"), "utf8")).toBe(sentinel);
    expect(result.written).not.toContain(".vscode/defold-debug.ts");
  });

  test("no-shell gate: the launch config runs bun and no debug artifact references bash or .sh", () => {
    runInit({ cwd });

    const launch = readJson(".vscode/launch.json");
    const configs = launch.configurations as Array<Record<string, unknown>>;
    const luaLocal = configs.find((c) => c.type === "lua-local");
    expect(luaLocal).toBeDefined();
    expect((luaLocal?.program as Record<string, unknown>).command).toBe("bun");

    const launchText = readFileSync(path.join(cwd, ".vscode", "launch.json"), "utf8");
    const launcherText = readFileSync(path.join(cwd, ".vscode", "defold-debug.ts"), "utf8");
    for (const text of [launchText, launcherText]) {
      expect(text).not.toContain("bash");
      expect(text).not.toMatch(/\.sh\b/);
    }
  });
});

describe("runInit (.vscode script snippets)", () => {
  const SNIPPETS_REL = ".vscode/defold-typescript.code-snippets";

  interface Snippet {
    scope: string;
    prefix: string;
    body: string[];
    description?: string;
  }

  function readSnippets(): Record<string, Snippet> {
    return JSON.parse(readFileSync(path.join(cwd, SNIPPETS_REL), "utf8"));
  }

  function snippetOf(snippets: Record<string, Snippet>, key: string): Snippet {
    const snippet = snippets[key];
    if (!snippet) {
      throw new Error(`missing snippet: ${key}`);
    }
    return snippet;
  }

  const EXPECTED_KEYS = [
    "Defold script (inferred self)",
    "Defold script (typed self)",
    "Defold GUI script (inferred self)",
    "Defold GUI script (typed self)",
    "Defold render script (inferred self)",
    "Defold render script (typed self)",
  ];

  test("new-project mode writes a snippet file with exactly the six expected keys", () => {
    runInit({ cwd });

    expect(existsSync(path.join(cwd, SNIPPETS_REL))).toBe(true);
    const snippets = readSnippets();
    expect(Object.keys(snippets).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  test("add-TS mode also writes the snippet file", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    expect(existsSync(path.join(cwd, SNIPPETS_REL))).toBe(true);
    expect(Object.keys(readSnippets()).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  test("inline snippets call the bare factory with no <Self> argument", () => {
    runInit({ cwd });
    const snippets = readSnippets();

    const inline = (key: string) => snippetOf(snippets, key).body.join("\n");
    expect(inline("Defold script (inferred self)")).toContain("defineScript(");
    expect(inline("Defold GUI script (inferred self)")).toContain("defineGuiScript(");
    expect(inline("Defold render script (inferred self)")).toContain("defineRenderScript(");
    for (const key of [
      "Defold script (inferred self)",
      "Defold GUI script (inferred self)",
      "Defold render script (inferred self)",
    ]) {
      expect(inline(key)).not.toContain("<Self>");
    }
  });

  test("typed snippets declare a Self type and parameterize the factory with it", () => {
    runInit({ cwd });
    const snippets = readSnippets();

    const typed = (key: string) => snippetOf(snippets, key).body.join("\n");
    expect(typed("Defold script (typed self)")).toContain("type Self");
    expect(typed("Defold script (typed self)")).toContain("defineScript<Self>");
    expect(typed("Defold GUI script (typed self)")).toContain("defineGuiScript<Self>");
    expect(typed("Defold render script (typed self)")).toContain("defineRenderScript<Self>");
  });

  test("render snippets keep on_message but omit on_input", () => {
    runInit({ cwd });
    const snippets = readSnippets();

    for (const key of [
      "Defold render script (inferred self)",
      "Defold render script (typed self)",
    ]) {
      const body = snippetOf(snippets, key).body.join("\n");
      expect(body).toContain("on_message");
      expect(body).not.toContain("on_input");
    }
  });

  test("every snippet imports its factory on the first line and scopes to typescript", () => {
    runInit({ cwd });
    const snippets = readSnippets();

    const factoryFor: Record<string, string> = {
      "Defold script (inferred self)": "defineScript",
      "Defold script (typed self)": "defineScript",
      "Defold GUI script (inferred self)": "defineGuiScript",
      "Defold GUI script (typed self)": "defineGuiScript",
      "Defold render script (inferred self)": "defineRenderScript",
      "Defold render script (typed self)": "defineRenderScript",
    };

    for (const [key, factory] of Object.entries(factoryFor)) {
      const snippet = snippetOf(snippets, key);
      expect(snippet.scope).toBe("typescript");
      expect(snippet.body[0]).toBe(`import { ${factory} } from "@defold-typescript/types";`);
    }
  });

  test("merges into an existing snippet file, preserving user keys and never clobbering ours", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    const userSnippet = {
      scope: "typescript",
      prefix: "my-thing",
      body: ["// user snippet"],
    };
    touch(
      SNIPPETS_REL,
      `${JSON.stringify(
        {
          "My snippet": userSnippet,
          "Defold script (inferred self)": userSnippet,
        },
        null,
        2,
      )}\n`,
    );

    const result = runInit({ cwd });

    const snippets = readSnippets();
    expect(snippets["My snippet"]).toEqual(userSnippet);
    expect(snippets["Defold script (inferred self)"]).toEqual(userSnippet);
    expect(Object.keys(snippets).sort()).toEqual([...EXPECTED_KEYS, "My snippet"].sort());
    expect(result.written).not.toContain(SNIPPETS_REL);
  });

  test("leaves an unparseable snippet file untouched", () => {
    touch("game.project", "[project]\n");
    mkdirSync(path.join(cwd, ".vscode"), { recursive: true });
    const garbage = "definitely not json {{{\n";
    touch(SNIPPETS_REL, garbage);

    runInit({ cwd });

    expect(readFileSync(path.join(cwd, SNIPPETS_REL), "utf8")).toBe(garbage);
  });

  test("script and gui snippets emit every lifecycle hook; render omits only on_input", () => {
    runInit({ cwd });
    const snippets = readSnippets();

    for (const key of [
      "Defold script (inferred self)",
      "Defold script (typed self)",
      "Defold GUI script (inferred self)",
      "Defold GUI script (typed self)",
    ]) {
      const body = snippetOf(snippets, key).body.join("\n");
      for (const hook of SCRIPT_HOOK_NAMES) {
        expect(body).toContain(`${hook}(`);
      }
    }

    for (const key of [
      "Defold render script (inferred self)",
      "Defold render script (typed self)",
    ]) {
      const body = snippetOf(snippets, key).body.join("\n");
      for (const hook of SCRIPT_HOOK_NAMES) {
        if (hook === "on_input") {
          expect(body).not.toContain("on_input");
        } else {
          expect(body).toContain(`${hook}(`);
        }
      }
    }
  });

  test("every emitted hook is preceded by a learn-more comment", () => {
    runInit({ cwd });
    const snippets = readSnippets();
    const hookNames: readonly string[] = SCRIPT_HOOK_NAMES;

    for (const key of EXPECTED_KEYS) {
      const lines = snippetOf(snippets, key).body;
      lines.forEach((line, i) => {
        const name = line.match(/^ {2}(\w+)\(/)?.[1];
        if (name && hookNames.includes(name)) {
          expect(lines[i - 1]?.trim().startsWith("//")).toBe(true);
        }
      });
    }
  });
});
