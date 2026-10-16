import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  computeOutputRel,
  HSM_REQUIRE_ROOT,
  hsmModules,
  parseBuildConfig,
  type ScriptKind,
  type SourceOutputKind,
  stripIncludeBase,
  type TranspileDiagnostic,
  type BuildConfig as TsconfigBuildConfig,
} from "@defold-typescript/transpiler";

export type { SourceOutputKind };
export { computeOutputRel, parseBuildConfig, stripIncludeBase };

/**
 * The output layout `tsconfig.json` decides, plus the folder `package.json`
 * picks for the Lua the build writes on its own behalf.
 */
export interface BuildConfig extends TsconfigBuildConfig {
  readonly runtimeDir?: string;
}

export const PROJECT_BUCKET = "<project>";

export function toPosix(p: string, sep: string = path.sep): string {
  return p.split(sep).join("/");
}

const TRANSPILER_SOURCE_RE = /\.(ts|tsx|cts|mts)$/;

export function isTranspilerSource(rel: string): boolean {
  return TRANSPILER_SOURCE_RE.test(toPosix(rel));
}

export const RUNTIME_DEFAULT_DIR = "lib/defold_typescript";

// A dot is rejected in every folder name, not only `..`: Lua reads a dot in a
// require name as a folder separator, so a dotted folder is written where no
// require can reach it.
function isValidRuntimeDir(value: string): boolean {
  if (value.startsWith("/") || /[\\:]/.test(value)) {
    return false;
  }
  return value.split("/").every((segment) => segment !== "" && !segment.includes("."));
}

/**
 * The `package.json` `"defold-typescript"."runtime-dir"` setting, or undefined
 * when there is no `package.json`, it does not parse, or it sets no folder.
 */
