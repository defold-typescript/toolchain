import {
  findEmittedRequires,
  LUALIB_REQUIRE_NAME,
  requirePathForRel,
  rewriteEmittedRequires,
  TIMERS_REQUIRE_NAME,
} from "@defold-typescript/transpiler";
import { BuildFailureError, PROJECT_BUCKET } from "./build-output";

export interface UnresolvedRequire {
  /** The source whose emitted Lua carries the require. */
  readonly importer: string;
  /** The module path that require names. */
  readonly requirePath: string;
  /** The source in the program that require maps to. */
  readonly target: string;
  /** The output the build will actually write for that source. */
  readonly expected: string;
  /** The rel Defold's Lua loader opens for `requirePath`. */
  readonly loadPath: string;
}

export interface FindUnresolvedRequiresInput {
  /** Emitted Lua per source rel, over the whole program. */
  readonly lua: Readonly<Record<string, string>>;
  /** Every source rel in the program, mapped to the output the build writes for it. */
  readonly sources: Readonly<Record<string, string>>;
  /**
   * Every rel the build will write. Passed in rather than derived from
   * `sources`, so a later slice that emits companion outputs widens what counts
   * as resolvable at the call site and this resolver needs no change.
   */
  readonly plannedOutputs: readonly string[];
}

/**
 * Every emitted require that names a source the build owns but resolves to no
 * output the build will write.
 *
 * The direction matters: a require with no source behind it is external by
 * definition — a Lua module from a library dependency, a `@noResolution`
 * ambient module, hand-authored Lua — and is skipped without further checks.
 * Only `.lua` outputs can satisfy a require; a component resource such as
 * `foo.ts.script` is addressed from a `.go` file and is never on the require
 * path.
 */
// The rel Lua opens for a module path: dots are path separators to the loader,
// so this is the one spelling that reaches the module. The output side is
// compared against it literally rather than through `requirePathForRel`, which
// would map `src/foo.bar.lua` and `src/foo_bar.lua` onto one key and let a
// dotted source name cancel the mismatch it creates.
function luaLoadPath(requirePath: string): string {
  return `${requirePath.replace(/\./g, "/")}.lua`;
}

export interface RequireRewritesInput {
  /** Every source rel in the program, mapped to the output the build writes for it. */
  readonly sources: Readonly<Record<string, string>>;
  /** Every source rel that emits a companion, mapped to the companion's rel. */
  readonly companions: Readonly<Record<string, string>>;
  /** Where the lualib bundle lands, when the build emits one. */
  readonly lualibRel?: string;
  /** Where the timers polyfill runtime lands, when the build emits one. */
  readonly timersRel?: string;
}

/**
 * How to respell each `require` an emitted chunk carries so it names the path
 * the build writes, keyed by the source-rooted spelling TSTL emits.
 *
 * The value side goes through the same `computeOutputRel` the writer uses —
 * passed in as `sources`/`companions` rather than re-derived — so the require
 * and the write cannot drift apart. A component resource is never on the require
 * path, so a script-kind source is addressed through its companion or not at
 * all.
 *
 * Two entries are deliberately omitted. One whose key equals its value changes
 * nothing, so a build with no `outDir` rewrites nothing and emits byte-identical
 * Lua. One whose mapped require does not round-trip to the output rel —
 * `luaLoadPath(mapped) !== outputRel`, which a dot in the source name or in the
 * `outDir` causes — would swap a reported break for a silent one: the
 * source-rooted require survives instead, and the existing dotted-name
 * diagnostic still fires against it.
 */
export function requireRewrites(input: RequireRewritesInput): Map<string, string> {
  const { sources, companions, lualibRel, timersRel } = input;
  const rewrites = new Map<string, string>();

  const add = (requirePath: string, outputRel: string): void => {
    const mapped = requirePathForRel(outputRel);
    if (mapped === requirePath || luaLoadPath(mapped) !== outputRel) {
      return;
    }
    rewrites.set(requirePath, mapped);
  };

  for (const [rel, outputRel] of Object.entries(sources)) {
    // A `.lua` output is the module itself; anything else is a component
    // resource, whose require-addressable half is its companion when it has one.
    const target = outputRel.endsWith(".lua") ? outputRel : companions[rel];
    if (target !== undefined) {
      add(requirePathForRel(rel), target);
    }
  }

  if (lualibRel !== undefined) {
    add(LUALIB_REQUIRE_NAME, lualibRel);
  }
  if (timersRel !== undefined) {
    add(TIMERS_REQUIRE_NAME, timersRel);
  }

  return rewrites;
}

