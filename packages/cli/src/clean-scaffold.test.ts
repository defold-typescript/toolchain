import { describe, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { DEBUG_LAUNCHER_REL, DEBUG_LAUNCHER_SOURCE } from "./debug-launcher";
import { runInit } from "./init";
import { COLOCATED_TEST_REFERENCE } from "./test-folder";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const TYPES_PKG = path.join(REPO_ROOT, "packages", "types");
const BIN_DIR = path.join(REPO_ROOT, "node_modules", ".bin");
const TSC_TIMEOUT_MS = 120_000;
const TEST_TSCONFIG = "src/test/tsconfig.json";

function linkTypes(cwd: string): void {
  const scope = path.join(cwd, "node_modules", "@defold-typescript");
  mkdirSync(scope, { recursive: true });
  symlinkSync(TYPES_PKG, path.join(scope, "types"), "dir");
}

// Links each scaffolded devDependency this repo resolves by its real path, the
// way an isolated install lays out a direct dependency, so the package's own
// dependencies (`@types/node` beside `bun-types`) resolve from where it sits. A
// name the repo cannot resolve (`lua-types`) is left out; `linkTypes` covers
// the `@defold-typescript/` scope.
function linkScaffoldedDevDeps(cwd: string): void {
  const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const repoRequire = createRequire(path.join(REPO_ROOT, "package.json"));
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    if (name.startsWith("@defold-typescript/")) continue;
    let manifest: string;
    try {
      manifest = repoRequire.resolve(`${name}/package.json`);
    } catch {
      continue;
    }
    const target = path.join(cwd, "node_modules", ...name.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    symlinkSync(realpathSync(path.dirname(manifest)), target, "dir");
  }
}

// A plain module and a `bun:test` file next to it that carries the documented
// header, so the root program type-checks it.
function writeColocatedTest(cwd: string): void {
  writeFileSync(
    path.join(cwd, "src", "score.ts"),
    ["export function clamp(n: number): number {", "  return n > 100 ? 100 : n;", "}", ""].join(
      "\n",
    ),
  );
  writeFileSync(
    path.join(cwd, "src", "score.test.ts"),
    [
      COLOCATED_TEST_REFERENCE,
      'import { expect, test } from "bun:test";',
      'import { clamp } from "./score";',
      "",
      'test("clamp caps the score", () => {',
      "  expect(clamp(150)).toBe(100);",
      "});",
      "",
    ].join("\n"),
  );
}

// Rewinds a fresh scaffold to what v0.65.0 wrote: `@types/bun` in place of
// `bun-types`, no `src/test/` pair, and no root `exclude`.
function rewindToV065Shape(cwd: string): void {
  const pkgPath = path.join(cwd, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    devDependencies: Record<string, string>;
  };
  delete pkg.devDependencies["bun-types"];
  pkg.devDependencies["@types/bun"] = "latest";
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  rmSync(path.join(cwd, "src", "test"), { recursive: true, force: true });
  const configPath = path.join(cwd, "tsconfig.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  delete config.exclude;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function errorLines(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line));
}

function writeBunTestFixtures(cwd: string): void {
  // The starter imports `@defold-typescript/types`, which would hand the test
  // program the Defold globals whatever its `types` says; without it they come
  // only through the root config.
  rmSync(path.join(cwd, "src", "main.ts"));
  writeFileSync(
    path.join(cwd, "src", "messages.d.ts"),
    "declare global {\n  type WaveSize = number;\n}\nexport {};\n",
  );
  writeFileSync(
    path.join(cwd, "src", "score.ts"),
    [
      "export function clamp(n: WaveSize): number {",
      '  msg.post(".", "score", { n });',
      "  return math.max(0, math.min(100, n));",
      "}",
      "",
    ].join("\n"),
  );
  mkdirSync(path.join(cwd, "src", "test"), { recursive: true });
  writeFileSync(
    path.join(cwd, "src", "test", "score.test.ts"),
    [
      'import { readFileSync } from "node:fs";',
      'import { expect, test } from "bun:test";',
      'import { clamp } from "../score";',
      "",
      'test("clamp caps the score", () => {',
      '  expect(typeof readFileSync).toBe("function");',
      '  expect(typeof Bun.version).toBe("string");',
      "  expect(clamp(150)).toBe(100);",
      "});",
      "",
    ].join("\n"),
  );
}

function editRootCompilerOptions(
  cwd: string,
  edit: (compilerOptions: Record<string, unknown>) => void,
): void {
  const file = path.join(cwd, "tsconfig.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as {
    compilerOptions: Record<string, unknown>;
  };
  edit(config.compilerOptions);
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

function setRootExclude(cwd: string, exclude: readonly string[]): void {
  const file = path.join(cwd, "tsconfig.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  config.exclude = exclude;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, cmd), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

// Runs the `defold-typescript:typecheck` task from the `mise.toml` the scaffold
// wrote, one command at a time, stopping at the first failure the way mise does.
// `bunx --package typescript` is swapped for the repo's installed bin so the run
// never reaches the registry.
function runTypecheckTask(cwd: string): { code: number; output: string } {
  const mise = Bun.TOML.parse(readFileSync(path.join(cwd, "mise.toml"), "utf8")) as {
    tasks: Record<string, { run: string | readonly string[] }>;
  };
  const task = mise.tasks["defold-typescript:typecheck"];
  expect(task).toBeDefined();
  const commands = typeof task?.run === "string" ? [task.run] : (task?.run ?? []);
  expect(commands.length).toBeGreaterThan(0);
  let result = { code: 0, output: "" };
  for (const command of commands) {
    const [bunx, packageFlag, pkg, bin = "", ...args] = command.trim().split(/\s+/);
    expect([bunx, packageFlag, pkg]).toEqual(["bunx", "--package", "typescript"]);
    result = run(bin, args, cwd);
    if (result.code !== 0) {
      break;
    }
  }
  return result;
}

describe("scaffolded project is clean out of the box", () => {
  test("tsc --noEmit passes on a freshly scaffolded project", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-tsc-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc reported errors on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a bare tsc type-checks the scaffold without writing JavaScript beside the sources", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bare-tsc-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);

      const { code, output } = run("tsc", ["-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`a bare tsc reported errors on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
      expect(existsSync(path.join(cwd, "src", "main.ts"))).toBe(true);
      expect(existsSync(path.join(cwd, "src", "main.js"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tsc --noEmit resolves Lua stdlib globals in scaffolded source", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-lua-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);
      writeFileSync(path.join(cwd, "src", "lua-global.ts"), "export const n = math.floor(1.5);\n");

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc could not resolve the Lua stdlib globals on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tsc --noEmit resolves the hsm imports through the types package exports", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-hsm-"));
    try {
      runInit({ cwd });
      linkTypes(cwd);
      writeFileSync(
        path.join(cwd, "src", "machine.ts"),
        [
          'import { defineMachine } from "@defold-typescript/types/hsm";',
          'import { type MessageEvent, messageEvents } from "@defold-typescript/types/hsm/defold";',
          "",
          'type DoorEvent = MessageEvent<"trigger_response"> | { type: "CLOSE" };',
          "",
          "export const doorMachine = defineMachine<{}, DoorEvent>()({",
          '  initial: "/closed",',
          "  states: {",
          '    closed: { on: { trigger_response: "/open" } },',
          '    open: { on: { CLOSE: "/closed" } },',
          "  },",
          "});",
          "",
          'export const doorEvents = messageEvents(["trigger_response"]);',
          "",
          "const broken = defineMachine<{}, DoorEvent>()({",
          '  initial: "/closed",',
          "  // @ts-expect-error an unknown target is an error on its property, so the import is not `any`",
          '  states: { closed: { on: { CLOSE: "/nowhere" } } },',
          "});",
          "broken.start({});",
          "",
        ].join("\n"),
      );

      const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
      if (code !== 0) {
        throw new Error(`tsc could not type the hsm imports on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test(
    "a Bun test importing a src module type-checks under the scaffolded test config",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-test-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeBunTestFixtures(cwd);

        const plain = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (plain.code !== 0) {
          throw new Error(`tsc reported errors on the scaffolded test config:\n${plain.output}`);
        }
        expect(plain.code).toBe(0);

        editRootCompilerOptions(cwd, (options) => {
          options.outDir = "out";
        });
        const withOutDir = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (withOutDir.code !== 0) {
          throw new Error(
            `tsc reported errors on the test config under a root outDir:\n${withOutDir.output}`,
          );
        }
        expect(withOutDir.code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "the test config follows a root repointed at a pinned surface",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-pinned-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeBunTestFixtures(cwd);
        const standIn = path.join(cwd, ".defold-types", "stand-in");
        mkdirSync(standIn, { recursive: true });
        writeFileSync(
          path.join(standIn, "index.d.ts"),
          '/// <reference types="@defold-typescript/types" />\ndeclare const pinnedSurfaceOnly: number;\n',
        );
        editRootCompilerOptions(cwd, (options) => {
          options.typeRoots = [".defold-types"];
          options.types = ["stand-in"];
        });
        appendFileSync(
          path.join(cwd, "src", "score.ts"),
          "export const pinned = pinnedSurfaceOnly;\n",
        );

        const { code, output } = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (code !== 0) {
          throw new Error(
            `tsc reported errors on the test config over a pinned surface:\n${output}`,
          );
        }
        expect(code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "an ill-typed test fails the test check under a ./src/test root exclude",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-dot-exclude-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        setRootExclude(cwd, ["./src/test"]);
        rmSync(path.join(cwd, "src", "test"), { recursive: true, force: true });
        runInit({ cwd, force: true });
        writeBunTestFixtures(cwd);
        writeFileSync(
          path.join(cwd, "src", "test", "broken.test.ts"),
          'export const n: number = "not a number";\n',
        );

        const { code, output } = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        expect(code).not.toBe(0);
        expect(output).toContain("broken.test.ts");
        expect(output).toContain("TS2322");
        expect(output).not.toContain("score.test.ts");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "the scaffolded typecheck task fails on a type error under src/test/ and on a missing test config",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-typecheck-task-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        const helper = path.join(cwd, "src", "test", "helper.ts");
        writeFileSync(helper, 'export const wrong: number = "x";\n');

        const illTyped = runTypecheckTask(cwd);
        expect(illTyped.code).not.toBe(0);
        expect(illTyped.output.replaceAll("\\", "/")).toContain("src/test/helper.ts");

        rmSync(helper);
        rmSync(path.join(cwd, TEST_TSCONFIG));
        const missingConfig = runTypecheckTask(cwd);
        expect(missingConfig.code).not.toBe(0);
        expect(missingConfig.output.replaceAll("\\", "/")).toContain(TEST_TSCONFIG);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "the root program never sees Bun's types",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-root-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);

        const { code, output } = run("tsc", ["-p", "tsconfig.json", "--listFilesOnly"], cwd);
        expect(code).toBe(0);
        expect(output).toContain("src/main.ts");
        expect(output).not.toContain("bun-types");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "the root program keeps Bun's globals out of game code",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-leak-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeColocatedTest(cwd);
        writeFileSync(
          path.join(cwd, "src", "leak.ts"),
          "export const argc = process.argv.length;\nexport const runtime = Bun.version;\n",
        );

        const root = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
        expect(root.code).not.toBe(0);
        expect(root.output).toContain("'process'");
        expect(root.output).toContain("'Bun'");
        expect(root.output).not.toContain("score.test.ts");
        const errors = errorLines(root.output);
        expect(errors.length).toBeGreaterThan(0);
        for (const line of errors) {
          expect(line).toContain("leak.ts");
        }

        const tests = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (tests.code !== 0) {
          throw new Error(`tsc reported errors on the scaffolded test config:\n${tests.output}`);
        }
        expect(tests.code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "a test next to its module type-checks under the root config with the documented header",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-colocated-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeColocatedTest(cwd);

        const { code, output } = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
        if (code !== 0) {
          throw new Error(`tsc reported errors on a test next to its module:\n${output}`);
        }
        expect(code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "a reconciled hand-made test config type-checks a Bun test importing JSON and game code",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-reconcile-"));
      try {
        runInit({ cwd });
        // The hand-made shape a project wrote before the scaffold had a test
        // config: no `resolveJsonModule`, no `plugins: []`.
        writeFileSync(
          path.join(cwd, TEST_TSCONFIG),
          `${JSON.stringify(
            {
              extends: "../../tsconfig.json",
              compilerOptions: { noEmit: true, outDir: null },
              include: ["**/*.ts", "../**/*.ts", "../../.defold-types/scene-addresses.d.ts"],
              exclude: [],
            },
            null,
            2,
          )}\n`,
        );
        runInit({ cwd, force: true });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeBunTestFixtures(cwd);
        writeFileSync(path.join(cwd, "src", "test", "waves.json"), '{ "max": 150 }\n');
        writeFileSync(
          path.join(cwd, "src", "test", "waves.test.ts"),
          [
            'import { expect, test } from "bun:test";',
            'import { clamp } from "../score";',
            'import waves from "./waves.json";',
            "",
            'test("the largest wave is capped", () => {',
            "  expect(clamp(waves.max)).toBe(100);",
            "});",
            "",
          ].join("\n"),
        );

        const tests = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (tests.code !== 0) {
          throw new Error(`tsc reported errors on the reconciled test config:\n${tests.output}`);
        }
        expect(tests.code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "upgrading a v0.65.0 project gives both test layouts a Bun package they resolve",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-upgrade-"));
      try {
        runInit({ cwd });
        rewindToV065Shape(cwd);
        runInit({ cwd, force: true });
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);
        writeColocatedTest(cwd);
        writeBunTestFixtures(cwd);

        const root = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
        if (root.code !== 0) {
          throw new Error(`tsc reported errors on the upgraded root config:\n${root.output}`);
        }
        expect(root.code).toBe(0);

        const tests = run("tsc", ["--noEmit", "-p", TEST_TSCONFIG], cwd);
        if (tests.code !== 0) {
          throw new Error(`tsc reported errors on the upgraded test config:\n${tests.output}`);
        }
        expect(tests.code).toBe(0);

        const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
          devDependencies: Record<string, string>;
        };
        expect(pkg.devDependencies["@types/bun"]).toBe("latest");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test(
    "the debug launcher type-checks with only the scaffolded dependencies",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-launcher-"));
      try {
        runInit({ cwd });
        const launcher = path.join(cwd, ...DEBUG_LAUNCHER_REL.split("/"));
        mkdirSync(path.dirname(launcher), { recursive: true });
        writeFileSync(launcher, DEBUG_LAUNCHER_SOURCE);
        linkTypes(cwd);
        linkScaffoldedDevDeps(cwd);

        // No `--types`: TypeScript 6 then loads no `@types` package, as an
        // editor's inferred project does. `--ignoreConfig` because TypeScript 6
        // refuses file arguments beside a `tsconfig.json` (TS5112).
        const { code, output } = run(
          "tsc",
          [
            "--ignoreConfig",
            "--noEmit",
            "--strict",
            "--target",
            "ES2022",
            "--module",
            "ESNext",
            "--moduleResolution",
            "Bundler",
            "--skipLibCheck",
            DEBUG_LAUNCHER_REL,
          ],
          cwd,
        );
        if (code !== 0) {
          throw new Error(`tsc reported errors on the debug launcher:\n${output}`);
        }
        expect(code).toBe(0);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    TSC_TIMEOUT_MS,
  );

  test("biome check passes on the whole scaffold, its own biome.json included", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-biome-"));
    try {
      runInit({ cwd });

      const { code, output } = run("biome", ["check", "--error-on-warnings", "."], cwd);
      if (code !== 0) {
        throw new Error(`biome reported violations on the scaffold:\n${output}`);
      }
      expect(code).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("the scaffold's Biome schema and pin match the Biome this repo runs", () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-biome-pin-"));
    try {
      runInit({ cwd });

      const biome = JSON.parse(readFileSync(path.join(cwd, "biome.json"), "utf8")) as {
        $schema: string;
      };
      const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as {
        devDependencies: Record<string, string>;
      };
      const installed = (
        JSON.parse(
          readFileSync(
            path.join(REPO_ROOT, "node_modules", "@biomejs", "biome", "package.json"),
            "utf8",
          ),
        ) as { version: string }
      ).version;

      const schemaVersion = /\/schemas\/([^/]+)\/schema\.json$/.exec(biome.$schema)?.[1];
      const pin = pkg.devDependencies["@biomejs/biome"];
      expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
      expect(schemaVersion).toBe(pin);
      expect(pin).toBe(installed);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
