import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
import { runInit } from "./init";
import { parseJsoncObject } from "./jsonc-file";
import { toPosixSeparators } from "./materialize";

const GUIDE = "node_modules/@defold-typescript/docs/guide/testing.md";
const TEST_CONFIG = "src/test/tsconfig.json";
const SCENE = "../../.defold-types/scene-addresses.d.ts";

// biome-ignore lint/suspicious/noTemplateCurlyInString: TypeScript's own config placeholder, written literally
const CONFIG_DIR = "${configDir}";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-test-config-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function write(rel: string, contents: string | object, root = cwd): void {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(
    full,
    typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`,
  );
}

function read(rel: string, root = cwd): string {
  return readFileSync(path.join(root, rel), "utf8");
}

interface TestConfig {
  extends?: string;
  compilerOptions?: Record<string, unknown>;
  include?: string[];
  exclude?: string[];
}

function testConfig(root = cwd): TestConfig {
  return parseJsoncObject(read(TEST_CONFIG, root), TEST_CONFIG) as TestConfig;
}

function rootConfig(): TestConfig {
  return parseJsoncObject(read("tsconfig.json"), "tsconfig.json") as TestConfig;
}

// A game project with one game file and one test, before `init` touches it.
function seedProject(root: Record<string, unknown>, at = cwd): void {
  write("game.project", "[project]\n", at);
  write("tsconfig.json", root, at);
  write("src/main.ts", "export const speed = 1;\n", at);
  write("src/test/main.test.ts", 'import { speed } from "../main";\nvoid speed;\n', at);
}

const STUDIO = {
  extends: "../../tsconfig.json",
  compilerOptions: { noEmit: true, outDir: null },
  include: ["**/*.ts", "../**/*.ts", SCENE],
  exclude: [],
};

function warningsFor(warnings: readonly string[], file: string): string[] {
  const matching = warnings.filter((warning) => warning.startsWith(`${file}:`));
  for (const warning of matching) {
    expect(warning.endsWith(GUIDE)).toBe(true);
  }
  return matching;
}

function selectedByTestConfig(): string[] {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.join(cwd, TEST_CONFIG),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
  );
  return (parsed?.fileNames ?? []).map((file) => toPosixSeparators(path.relative(cwd, file)));
}

describe("runInit reconciles an existing src/test/tsconfig.json", () => {
  test("a hand-made test config gains the missing managed settings and keeps its lists", () => {
    seedProject({ include: ["src/**/*.ts"], exclude: ["src/test"] });
    const includeText = JSON.stringify(STUDIO.include, null, 2).replace(/\n/g, "\n  ");
    write(TEST_CONFIG, STUDIO);
    write("src/test/env.d.ts", '/// <reference types="bun-types" />\n');

    const { warnings } = runInit({ cwd, force: true });

    const config = testConfig();
    expect(config.compilerOptions).toEqual({
      noEmit: true,
      outDir: null,
      resolveJsonModule: true,
      plugins: [],
    });
    expect(read(TEST_CONFIG)).toContain(`"include": ${includeText}`);
    const [warning, ...rest] = warningsFor(warnings, TEST_CONFIG);
    expect(rest).toEqual([]);
    expect(warning).toContain("resolveJsonModule");
    expect(warning).toContain("plugins");
    expect(warning).not.toContain("noEmit");
  });

  test("a managed setting set to another value stays and is named, an equal one is not", () => {
    seedProject({ include: ["src/**/*.ts"], exclude: ["src/test"] });
    write(TEST_CONFIG, {
      ...STUDIO,
      compilerOptions: { noEmit: true, outDir: null, resolveJsonModule: false, plugins: [] },
    });
    write("src/test/env.d.ts", '/// <reference types="bun-types" />\n');

    const { warnings } = runInit({ cwd, force: true });

    expect(testConfig().compilerOptions?.resolveJsonModule).toBe(false);
    const [warning, ...rest] = warningsFor(warnings, TEST_CONFIG);
    expect(rest).toEqual([]);
    expect(warning).toContain("resolveJsonModule");
    expect(warning).not.toContain("plugins");
    expect(warning).not.toContain("noEmit");
  });

  test("include and exclude that select other files are replaced and named before and after", () => {
    seedProject({ include: ["src/**/*.ts"], exclude: ["src/test"] });
    write(TEST_CONFIG, { ...STUDIO, include: ["*.ts"], exclude: ["fixtures"] });

    const { warnings } = runInit({ cwd, force: true });

    const after = ["**/*.ts", "../../src/**/*.ts", SCENE];
    expect(testConfig().include).toEqual(after);
    expect(testConfig().exclude).toEqual([]);
    const [warning] = warningsFor(warnings, TEST_CONFIG);
    expect(warning).toContain(JSON.stringify(["*.ts"]));
    expect(warning).toContain(JSON.stringify(after));
    expect(warning).toContain(JSON.stringify(["fixtures"]));
    expect(warning).toContain(JSON.stringify([]));
  });

  test("a bare config with no env.d.ts and no tests gets env.d.ts inside its selection", () => {
    write("game.project", "[project]\n");
    write("tsconfig.json", { include: ["src/**/*.ts"], exclude: ["src/test"] });
    write("src/main.ts", "export const speed = 1;\n");
    write(TEST_CONFIG, { extends: "../../tsconfig.json" });

    runInit({ cwd, force: true });

    expect(existsSync(path.join(cwd, "src", "test", "env.d.ts"))).toBe(true);
    expect(testConfig().include).toEqual(["**/*.ts", "../../src/**/*.ts", SCENE]);
    expect(testConfig().exclude).toEqual([]);
    expect(selectedByTestConfig()).toContain("src/test/env.d.ts");
  });

  test("a fresh test config and a stitched bare one carry the same settings", () => {
    const fresh = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-test-config-fresh-"));
    try {
      seedProject({ include: ["src/**/*.ts"] }, fresh);
      rmSync(path.join(fresh, "src", "test"), { recursive: true, force: true });
      runInit({ cwd: fresh, force: true });

      seedProject({ include: ["src/**/*.ts"] });
      write(TEST_CONFIG, { extends: "../../tsconfig.json" });
      runInit({ cwd, force: true });

      const expected = testConfig(fresh);
      const stitched = testConfig();
      expect(stitched.compilerOptions).toEqual(expected.compilerOptions as Record<string, unknown>);
      expect(stitched.include).toEqual(expected.include as string[]);
      expect(stitched.exclude).toEqual(expected.exclude as string[]);
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  test(`a ${CONFIG_DIR} root include is rebased as the root's folder`, () => {
    seedProject({ include: [`${CONFIG_DIR}/src/**/*.ts`] });
    rmSync(path.join(cwd, "src", "test"), { recursive: true, force: true });

    runInit({ cwd, force: true });

    const include = testConfig().include ?? [];
    expect(include).toContain("../../src/**/*.ts");
    expect(include.some((entry) => entry.includes("configDir"))).toBe(false);
  });

  test("types, typeRoots and paths stay and are named", () => {
    seedProject({ include: ["src/**/*.ts"], exclude: ["src/test"] });
    const own = {
      types: ["bun-types"],
      typeRoots: ["./types"],
      paths: { "@game/*": ["../*"] },
    };
    write(TEST_CONFIG, {
      ...STUDIO,
      compilerOptions: { ...STUDIO.compilerOptions, resolveJsonModule: true, plugins: [], ...own },
    });
    write("src/test/env.d.ts", '/// <reference types="bun-types" />\n');

    const { warnings } = runInit({ cwd, force: true });

    expect(testConfig().compilerOptions).toMatchObject(own);
    const [warning, ...rest] = warningsFor(warnings, TEST_CONFIG);
    expect(rest).toEqual([]);
    for (const name of ["types", "typeRoots", "paths"]) {
      expect(warning).toContain(name);
    }
    expect(warning).toContain("root config's game types");
  });

  test("a test config that does not extend the root is left byte for byte with one warning", () => {
    seedProject({ include: ["src/**/*.ts"] });
    const original = '{\n  "compilerOptions": { "strict": true },\n  "include": ["*.ts"]\n}\n';
    write(TEST_CONFIG, original);

    const { warnings } = runInit({ cwd, force: true });

    expect(read(TEST_CONFIG)).toBe(original);
    const [warning, ...rest] = warningsFor(warnings, TEST_CONFIG);
    expect(rest).toEqual([]);
    expect(warning).toContain("does not extend");
    expect(existsSync(path.join(cwd, "src", "test", "env.d.ts"))).toBe(true);
    expect(rootConfig().exclude).toContain("src/test");
  });

  test("the root exclude gains src/test when only the test config existed", () => {
    seedProject({ include: ["src/**/*.ts"] });
    write(TEST_CONFIG, {
      ...STUDIO,
      compilerOptions: { ...STUDIO.compilerOptions, resolveJsonModule: true, plugins: [] },
    });
    write("src/test/env.d.ts", '/// <reference types="bun-types" />\n');

    const { warnings } = runInit({ cwd, force: true });

    expect(rootConfig().exclude).toEqual(["src/test"]);
    const [warning, ...rest] = warningsFor(warnings, "tsconfig.json");
    expect(rest).toEqual([]);
    expect(warning).toContain("src/test");
  });

  test("a new project gets no warning for the root exclude", () => {
    write("game.project", "[project]\n");

    const { warnings } = runInit({ cwd, force: true });

    expect(rootConfig().exclude).toEqual(["src/test"]);
    expect(warningsFor(warnings, "tsconfig.json")).toEqual([]);
    expect(warningsFor(warnings, TEST_CONFIG)).toEqual([]);
  });

  test("a commented test config keeps its comment through a stitch", () => {
    seedProject({ include: ["src/**/*.ts"], exclude: ["src/test"] });
    const studio = JSON.stringify(STUDIO, null, 2);
    write(TEST_CONFIG, `// Bun tests for the game\n${studio}\n`);
    write("src/test/env.d.ts", '/// <reference types="bun-types" />\n');

    runInit({ cwd, force: true });

    const text = read(TEST_CONFIG);
    expect(text.startsWith("// Bun tests for the game\n{\n")).toBe(true);
    expect(testConfig().compilerOptions?.resolveJsonModule).toBe(true);
  });
});
