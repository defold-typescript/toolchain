// What a library's own files say about how it can be typed, read from paths and
// text alone. The Asset Portal intake counts this for every portal entry and
// `library add` for the one archive it downloads, so both pick the same lane.

export type PortalKind =
  | "no-source"
  | "not-a-dependency"
  | "script-api"
  | "native-untyped"
  | "pure-lua-annotated"
  | "pure-lua"
  | "no-lua-api";

export interface IncludedEvidence {
  scriptApi: number;
  extManifest: number;
  lua: number;
  luaSample: string[];
}

const LUA_SAMPLE_SIZE = 4;
export const NON_API_DIRS: ReadonlySet<string> = new Set([
  "example",
  "examples",
  "test",
  "tests",
  "demo",
  "sample",
  "samples",
]);
export const LUALS_ANNOTATION = /^\s*---@(class|param|return|field)\b/m;

function isUnder(path: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => path.startsWith(`${dir}/`));
}

/** Whether a path sits outside every example, test, demo or sample directory. */
export function isApiPath(path: string): boolean {
  return !path
    .split("/")
    .slice(0, -1)
    .some((dir) => NON_API_DIRS.has(dir));
}

/**
 * The `.script_api` files under `dirs`, sorted: what the classifier counts and
 * what the portal pages convert, so the two cannot disagree.
 */
export function includedScriptApiPaths(
  paths: readonly string[],
  dirs: readonly string[],
): string[] {
  return paths.filter((path) => isUnder(path, dirs) && path.endsWith(".script_api")).sort();
}

/**
 * Count the `.script_api`, `ext.manifest` and `.lua` files under `dirs`, and
 * pick the Lua sample: the first four sorted paths outside any example, test,
 * demo or sample directory.
 */
export function includedEvidence(
  paths: readonly string[],
  dirs: readonly string[],
): IncludedEvidence {
  const included = paths.filter((path) => isUnder(path, dirs));
  const lua = included.filter((path) => path.endsWith(".lua"));
  return {
    scriptApi: includedScriptApiPaths(paths, dirs).length,
    extManifest: included.filter((path) => path.split("/").at(-1) === "ext.manifest").length,
    lua: lua.length,
    luaSample: lua.filter(isApiPath).sort().slice(0, LUA_SAMPLE_SIZE),
  };
}

/**
 * First match wins. A `.script_api` outranks an `ext.manifest` because `resolve`
 * already types an extension that ships one; only an extension without it needs
 * the native curated lane.
 */
export function portalEntryKind(evidence: {
  readable: boolean;
  includeDirs: readonly string[];
  scriptApi: number;
  extManifest: number;
  lua: number;
  luaAnnotated: number;
}): PortalKind {
  if (!evidence.readable) return "no-source";
  if (evidence.includeDirs.length === 0) return "not-a-dependency";
  if (evidence.scriptApi > 0) return "script-api";
  if (evidence.extManifest > 0) return "native-untyped";
  if (evidence.lua > 0) return evidence.luaAnnotated > 0 ? "pure-lua-annotated" : "pure-lua";
  return "no-lua-api";
}