export function readRuntimeDir(cwd: string): string | undefined {
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
  if (typeof pkg !== "object" || pkg === null) {
    return undefined;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null || !("runtime-dir" in namespace)) {
    return undefined;
  }
  const value = (namespace as Record<string, unknown>)["runtime-dir"];
  if (typeof value !== "string" || !isValidRuntimeDir(value)) {
    throw new Error(
      `defold-typescript: package.json "defold-typescript"."runtime-dir" is ${JSON.stringify(value)}; it must be a folder under the output root with no leading slash, no "..", and no dot in any folder name, because Lua reads a dot in a require name as a folder separator.`,
    );
  }
  return value;
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

  const runtimeDir = readRuntimeDir(cwd);
  return { ...parseBuildConfig(raw), ...(runtimeDir !== undefined ? { runtimeDir } : {}) };
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

// Excluding parens from the type-argument body keeps a later call expression on
// the same line from being swallowed into it; one nesting level covers `Box<T>`.
const TYPE_ARGS = String.raw`(?:<(?:[^<>()]|<[^<>()]*>)*>\s*)?`;

function factoryCall(name: string): RegExp {
  return new RegExp(String.raw`\b${name}\s*${TYPE_ARGS}\(`);
}

// A `.ts` source carries no Defold component kind of its own; the lifecycle
// factory it calls is the signal. The call is matched (trailing `(`, with or
// without an explicit type-argument list) so a bare import of the factories does
// not decide the kind. `editor-script` is a disjoint marker, so its order
// relative to the runtime three is irrelevant; precedence among the runtime
// kinds is render > gui > script; a source using no factory emits as a Lua
// module.
const FACTORY_KINDS: ReadonlyArray<readonly [ScriptKind, RegExp]> = [
  ["editor-script", factoryCall("defineEditorScript")],
  ["render-script", factoryCall("defineRenderScript")],
  ["gui-script", factoryCall("defineGuiScript")],
  ["script", factoryCall("defineScript")],
];

export function detectSourceOutputKind(source: string): SourceOutputKind {
  for (const [kind, re] of FACTORY_KINDS) {
    if (re.test(source)) {
      return kind;
    }
  }
  return "module";
}

// How each runtime artifact names itself when it contends for its own output
// path. No source produced it, so a contested-path failure has no source rel to
// print and says what the file is instead.
export const LUALIB_BUNDLE_LABEL = "the TypeScript standard-library bundle";
export const TIMERS_RUNTIME_LABEL = "the timers polyfill runtime";
export const HSM_LIBRARY_LABEL = "the hsm state machine library";

// Every file the build writes on its own behalf sits in one folder under the
// output root, so the project root holds none of them and one ignore line
// covers them all. The transpiler emits each artifact's internal require name;
// the build respells every require to the path joined here.
function runtimeRel(config: BuildConfig, file: string): string {
  const { outDir } = config;
  const root = outDir === undefined || outDir === "" || outDir === "." ? "" : outDir;
  return path.posix.join(root, config.runtimeDir ?? RUNTIME_DEFAULT_DIR, file);
}

// The synthesized lualib bundle lands once in the runtime folder, so every
// script reaches the same copy whichever subfolder it lives in.
export function lualibBundleRel(config: BuildConfig): string {
  return runtimeRel(config, "lualib_bundle.lua");
}

// The timers polyfill runtime lands once in the runtime folder next to the
// lualib bundle, which it requires.
export function timersModuleRel(config: BuildConfig): string {
  return runtimeRel(config, "timers.lua");
}

// Each hsm module lands at `hsm/<module>.lua` in the runtime folder, beside the
// bundle `async` requires.
export function hsmModuleRel(config: BuildConfig, name: string): string {
  return runtimeRel(config, `hsm/${name}.lua`);
}

/** Where each named hsm module lands, keyed by module name. */
export function hsmModuleRels(
  config: BuildConfig,
  names: Iterable<string>,
): Record<string, string> {
  const rels: Record<string, string> = {};
  for (const name of names) {
    rels[name] = hsmModuleRel(config, name);
  }
  return rels;
}

// Every path the build writes on its own behalf rather than for a source: the
// lualib bundle, the timers runtime, and every hsm module. Each is written only
// when a program needs it, but any of them may be on disk from an earlier build,
// so watch and the orphan scan treat the whole set as the build's own.
export function builtinRuntimeRels(config: BuildConfig): string[] {
  return [
    lualibBundleRel(config),
    timersModuleRel(config),
    ...hsmModules().map(({ name }) => hsmModuleRel(config, name)),
  ];
}

export function outputRelsForSource(rel: string, config: BuildConfig): string[] {
  const outputs = [
    computeOutputRel(rel, config, "module"),
    computeOutputRel(rel, config, "script"),
    computeOutputRel(rel, config, "gui-script"),
    computeOutputRel(rel, config, "render-script"),
    computeOutputRel(rel, config, "editor-script"),
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

export function hasGeneratedBanner(cwd: string, rel: string): boolean {
  let content: string;
  try {
    content = readFileSync(path.join(cwd, rel), "utf8");
  } catch {
    return false;
  }
  return content.split("\n").some((line) => line.trim() === GENERATED_BANNER);
}

// The output-root paths earlier releases wrote the build's own Lua to, each
// named after the artifact's internal require name.
function legacyRuntimeRels(config: BuildConfig): string[] {
  const { outDir } = config;
  const root = outDir === undefined || outDir === "" || outDir === "." ? "" : outDir;
  return [
    "lualib_bundle.lua",
    "defold_typescript_timers.lua",
    ...hsmModules().map(({ name }) => `${HSM_REQUIRE_ROOT}/${name}.lua`),
  ].map((rel) => path.posix.join(root, rel));
}

/**
 * Remove the runtime files an earlier build wrote at the output root, so an
 * upgraded project keeps one copy of each, in the runtime folder. A file goes
 * only when it carries the generated banner and nothing this build writes —
 * a runtime file or a live source's output — lands on it; the old hsm folder
 * goes only once that leaves it empty.
 */
export function pruneLegacyRuntimeOutputs(
  cwd: string,
  config: BuildConfig,
  liveSources: readonly string[],
): void {
  const live = new Set([
    ...builtinRuntimeRels(config),
    ...liveSources.flatMap((rel) => outputRelsForSource(rel, config)),
  ]);
  for (const rel of legacyRuntimeRels(config)) {
    if (live.has(rel) || !hasGeneratedBanner(cwd, rel)) {
      continue;
    }
    rmSync(path.join(cwd, rel), { force: true });
    rmSync(path.join(cwd, `${rel}.map`), { force: true });
  }
  const { outDir } = config;
  const hsmDir = path.join(cwd, outDir ?? "", HSM_REQUIRE_ROOT);
  try {
    if (readdirSync(hsmDir).length === 0) {
      rmdirSync(hsmDir);
    }
  } catch {
    // No old hsm folder: nothing to remove.
  }
}

// Delete every output a source could have produced except the ones it currently
// does (each `keep` rel and its `.map`). With a source on disk, its non-current
// outputs are provably stale, so a kind switch never leaves the prior artifact
// behind. A set rather than one rel: a script-kind source that exports values
// writes both its component resource and its companion module, and the
// module-kind path is one of its own alternatives. With no `keep`, removes all
// of the source's outputs.
export function pruneAlternativeOutputs(
  cwd: string,
  rel: string,
  config: BuildConfig,
  keep: readonly string[] = [],
): void {
  const live = new Set(keep.flatMap((keepRel) => [keepRel, `${keepRel}.map`]));
  for (const outputRel of outputRelsForSource(rel, config)) {
    if (!live.has(outputRel)) {
      rmSync(path.join(cwd, outputRel), { force: true });
    }
  }
}

export interface FailureEntry {
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

// A build failure carrying one structured entry per diagnostic (position kept),
// so callers can surface located `file:line:column` rows instead of parsing the
// combined message string.
export class BuildFailureError extends Error {
  readonly entries: ReadonlyArray<{
    readonly file: string;
    readonly message: string;
    readonly line?: number;
    readonly column?: number;
  }>;

  constructor(
    message: string,
    entries: ReadonlyArray<{
      readonly file: string;
      readonly message: string;
      readonly line?: number;
      readonly column?: number;
    }>,
  ) {
    super(message);
    this.name = "BuildFailureError";
    this.entries = entries;
  }
}

export function collectFailures(
  diagnostics: readonly TranspileDiagnostic[],
): Map<string, FailureEntry[]> {
  const failures = new Map<string, FailureEntry[]>();
  for (const diag of diagnostics) {
    // Advisory diagnostics (e.g. the deprecated direct `go.property` call) warn
    // but never fail the build — the call still registers at runtime.
    if (diag.category === "warning") {
      continue;
    }
    const bucket = diag.file ?? PROJECT_BUCKET;
    const entry: FailureEntry = {
      message: diag.message,
      ...(diag.line !== undefined ? { line: diag.line } : {}),
      ...(diag.column !== undefined ? { column: diag.column } : {}),
    };
    const list = failures.get(bucket);
    if (list) {
      list.push(entry);
    } else {
      failures.set(bucket, [entry]);
    }
  }
  return failures;
}

export function throwIfFailures(failures: ReadonlyMap<string, FailureEntry[]>): void {
  if (failures.size === 0) {
    return;
  }
  const entries = [...failures.entries()].flatMap(([file, list]) =>
    list.map((entry) => ({ file, ...entry })),
  );
  const formatted = entries
    .map(({ file, message, line, column }) =>
      line !== undefined && column !== undefined
        ? `  ${file}:${line}:${column}: ${message}`
        : `  ${file}: ${message}`,
    )
    .join("\n");
  throw new BuildFailureError(
    `defold-typescript build: ${failures.size} file(s) failed:\n${formatted}`,
    entries,
  );
}

/**
 * Rewrites a map's `sourceRoot` to reach the authored source from the output
 * file, which is the one relation only the build knows. `sources` is left as the
 * bare basename the Local Lua Debugger's `scriptRoots` resolution expects.
 *
 * The map comes back untouched — byte for byte, so an alongside build's output
 * never moves — whenever the correction is empty or cannot be trusted: a map
 * that does not parse, and a map naming more than one source, which no single
 * `sourceRoot` can relocate.
 */
export function retargetSourceRoot(
  map: string | undefined,
  scriptRel: string,
  sourceRel: string,
): string | undefined {
  if (map === undefined) return undefined;
  const sourceRoot = path.posix.relative(
    path.posix.dirname(toPosix(scriptRel)),
    path.posix.dirname(toPosix(sourceRel)),
  );
  if (sourceRoot === "") return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(map);
  } catch {
    return map;
  }
  if (typeof parsed !== "object" || parsed === null) return map;
  const { sources } = parsed as Record<string, unknown>;
  if (!Array.isArray(sources) || sources.length !== 1) return map;
  return JSON.stringify({ ...(parsed as Record<string, unknown>), sourceRoot });
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
