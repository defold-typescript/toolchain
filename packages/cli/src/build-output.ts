import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { TranspileDiagnostic } from "@defold-typescript/transpiler";

export interface BuildConfig {
  readonly outDir: string | undefined;
  readonly include: string[];
}

interface TsConfig {
  compilerOptions?: {
    outDir?: string;
  };
  include?: string[];
}

const DEFAULT_INCLUDE = ["src/**/*.ts"];
const PROJECT_BUCKET = "<project>";

export function toPosix(p: string, sep: string = path.sep): string {
  return p.split(sep).join("/");
}

const TRANSPILER_SOURCE_RE = /\.(ts|tsx|cts|mts)$/;

export function isTranspilerSource(rel: string): boolean {
  return TRANSPILER_SOURCE_RE.test(toPosix(rel));
}

export function readBuildConfig(cwd: string): BuildConfig {
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  let raw: string;
  try {
    raw = readFileSync(tsconfigPath, "utf8");
  } catch {
    throw new Error(
      `defold-typescript build: no tsconfig.json at ${cwd}; run 'defold-typescript init' first.`,
    );
  }

  const tsconfig = JSON.parse(raw) as TsConfig;
  const outDir = tsconfig.compilerOptions?.outDir;
  const include = tsconfig.include?.length ? tsconfig.include : DEFAULT_INCLUDE;
  return { outDir, include };
}

function stripIncludeBase(pattern: string): string {
  const firstWildcard = pattern.search(/[*?[]/);
  if (firstWildcard === -1) {
    return pattern.endsWith("/") ? pattern : `${path.posix.dirname(pattern)}/`;
  }
  const upToWildcard = pattern.slice(0, firstWildcard);
  const lastSlash = upToWildcard.lastIndexOf("/");
  return lastSlash === -1 ? "" : upToWildcard.slice(0, lastSlash + 1);
}

export function computeScriptRel(rel: string, config: BuildConfig): string {
  const { outDir, include } = config;
  if (outDir === undefined || outDir === "" || outDir === ".") {
    return rel.replace(/\.ts$/, ".ts.script");
  }
  const includeBase =
    include
      .map(stripIncludeBase)
      .filter((base) => rel.startsWith(base))
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const relUnderBase = rel.slice(includeBase.length);
  return path.posix.join(outDir, relUnderBase.replace(/\.ts$/, ".ts.script"));
}

export function collectFailures(
  diagnostics: readonly TranspileDiagnostic[],
): Map<string, string[]> {
  const failures = new Map<string, string[]>();
  for (const diag of diagnostics) {
    const bucket = diag.file ?? PROJECT_BUCKET;
    const list = failures.get(bucket);
    if (list) {
      list.push(diag.message);
    } else {
      failures.set(bucket, [diag.message]);
    }
  }
  return failures;
}

export function throwIfFailures(failures: ReadonlyMap<string, string[]>): void {
  if (failures.size === 0) {
    return;
  }
  const formatted = [...failures.entries()]
    .map(([file, messages]) => `  ${file}: ${messages.join("; ")}`)
    .join("\n");
  throw new Error(`defold-typescript build: ${failures.size} file(s) failed:\n${formatted}`);
}

export function writeScriptFile(
  cwd: string,
  scriptRel: string,
  lua: string,
  map: string | undefined,
): void {
  const scriptAbs = path.join(cwd, scriptRel);
  mkdirSync(path.dirname(scriptAbs), { recursive: true });
  if (map) {
    const mapBasename = `${path.posix.basename(scriptRel)}.map`;
    writeFileSync(`${scriptAbs}.map`, map);
    writeFileSync(scriptAbs, `${lua}\n--# sourceMappingURL=${mapBasename}\n`);
  } else {
    writeFileSync(scriptAbs, lua);
  }
}
