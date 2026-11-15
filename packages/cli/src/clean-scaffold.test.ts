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
import { runInit } from "./init";

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

// Linking the real path lets `bun-types` resolve as `@types/bun`'s own
// dependency, the way an isolated install lays it out.
function linkBunTypes(cwd: string): void {
  const typesBun = path.dirname(
    createRequire(path.join(REPO_ROOT, "package.json")).resolve("@types/bun/package.json"),
  );
  const scope = path.join(cwd, "node_modules", "@types");
  mkdirSync(scope, { recursive: true });
  symlinkSync(realpathSync(typesBun), path.join(scope, "bun"), "dir");
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

function run(cmd: string, args: string[], cwd: string): { code: number; output: string } {
  const proc = Bun.spawnSync([path.join(BIN_DIR, cmd), ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
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
        linkBunTypes(cwd);
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
        linkBunTypes(cwd);
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
    "the root program never sees Bun's types",
    () => {
      const cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-clean-bun-root-"));
      try {
        runInit({ cwd });
        linkTypes(cwd);
        linkBunTypes(cwd);

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
        linkBunTypes(cwd);
        writeFileSync(
          path.join(cwd, "src", "leak.ts"),
          "export const argc = process.argv.length;\n",
        );

        const root = run("tsc", ["--noEmit", "-p", "tsconfig.json"], cwd);
        expect(root.code).not.toBe(0);
        expect(root.output).toContain("'process'");

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
