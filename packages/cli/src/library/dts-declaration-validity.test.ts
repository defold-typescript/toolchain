import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { FIXTURE_DATA_DIR } from "../library-data-fixture";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { readNativeTargets } from "./sync-native-types";

const REPO_ROOT = resolve(import.meta.dir, "../../../..");
const PROOFS_DIR = resolve(import.meta.dir, "../../test/fixtures/test-d");

// The real native declarations and the proofs that type them, which no usage
// example in the data folder holds: the `@ts-expect-error` lines a real namespace
// must reject, and the absence of every global alias.
const REAL_NATIVE_DECLARATIONS = readNativeTargets(LIBRARY_DATA_DIR).map((t) =>
  resolve(LIBRARY_DATA_DIR, t.declaration),
);
const REAL_NATIVE_PROOFS = [
  "native-extensions-usage.test-d.ts",
  "native-global-alias.test-d.ts",
].map((file) => resolve(LIBRARY_TYPES_ROOT, "test-d", file));

function posix(file: string): string {
  return file.replaceAll("\\", "/");
}

// Every curated native-extension declaration the fixture data holds. A real one
// is hand-authored and shipped as-is, so a compile is its only validity check.
const NATIVE_DECLARATIONS = readNativeTargets(FIXTURE_DATA_DIR).map((t) =>
  resolve(FIXTURE_DATA_DIR, t.declaration),
);

// The toolchain proofs, which type no single library and import no printed
// module.
const TOOLCHAIN_PROOFS = readdirSync(PROOFS_DIR, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => resolve(PROOFS_DIR, file));

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
  return `${posix(relative(REPO_ROOT, diagnostic.file.fileName))}:${line + 1} ${message}`;
}

// Only diagnostics in these inputs gate: conflicts inside `node_modules` type
// packages are not the corpus's to fix.
test("every toolchain proof compiles with the native declarations under skipLibCheck: false", () => {
  const inputs = [...NATIVE_DECLARATIONS, ...TOOLCHAIN_PROOFS];
  expect(NATIVE_DECLARATIONS.length).toBeGreaterThan(0);
  expect(TOOLCHAIN_PROOFS.length).toBeGreaterThan(0);

  const program = ts.createProgram(inputs, compilerOptions());
  const gated = new Set(inputs.map(posix));
  const offenders = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) => diagnostic.file === undefined || gated.has(posix(diagnostic.file.fileName)),
    )
    .map(where);
  expect(offenders).toEqual([]);
}, 120_000);

test("the real native proofs compile with the real native declarations under skipLibCheck: false", () => {
  const inputs = [...REAL_NATIVE_DECLARATIONS, ...REAL_NATIVE_PROOFS];
  expect(REAL_NATIVE_DECLARATIONS.length).toBeGreaterThan(0);

  const program = ts.createProgram(inputs, compilerOptions());
  const gated = new Set(inputs.map(posix));
  const offenders = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (diagnostic) => diagnostic.file === undefined || gated.has(posix(diagnostic.file.fileName)),
    )
    .map(where);
  expect(offenders).toEqual([]);
}, 120_000);
