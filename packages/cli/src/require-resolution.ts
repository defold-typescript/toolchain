import { findEmittedRequires, requirePathForRel } from "@defold-typescript/transpiler";
import { BuildFailureError } from "./build-output";

export interface UnresolvedRequire {
  /** The source whose emitted Lua carries the require. */
  readonly importer: string;
  /** The module path that require names. */
  readonly requirePath: string;
  /** The source in the program that require maps to. */
  readonly target: string;
  /** The output the build will actually write for that source. */
  readonly expected: string;
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
export function findUnresolvedRequires(input: FindUnresolvedRequiresInput): UnresolvedRequire[] {
  const { lua, sources, plannedOutputs } = input;

  const sourceByRequirePath = new Map<string, string>();
  for (const rel of Object.keys(sources)) {
    sourceByRequirePath.set(requirePathForRel(rel), rel);
  }

  const satisfiedRequirePaths = new Set<string>();
  for (const outputRel of plannedOutputs) {
    if (outputRel.endsWith(".lua")) {
      satisfiedRequirePaths.add(requirePathForRel(outputRel));
    }
  }

  const findings: UnresolvedRequire[] = [];
  for (const importer of Object.keys(sources)) {
    const emitted = lua[importer];
    if (emitted === undefined) {
      continue;
    }
    for (const requirePath of findEmittedRequires(emitted)) {
      const target = sourceByRequirePath.get(requirePath);
      if (target === undefined || satisfiedRequirePaths.has(requirePath)) {
        continue;
      }
      findings.push({
        importer,
        requirePath,
        target,
        expected: sources[target] ?? "",
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
  const { requirePath, target, expected } = finding;
  if (expected.endsWith(".lua")) {
    return `requires "${requirePath}", but ${target} is written to ${expected}, which that require does not reach`;
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
