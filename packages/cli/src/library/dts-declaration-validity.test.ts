import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { checkLibraryData } from "./library-check";
import { readLibraryData } from "./library-data";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { readNativeTargets } from "./sync-native-types";

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;
const DATA_DIR = LIBRARY_DATA_DIR;
const REPO_ROOT = resolve(import.meta.dir, "../../../..");

// Every curated native-extension declaration library data holds. It is
// hand-authored and shipped as-is, so a compile is its only validity check.
const NATIVE_DECLARATIONS = readNativeTargets(DATA_DIR).map((t) =>
  resolve(DATA_DIR, t.declaration),
);

// The toolchain proofs, which type no single library and import no printed
// module.
const TOOLCHAIN_PROOFS = readdirSync(resolve(PACKAGE_ROOT, "test-d"), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => resolve(PACKAGE_ROOT, "test-d", file));

function compilerOptions(): ts.CompilerOptions {
  const configFile = join(REPO_ROOT, "tsconfig.json");
  const { config } = ts.readConfigFile(configFile, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    REPO_ROOT,
    undefined,
    configFile,
  );
  return { ...options, skipLibCheck: false, noEmit: true };
}

function where(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${relative(REPO_ROOT, diagnostic.file.fileName)}:${line + 1} ${message}`;
}

// What `library check` runs over the data folder this toolchain writes: every
// printed declaration, native declaration and usage example compiles against the
// engine types under `skipLibCheck: false`, so an invalid declaration — a
// base/subinterface variance regression (`TS2430`) or a merged duplicate-member
// class (`TS2300`/`TS2717`) — surfaces instead of hiding behind a project's
// `skipLibCheck: true`.
test("the library data folder passes library check", async () => {
  expect(readLibraryData(DATA_DIR).some(({ usage }) => usage.length > 0)).toBe(true);

  expect(await checkLibraryData(DATA_DIR)).toEqual([]);
}, 120_000);

// Only diagnostics in these inputs gate: conflicts inside `node_modules` type
// packages are not the corpus's to fix.
test("every toolchain proof compiles with the native declarations under skipLibCheck: false", () => {
  const inputs = [...NATIVE_DECLARATIONS, ...TOOLCHAIN_PROOFS];
  expect(TOOLCHAIN_PROOFS.length).toBeGreaterThan(0);

  const program = ts.createProgram(inputs, compilerOptions());
  const gated = new Set(inputs);
  const offenders = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === undefined || gated.has(diagnostic.file.fileName))
    .map(where);
  expect(offenders).toEqual([]);
}, 120_000);
