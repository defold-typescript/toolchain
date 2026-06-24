import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { TranspileDiagnostic } from "@defold-typescript/transpiler";
import type { ScriptKind } from "./script-kind";

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

function globToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        // `**/` spans any number of segments (including none); a bare `**`
        // spans the rest of the path.
        if (pattern[i + 1] === "/") {
          i++;
          out += "(?:[^/]+/)*";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += (c as string).replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

export function isFileIncluded(rel: string, include: readonly string[]): boolean {
  // Watch events can carry either separator regardless of host OS, so normalize
  // both before matching the posix-shaped include globs.
  const posix = rel.replace(/\\/g, "/");
  return include.some((pattern) => globToRegex(pattern).test(posix));
}

export function stripIncludeBase(pattern: string): string {
  const firstWildcard = pattern.search(/[*?[]/);
  if (firstWildcard === -1) {
    return pattern.endsWith("/") ? pattern : `${path.posix.dirname(pattern)}/`;
  }
  const upToWildcard = pattern.slice(0, firstWildcard);
  const lastSlash = upToWildcard.lastIndexOf("/");
  return lastSlash === -1 ? "" : upToWildcard.slice(0, lastSlash + 1);
}

const SCRIPT_SUFFIX_BY_KIND: Record<ScriptKind, string> = {
  script: ".ts.script",
  "gui-script": ".ts.gui_script",
  "render-script": ".ts.render_script",
};

export type SourceOutputKind = ScriptKind | "module";

// A `.ts` source carries no Defold component kind of its own; the lifecycle
// factory it calls is the signal. The call is matched (trailing `(`) so a bare
// import of all three factories does not decide the kind. Precedence
// render > gui > script; a source using no factory emits as a Lua module.
const FACTORY_KINDS: ReadonlyArray<readonly [ScriptKind, RegExp]> = [
  ["render-script", /\bdefineRenderScript\s*\(/],
  ["gui-script", /\bdefineGuiScript\s*\(/],
  ["script", /\bdefineScript\s*\(/],
];

export function detectSourceOutputKind(source: string): SourceOutputKind {
  for (const [kind, re] of FACTORY_KINDS) {
    if (re.test(source)) {
      return kind;
    }
  }
  return "module";
}

export function detectSourceScriptKind(source: string): ScriptKind {
  const kind = detectSourceOutputKind(source);
  return kind === "module" ? "script" : kind;
}

function relUnderOutDir(rel: string, config: BuildConfig): string {
  const { outDir, include } = config;
  if (outDir === undefined || outDir === "" || outDir === ".") {
    return rel;
  }
  const includeBase =
    include
      .map(stripIncludeBase)
      .filter((base) => rel.startsWith(base))
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const relUnderBase = rel.slice(includeBase.length);
  return path.posix.join(outDir, relUnderBase);
}

export function computeOutputRel(rel: string, config: BuildConfig, kind: SourceOutputKind): string {
  const baseRel = relUnderOutDir(rel, config);
  if (kind === "module") {
    return baseRel.replace(/\.ts$/, ".lua");
  }
  return baseRel.replace(/\.ts$/, SCRIPT_SUFFIX_BY_KIND[kind]);
}

// Defold resolves `require("lualib_bundle")` to `lualib_bundle.lua` at the
// project/output root, so the synthesized bundle lands once there regardless of
// which subfolder a script lives in.
export function lualibBundleRel(config: BuildConfig): string {
  const { outDir } = config;
  if (outDir === undefined || outDir === "" || outDir === ".") {
    return "lualib_bundle.lua";
  }
  return path.posix.join(outDir, "lualib_bundle.lua");
}

// The timers polyfill runtime lands once at the project/output root next to
// `lualib_bundle.lua`, so `require("defold_typescript_timers")` resolves in
// Defold regardless of which subfolder a script lives in.
export function timersModuleRel(config: BuildConfig): string {
  const { outDir } = config;
  if (outDir === undefined || outDir === "" || outDir === ".") {
    return "defold_typescript_timers.lua";
  }
  return path.posix.join(outDir, "defold_typescript_timers.lua");
}

export function computeScriptRel(
  rel: string,
  config: BuildConfig,
  kind: ScriptKind = "script",
): string {
  return computeOutputRel(rel, config, kind);
}

export function outputRelsForSource(rel: string, config: BuildConfig): string[] {
  const outputs = [
    computeOutputRel(rel, config, "module"),
    computeOutputRel(rel, config, "script"),
    computeOutputRel(rel, config, "gui-script"),
    computeOutputRel(rel, config, "render-script"),
  ];
  return outputs.flatMap((output) => [output, `${output}.map`]);
}

// A trailer banner stamped on every generated artifact so the orphan scan can
// tell tool output from hand-authored Lua. It is a trailer (never a leading
// line) because the source map is line-indexed: a leading banner would shift
// every mapped line and break debugging. When a sourceMappingURL directive is
// also written it stays the file's last line (debuggers only honor it at
// end-of-file), so the banner precedes it. The orphan scan matches the banner
// on any line, so its position never matters to detection.
export const GENERATED_BANNER = "--# defold-typescript:generated";

// Delete every output a source could have produced except the one it currently
// does (`keepRel` and its `.map`). With a source on disk, its non-current
// outputs are provably stale, so a kind switch never leaves the prior artifact
// behind. With no `keepRel`, removes all of the source's outputs.
export function pruneAlternativeOutputs(
  cwd: string,
  rel: string,
  config: BuildConfig,
  keepRel?: string,
): void {
  for (const outputRel of outputRelsForSource(rel, config)) {
    if (outputRel !== keepRel && outputRel !== `${keepRel}.map`) {
      rmSync(path.join(cwd, outputRel), { force: true });
    }
  }
}

export function collectFailures(
  diagnostics: readonly TranspileDiagnostic[],
): Map<string, string[]> {
  const failures = new Map<string, string[]>();
  for (const diag of diagnostics) {
    // Advisory diagnostics (e.g. the deprecated direct `go.property` call) warn
    // but never fail the build — the call still registers at runtime.
    if (diag.category === "warning") {
      continue;
    }
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
    // The sourceMappingURL directive must stay the file's last line: the Local
    // Lua Debugger only honors it at end-of-file (its matcher anchors `%s*$`),
    // so the banner is appended before it, not after.
    writeFileSync(scriptAbs, `${lua}\n${GENERATED_BANNER}\n--# sourceMappingURL=${mapBasename}\n`);
  } else {
    writeFileSync(scriptAbs, `${lua}\n${GENERATED_BANNER}\n`);
  }
}
