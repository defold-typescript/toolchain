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
