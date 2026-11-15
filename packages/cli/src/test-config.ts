import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { readEffectiveTsconfig } from "@defold-typescript/transpiler";
import * as ts from "typescript";
import { readTextFile } from "./build-output";
import { editJsoncFile, editJsoncText, readJsoncObject } from "./jsonc-file";
import { isAbsolutePath, toPosixSeparators } from "./materialize";
import { BUN_TYPES_PACKAGE, namesTestFolder, TEST_FOLDER_REL } from "./test-folder";
import { isJsonObject, writeJson } from "./vscode-json";

export const TEST_TSCONFIG_REL = `${TEST_FOLDER_REL}/tsconfig.json`;
export const TEST_ENV_REL = `${TEST_FOLDER_REL}/env.d.ts`;
export const TESTING_GUIDE = "node_modules/@defold-typescript/docs/guide/testing.md";
const TEST_ENV_CONTENT = `/// <reference types="${BUN_TYPES_PACKAGE}" />\n`;
const TEST_FOLDER_TO_ROOT = "../".repeat(TEST_FOLDER_REL.split("/").length);
const ROOT_FROM_TEST_FOLDER = `${TEST_FOLDER_TO_ROOT}tsconfig.json`;

// The test config extends the root rather than naming its own `types`, so it
// follows whatever surface `resolve` pins there, and Bun's types come in only
// through `env.d.ts`, which the root `exclude` keeps out of the game program.
// It also leaves out the editor plugin, whose build diagnostics mean nothing
// for files `build` never compiles. A fresh config and a reconciled one both
// take their settings from here, so the two cannot drift apart.
export const TEST_CONFIG_COMPILER_OPTIONS: Readonly<Record<string, unknown>> = {
  noEmit: true,
  outDir: null,
  resolveJsonModule: true,
  plugins: [],
};

// Settings that replace the root's game types rather than add to them.
const TYPE_SURFACE_KEYS = ["types", "typeRoots", "paths"] as const;

/** One warning line per file: what changed or was left, then where to read about it. */
export function fileWarning(rel: string, parts: readonly string[]): string {
  return `${rel}: ${parts.join("; ")}; see ${TESTING_GUIDE}`;
}

function rebaseOntoProjectRoot(pattern: string): string {
  const normalized = toPosixSeparators(pattern).replace(/^(\.\/)+/, "");
  return isAbsolutePath(normalized) ? normalized : `${TEST_FOLDER_TO_ROOT}${normalized}`;
}

// The lists a test config needs: its own folder plus the root's `include`, and
// the root's other `exclude` entries, since inheriting the root's would exclude
// the config's own folder. The dropped entry is that folder in any spelling
// (`./src/test`, `src/test/`). The root lists come project-relative, never as
// written: a `${configDir}` entry inside the test config would name `src/test/`.
function derivedLists(
  rootInclude: readonly string[],
  rootExclude: readonly string[],
): { include: string[]; exclude: string[] } {
  return {
    include: ["**/*.ts", ...rootInclude.map(rebaseOntoProjectRoot)],
    exclude: rootExclude.filter((entry) => !namesTestFolder(entry)).map(rebaseOntoProjectRoot),
  };
}

function writeTestEnv(cwd: string): boolean {
  const envPath = path.join(cwd, ...TEST_ENV_REL.split("/"));
  if (existsSync(envPath)) {
    return false;
  }
  mkdirSync(path.dirname(envPath), { recursive: true });
  writeFileSync(envPath, TEST_ENV_CONTENT);
  return true;
}

/** Writes the test pair for a project that has no test config; returns what it wrote. */
export function writeTestTsconfig(
  cwd: string,
  rootInclude: readonly string[],
  rootExclude: readonly string[],
): string[] {
  const configPath = path.join(cwd, ...TEST_TSCONFIG_REL.split("/"));
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeJson(configPath, {
    extends: ROOT_FROM_TEST_FOLDER,
    compilerOptions: { ...TEST_CONFIG_COMPILER_OPTIONS },
    ...derivedLists(rootInclude, rootExclude),
  });
  return writeTestEnv(cwd) ? [TEST_TSCONFIG_REL, TEST_ENV_REL] : [TEST_TSCONFIG_REL];
}

