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
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";
import { runInit } from "./init";

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
      [".gitignore", "biome.json", "package.json", "src/main.ts", "tsconfig.json"].sort(),
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
      [".gitignore", "biome.json", "package.json", "src/main.ts", "tsconfig.json"].sort(),
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
      "@biomejs/biome": "^2.2.0",
    });
  });

  test("pins @defold-typescript/types to the published CLI version and omits the transpiler", () => {
    touch("game.project", "[project]\n");

    runInit({ cwd });

    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    expect(pkg.devDependencies["@defold-typescript/types"]).toBe(TYPES_SPEC);
    expect(pkg.devDependencies["@defold-typescript/types"]).not.toBe("workspace:*");
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
    expect(gitignore).toMatch(/^src\/\*\*\/\*\.lua$/m);
    expect(gitignore).toMatch(/^src\/\*\*\/\*\.lua\.map$/m);
  });

  test("appends ignore lines to an existing .gitignore without clobbering, idempotently", () => {
    touch("game.project", "[project]\n");
    touch(".gitignore", "node_modules\n*.log\n");

    runInit({ cwd });
    const afterFirst = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(afterFirst).toContain("node_modules");
    expect(afterFirst).toContain("*.log");
    expect(afterFirst).toMatch(/^src\/\*\*\/\*\.lua$/m);
    expect(afterFirst).toMatch(/^src\/\*\*\/\*\.lua\.map$/m);

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
