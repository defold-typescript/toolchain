import * as path from "node:path";

export type ScriptKind = "script" | "gui-script" | "render-script" | "editor-script";

export type SourceOutputKind = ScriptKind | "module";

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

export const DEFAULT_INCLUDE = ["src/**/*.ts"];

export const SCRIPT_SUFFIX_BY_KIND: Record<ScriptKind, string> = {
  script: ".ts.script",
  "gui-script": ".ts.gui_script",
  "render-script": ".ts.render_script",
  "editor-script": ".ts.editor_script",
};

// The `tsconfig.json` reading the output-path math depends on, separated from
// how the text was obtained: the CLI reads it off disk, the editor plugin gets
// it from the language-service host, and both must derive the same names from
// the same text or the plugin predicts a resource the build never writes.
export function parseBuildConfig(raw: string): BuildConfig {
  const tsconfig = JSON.parse(raw) as TsConfig;
  const outDir = tsconfig.compilerOptions?.outDir;
  const include = tsconfig.include?.length ? tsconfig.include : DEFAULT_INCLUDE;
  return { outDir, include };
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

// A root is a folder inside the project a tool can safely speak for, so a
// pattern that resolves to the project root, escapes `cwd`, or is absolute in
// any spelling yields nothing. Escape is the normalized `..` *segment*, not a
// two-period prefix: `..local` is an ordinary folder name. Absoluteness is
// decided by string shape, never by `path.isAbsolute`, which answers for the
// host OS and would wave a Windows drive or UNC path through on a POSIX runner.
const ABSOLUTE_SPELLING_RE = /^(\/|\\\\|[A-Za-z]:[\\/])/;

// The folder an include pattern speaks for, as a project-relative posix base
// (`""` for the project root itself), or `undefined` when the pattern reaches
// outside the project. The scaffold-rule roots, the starter target and the
// debug launch derivation all answer "which project folder does this pattern
// speak for" here, so the three cannot drift.
export function projectRelativeBase(pattern: string): string | undefined {
  if (ABSOLUTE_SPELLING_RE.test(pattern)) {
    return undefined;
  }
  const base = path.posix.normalize(stripIncludeBase(pattern.split("\\").join("/")));
  if (base === ".." || base.startsWith("../")) {
    return undefined;
  }
  return base === "." || base === "./" ? "" : base;
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

/**
 * The `require` path Lua reaches a rel by, mirroring the segment math TSTL
 * applies when it emits one: the extension comes off the last segment, then
 * every remaining `.` becomes `_` *within* a segment, because Lua reads a dot as
 * a path separator and `src/foo.bar.lua` would otherwise be unreachable as
 * `require("src.foo.bar")`. Both sides of the resolution check key through this,
 * so a require and the output meant to satisfy it cannot be spelled differently.
 */
export function requirePathForRel(rel: string): string {
  const segments = rel
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");
  const last = segments.length - 1;
  const lastSegment = segments[last];
  if (lastSegment !== undefined) {
    segments[last] = lastSegment.replace(/\.[^.]*$/, "");
  }
  return segments.map((segment) => segment.replace(/\./g, "_")).join(".");
}

export function computeOutputRel(rel: string, config: BuildConfig, kind: SourceOutputKind): string {
  const baseRel = relUnderOutDir(rel, config);
  if (kind === "module") {
    return baseRel.replace(/\.ts$/, ".lua");
  }
  return baseRel.replace(/\.ts$/, SCRIPT_SUFFIX_BY_KIND[kind]);
}