/** Every chunk in a per-source map, rewritten against the same map. */
export function rewriteAll(
  chunks: Readonly<Record<string, string>>,
  rewrites: ReadonlyMap<string, string>,
): Record<string, string> {
  const rewritten: Record<string, string> = {};
  for (const [rel, lua] of Object.entries(chunks)) {
    rewritten[rel] = rewriteEmittedRequires(lua, rewrites);
  }
  return rewritten;
}

export interface RuntimeArtifact {
  /** What to call the artifact in a failure message; it has no source rel. */
  readonly label: string;
  /** The rel the build would write it to. */
  readonly outputRel: string;
}

/**
 * Fail the build on a generated runtime artifact no require can name.
 *
 * These two are the one silent half of the require/output agreement: they are
 * backed by no source, so `findUnresolvedRequires` never scans their chunks and
 * exempts their names besides. When the output rel does not round-trip through
 * the require rule — a dot in the `outDir` is kept in the path and underscored
 * in the require — the artifact is written where nothing can load it, so the
 * build says so and writes nothing instead.
 */
export function throwOnUnaddressableArtifacts(artifacts: readonly RuntimeArtifact[]): void {
  const entries = artifacts
    .filter(({ outputRel }) => luaLoadPath(requirePathForRel(outputRel)) !== outputRel)
    .map(({ label, outputRel }) => ({
      file: PROJECT_BUCKET,
      message: `${label} is written to ${outputRel}, which Defold reaches only as require("${requirePathForRel(outputRel)}") — no require names the path it lands at, so give outDir a name with no dot in it`,
    }));
  if (entries.length === 0) {
    return;
  }
  const formatted = entries.map(({ file, message }) => `  ${file}: ${message}`).join("\n");
  throw new BuildFailureError(
    `defold-typescript build: ${entries.length} unaddressable runtime artifact(s):\n${formatted}`,
    entries,
  );
}

export function findUnresolvedRequires(input: FindUnresolvedRequiresInput): UnresolvedRequire[] {
  const { lua, sources, plannedOutputs } = input;

  const sourceByRequirePath = new Map<string, string>();
  for (const rel of Object.keys(sources)) {
    sourceByRequirePath.set(requirePathForRel(rel), rel);
  }

  const plannedLuaOutputs = new Set(plannedOutputs.filter((rel) => rel.endsWith(".lua")));

  const findings: UnresolvedRequire[] = [];
  for (const importer of Object.keys(sources)) {
    const emitted = lua[importer];
    if (emitted === undefined) {
      continue;
    }
    for (const requirePath of findEmittedRequires(emitted)) {
      const target = sourceByRequirePath.get(requirePath);
      if (target === undefined) {
        continue;
      }
      const loadPath = luaLoadPath(requirePath);
      if (plannedLuaOutputs.has(loadPath)) {
        continue;
      }
      findings.push({
        importer,
        requirePath,
        target,
        expected: sources[target] ?? "",
        loadPath,
      });
    }
  }

  return findings;
}

// The two causes are told apart by the target's own output name rather than by
// re-deriving its kind: a `.lua` target is written, just not where the require
// looks, while any other suffix is a component resource that is never on the
// require path at all.
function describe(finding: UnresolvedRequire): string {
  const { requirePath, target, expected, loadPath } = finding;
  if (expected.endsWith(".lua")) {
    // Putting the output back through the require rule reproduces the load path
    // exactly when the only difference is a dot the require path underscored —
    // a source-name problem with a rename as its remedy, not an `outDir` one.
    if (luaLoadPath(requirePathForRel(expected)) === loadPath) {
      return `requires "${requirePath}", which Defold loads from ${loadPath}, but ${target} is written to ${expected} — a dot in the source name is kept in the output and underscored in the require, so rename the source`;
    }
    return `requires "${requirePath}", which Defold loads from ${loadPath}, but ${target} is written to ${expected}, which that require does not reach`;
  }
  return `requires "${requirePath}", but ${target} is written to ${expected}, a component resource Defold addresses from a .go file and never puts on the require path — move the shared value into a source with no lifecycle factory`;
}

/**
 * Fail the build on any emitted require that names a source the build owns but
 * resolves to no output it will write. Entries are file-scoped: the require is
 * recovered from emitted Lua, which carries no position back to the importing
 * statement.
 */
export function throwOnUnresolvedRequires(input: FindUnresolvedRequiresInput): void {
  const findings = findUnresolvedRequires(input);
  if (findings.length === 0) {
    return;
  }
  const entries = findings.map((finding) => ({
    file: finding.importer,
    message: describe(finding),
  }));
  const formatted = entries.map(({ file, message }) => `  ${file}: ${message}`).join("\n");
  throw new BuildFailureError(
    `defold-typescript build: ${entries.length} unresolvable require(s):\n${formatted}`,
    entries,
  );
}