function extendsRoot(cwd: string, configPath: string, value: unknown): boolean {
  const root = path.resolve(cwd, "tsconfig.json");
  const entries = Array.isArray(value) ? value : [value];
  return entries.some((entry) => {
    if (typeof entry !== "string") {
      return false;
    }
    const resolved = path.resolve(path.dirname(configPath), entry);
    return resolved === root || `${resolved}.json` === root;
  });
}

function sameFile(a: string, b: string): boolean {
  return toPosixSeparators(path.resolve(a)) === toPosixSeparators(path.resolve(b));
}

// The files TypeScript's parser selects for the test config with `text` in its
// place, read off disk now, or `undefined` when that text does not parse.
function selection(configPath: string, text: string): string[] | undefined {
  try {
    return readEffectiveTsconfig(
      configPath,
      (filePath) => (sameFile(filePath, configPath) ? text : readTextFile(filePath)),
      ts.sys.readDirectory,
    ).fileNames.sort();
  } catch {
    return undefined;
  }
}

function sameSelection(a: string[] | undefined, b: string[] | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((file, index) => file === b[index])
  );
}

function listText(value: unknown): string {
  return value === undefined ? "unset" : JSON.stringify(value);
}

function names(keys: readonly string[]): string {
  return keys.length === 1
    ? (keys[0] as string)
    : `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
}

export interface TestConfigReconcile {
  readonly written: string[];
  readonly warnings: string[];
}

/**
 * Brings an existing `src/test/tsconfig.json` onto the scaffold's: missing
 * managed settings are added, a value the user set stays, and the lists are
 * replaced only when they select other files than the derived ones. A config
 * that does not extend the root is the user's own and is left alone.
 */
export function reconcileTestTsconfig(
  cwd: string,
  rootInclude: readonly string[],
  rootExclude: readonly string[],
): TestConfigReconcile {
  const written: string[] = [];
  if (writeTestEnv(cwd)) {
    written.push(TEST_ENV_REL);
  }
  const configPath = path.join(cwd, ...TEST_TSCONFIG_REL.split("/"));
  const own = readJsoncObject(configPath);
  if (!extendsRoot(cwd, configPath, own.extends)) {
    return {
      written,
      warnings: [
        fileWarning(TEST_TSCONFIG_REL, [
          `does not extend ${ROOT_FROM_TEST_FOLDER}, so its settings and lists were left as they are`,
        ]),
      ],
    };
  }

  const parts: string[] = [];
  const compilerOptions = isJsonObject(own.compilerOptions) ? { ...own.compilerOptions } : {};
  const added: string[] = [];
  const kept: string[] = [];
  for (const [key, value] of Object.entries(TEST_CONFIG_COMPILER_OPTIONS)) {
    if (!(key in compilerOptions)) {
      compilerOptions[key] = value;
      added.push(key);
    } else if (JSON.stringify(compilerOptions[key]) !== JSON.stringify(value)) {
      kept.push(
        `${key} stays ${JSON.stringify(compilerOptions[key])} where the scaffold sets ${JSON.stringify(value)}`,
      );
    }
  }
  if (added.length > 0) {
    parts.push(`added ${names(added)}`);
  }
  parts.push(...kept);
  const ownTypes = TYPE_SURFACE_KEYS.filter((key) => key in compilerOptions);
  if (ownTypes.length > 0) {
    parts.push(`its own ${names(ownTypes)} stay and replace the root config's game types`);
  }

  const before = readFileSync(configPath, "utf8");
  const withSettings = { ...own, compilerOptions };
  const derived = derivedLists(rootInclude, rootExclude);
  const withLists = { ...withSettings, ...derived };
  const current = selection(configPath, editJsoncText(before, withSettings, TEST_TSCONFIG_REL));
  const candidate = selection(configPath, editJsoncText(before, withLists, TEST_TSCONFIG_REL));
  const replaceLists = !sameSelection(current, candidate);
  if (replaceLists) {
    parts.push(
      `include ${listText(own.include)} became ${JSON.stringify(derived.include)} and exclude ${listText(own.exclude)} became ${JSON.stringify(derived.exclude)}, since they selected other files`,
    );
  }

  if (editJsoncFile(configPath, replaceLists ? withLists : withSettings)) {
    written.push(TEST_TSCONFIG_REL);
  }
  return {
    written,
    warnings: parts.length === 0 ? [] : [fileWarning(TEST_TSCONFIG_REL, parts)],
  };
}
