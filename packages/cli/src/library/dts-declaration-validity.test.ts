import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import * as ts from "typescript";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "./package-root";
import { writePrintedCorpus } from "./print-corpus";
import { readNativeTargets } from "./sync-native-types";

const PACKAGE_ROOT = LIBRARY_TYPES_ROOT;
const DATA_DIR = LIBRARY_DATA_DIR;
const REPO_ROOT = resolve(import.meta.dir, "../../../..");
const PRINTED_DIR = mkdtempSync(join(tmpdir(), "printed-corpus-"));

afterAll(() => rmSync(PRINTED_DIR, { recursive: true, force: true }));

// Every curated native-extension declaration library data holds. It is
// hand-authored and shipped as-is, so this compile is its only validity check.
const NATIVE_DECLARATIONS = readNativeTargets(DATA_DIR).map((t) =>
  resolve(DATA_DIR, t.declaration),
);

const USAGE_PROOFS = readdirSync(resolve(PACKAGE_ROOT, "test-d"), { recursive: true })
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
  const file = diagnostic.file.fileName.startsWith(PRINTED_DIR)
    ? `printed/${relative(PRINTED_DIR, diagnostic.file.fileName)}`
    : relative(REPO_ROOT, diagnostic.file.fileName);
  return `${file}:${line + 1} ${message}`;
}

// Compiles what `resolve` serves, with `skipLibCheck: false` so an invalid
// declaration — a base/subinterface variance regression (`TS2430`) or a merged
// duplicate-member class (`TS2300`/`TS2717`) — surfaces instead of hiding behind
// the repo-wide `skipLibCheck: true`. Only diagnostics in these inputs gate:
// conflicts inside `node_modules` type packages are not the corpus's to fix.
test("every printed declaration, native declaration and usage proof compiles under skipLibCheck: false", async () => {
  const printed = await writePrintedCorpus(DATA_DIR, PRINTED_DIR);
  const inputs = [...printed, ...NATIVE_DECLARATIONS, ...USAGE_PROOFS];
  expect(printed.length).toBeGreaterThan(0);
  expect(USAGE_PROOFS.length).toBeGreaterThan(0);

  const program = ts.createProgram(inputs, compilerOptions());
  const gated = new Set(inputs);
  const offenders = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === undefined || gated.has(diagnostic.file.fileName))
    .map(where);
  expect(offenders).toEqual([]);
}, 120_000);
