// User projects do not set exactOptionalPropertyTypes or noUncheckedIndexedAccess,
// and the ECS filter and system definition types, the HSM config types and the
// engine declarations infer differently without them, so the type-level tests are
// checked this way too: each config of the package in the current directory is
// compiled again with the strictness a scaffolded project uses.
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import {
  type ScaffoldStrictness,
  scaffoldStrictness,
} from "../packages/cli/src/scaffold-strictness.ts";

const REPO_ROOT = resolve(import.meta.dir, "..");
const PACKAGE_CONFIG = "tsconfig.json";
// A negative proof fails by design; its own test asserts the failure.
const NEGATIVE_SUFFIX = "-neg.json";

function toPosix(path: string): string {
  return path.replaceAll("\\", "/");
}

function repoRelative(path: string): string {
  return toPosix(relative(REPO_ROOT, path));
}

export function scaffoldTypecheckConfigs(packageDir: string): string[] {
  const proofs = [...new Bun.Glob("test-d/**/tsconfig*.json").scanSync({ cwd: packageDir })]
    .map(toPosix)
    .filter((config) => !config.endsWith(NEGATIVE_SUFFIX))
    .sort();
  return [PACKAGE_CONFIG, ...proofs];
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (!diagnostic.file || diagnostic.start === undefined) return `TS${diagnostic.code} ${message}`;
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${repoRelative(diagnostic.file.fileName)}:${line + 1} TS${diagnostic.code} ${message}`;
}

export function scaffoldDiagnostics(
  tsconfigPath: string,
  strictness: ScaffoldStrictness = scaffoldStrictness(),
): string[] {
  const host = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic: ts.Diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
    },
  } as ts.ParseConfigFileHost;
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    { ...strictness, noEmit: true },
    host,
  );
  if (!parsed) throw new Error(`could not parse ${tsconfigPath}`);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    configFileParsingDiagnostics: parsed.errors,
    ...(parsed.projectReferences ? { projectReferences: parsed.projectReferences } : {}),
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(formatDiagnostic);
}

if (import.meta.main) {
  const packageDir = process.cwd();
  const strictness = scaffoldStrictness();
  const flags = Object.entries(strictness)
    .map(([flag, value]) => `${flag}: ${value}`)
    .join(", ");
  let failed = false;
  for (const config of scaffoldTypecheckConfigs(packageDir)) {
    const configPath = join(packageDir, config);
    const diagnostics = scaffoldDiagnostics(configPath, strictness);
    if (diagnostics.length === 0) continue;
    failed = true;
    console.error(`${repoRelative(configPath)} under the scaffold's options (${flags}):`);
    for (const line of diagnostics) console.error(`  ${line}`);
  }
  if (failed) process.exit(1);
}
