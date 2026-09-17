import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  createTranspileSession,
  rewriteEmittedRequires,
  type SceneComponentIndex,
  type SceneObjectComponents,
  type TranspileProjectResult,
  type TranspileSession,
} from "@defold-typescript/transpiler";
import {
  type BuildConfig,
  collectFailures,
  computeOutputRel,
  detectSourceOutputKind,
  isTranspilerSource,
  LUALIB_BUNDLE_LABEL,
  lualibBundleRel,
  pruneAlternativeOutputs,
  readBuildConfig,
  retargetSourceRoot,
  TIMERS_RUNTIME_LABEL,
  throwIfFailures,
  timersModuleRel,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { findCompanionExports, throwOnCompanionViolations } from "./companion-violations";
import { scanOrphanOutputs } from "./orphan-scan";
import {
  companionClaimant,
  companionOutputRels,
  createOutputClaimRegistry,
  runtimeArtifactClaimant,
} from "./output-claims";
import {
  requireRewrites,
  rewriteAll,
  throwOnUnaddressableArtifacts,
  throwOnUnresolvedRequires,
} from "./require-resolution";
import { scanFilesSync } from "./scan";
import { scanSceneResourceRefs } from "./scene-resource-scan";
import { loadUrlParameterTable } from "./url-parameter-table";
import {
  type CrossWorldAddressEntry,
  scanCrossWorldAddresses,
  scanUrlFragmentReachability,
  type UnreachableAddressEntry,
} from "./url-reachability-scan";

export interface CreateBuildSessionOptions {
  readonly cwd: string;
  /**
   * The component-id universe `#fragment` addresses are checked against, or
   * `undefined` when there is nothing to check against.
   *
   * A getter rather than a value: a watch regenerates the universe whenever a
   * `.go`/`.collection` is saved, and a snapshot taken when the session was
   * created would keep reporting a fragment the author has since declared.
   */
  readonly sceneIndex?: () => SceneComponentIndex | undefined;
  /**
   * Which worlds each source file's script runs in, or `undefined` when the
   * caller has read no scenes.
   *
   * A getter for the same reason `sceneIndex` is: a `.collection` save can move
   * the world a script runs in, and a snapshot taken when the session was
   * created would keep reporting an address the author has since made correct.
   */
  readonly scriptWorlds?: () => ((fileName: string) => readonly (string | undefined)[]) | undefined;
  /**
   * Which objects exist in which world and what each declares, so an absolute
   * `#fragment` is checked against the object it names.
   *
   * A getter for the same reason `sceneIndex` is: a `.go` save changes which
   * components an object owns, and a snapshot would keep reporting a component
   * the author has since added.
   */
  readonly sceneObjects?: () => SceneObjectComponents | undefined;
}

export interface BuildResult {
  readonly written: string[];
  readonly warnings: string[];
  /** The unreachable addresses `warnings` also names in prose. */
  readonly unreachableAddresses: UnreachableAddressEntry[];
  /** The foreign-world addresses `warnings` also names in prose. */
  readonly crossWorldAddresses: CrossWorldAddressEntry[];
}

export interface BuildSession {
  buildAll(): BuildResult;
  applyEvents(changed: string[], removed: string[]): BuildResult;
  /**
   * Re-check the standing program's addresses against the current universe
   * without building: a scene save changes the universe but advances no
   * program, so there is nothing to compile and nothing to emit.
   */
  rescanReachability(): Pick<
    BuildResult,
    "warnings" | "unreachableAddresses" | "crossWorldAddresses"
  >;
}

export function createBuildSession(opts: CreateBuildSessionOptions): BuildSession {
  const { cwd } = opts;
  const config: BuildConfig = readBuildConfig(cwd);
  const session: TranspileSession = createTranspileSession();

  // The whole program's source text, carried across rebuilds. `applyEvents`
  // holds only the changed files, and the require check gets a false negative
  // from a partial inventory in either direction: an untouched script-kind
  // target reads as external library Lua, and an output written on an earlier
  // rebuild reads as never written.
  const sourceTexts = new Map<string, string>();

  function plannedOutputBySource(): Record<string, string> {
    const outputs: Record<string, string> = {};
    for (const [rel, text] of sourceTexts) {
      outputs[rel] = computeOutputRel(rel, config, detectSourceOutputKind(text));
    }
    return outputs;
  }

  // Over the whole program rather than the rebuild's event batch, for the same
  // reason the reachability scan is: an edit to one source can make another's
  // split unsound, and a narrowed scan would report it as still fine.
  function scriptKindSources(): string[] {
    const scripts: string[] = [];
    for (const [rel, text] of sourceTexts) {
      if (detectSourceOutputKind(text) !== "module") {
        scripts.push(rel);
      }
    }
    return scripts;
  }

  // Deliberately over the whole program rather than over the files an
  // incremental rebuild happened to touch: a fragment goes bad when the scenes
  // change as readily as when its own file does, and narrowing the scan would
  // report a still-broken address as fixed because nobody edited it.
  function scanReachability(): { warnings: string[]; entries: UnreachableAddressEntry[] } {
    const index = opts.sceneIndex?.();
    const program = session.getProgram();
    if (!index || !program) {
      return { warnings: [], entries: [] };
    }
    const sceneObjects = opts.sceneObjects?.();
    return scanUrlFragmentReachability({
      program,
      index,
      table: loadUrlParameterTable(),
      ...(sceneObjects !== undefined ? { sceneObjects } : {}),
    });
  }

  // Its own scan, walked over the whole program for the reason above: the
  // fragment check suppresses on an incomplete component universe, and a shared
  // early return would silence this one on a hole it does not depend on.
  function scanCrossWorld(): { warnings: string[]; entries: CrossWorldAddressEntry[] } {
    const worldsOf = opts.scriptWorlds?.();
    const program = session.getProgram();
    if (!worldsOf || !program) {
      return { warnings: [], entries: [] };
    }
    return scanCrossWorldAddresses({ program, worldsOf, table: loadUrlParameterTable() });
  }

  function pruneOutputs(rel: string, keep: readonly string[] = []): void {
    pruneAlternativeOutputs(cwd, rel, config, keep);
  }

  // `keys` is what this pass writes; the text every rel is judged by comes from
  // `sourceTexts`, which already holds the standing program and is what the
  // claim inventory below walks.
  function writeOutputs(
    result: TranspileProjectResult,
    keys: readonly string[],
    pruneAlternatives = false,
  ): BuildResult {
    const failures = collectFailures(result.diagnostics);
    const companionBySource = companionOutputRels(result, config);
    const scriptSources = scriptKindSources();
    const outputs = plannedOutputBySource();

    // The watch path rewrites the same chunks `runBuild` does, and for the same
    // reason: an incremental rebuild writes companions and generated runtimes
    // that the resolution check never scans.
    const rewrites = requireRewrites({
      sources: outputs,
      companions: companionBySource,
      ...(result.lualib !== undefined ? { lualibRel: lualibBundleRel(config) } : {}),
      ...(result.timersRuntime !== undefined ? { timersRel: timersModuleRel(config) } : {}),
    });
    const luaBySource = rewriteAll(result.lua, rewrites);
    const companionLuaBySource = rewriteAll(result.companions ?? {}, rewrites);
    const lualib =
      result.lualib === undefined ? undefined : rewriteEmittedRequires(result.lualib, rewrites);
    const timersRuntime =
      result.timersRuntime === undefined
        ? undefined
        : rewriteEmittedRequires(result.timersRuntime, rewrites);

    if (failures.size === 0) {
      // Violations first, for the reason `runBuild` runs them first: an
      // unsplittable source emits no companion, and its importer's unresolvable
      // require is the symptom rather than the diagnosis.
      const program = session.getProgram();
      if (program) {
        throwOnCompanionViolations({ program, scriptSources });
      }
      throwOnUnresolvedRequires({
        lua: luaBySource,
        sources: outputs,
        plannedOutputs: Object.entries(outputs).flatMap(([rel, outputRel]) => {
          if (luaBySource[rel] === undefined) {
            return [];
          }
          const companionRel = companionBySource[rel];
          return companionRel === undefined ? [outputRel] : [outputRel, companionRel];
        }),
      });
      throwOnUnaddressableArtifacts([
        ...(lualib !== undefined
          ? [{ label: LUALIB_BUNDLE_LABEL, outputRel: lualibBundleRel(config) }]
          : []),
        ...(timersRuntime !== undefined
          ? [{ label: TIMERS_RUNTIME_LABEL, outputRel: timersModuleRel(config) }]
          : []),
      ]);
    }

    // Claimed before anything is written, for the reason `runBuild` claims
    // first: a contested path must fail with its own file byte-unchanged.
    const writable = keys.filter((rel) => !failures.has(rel) && luaBySource[rel] !== undefined);
    const claims = createOutputClaimRegistry(cwd);
    const claimProgram = session.getProgram();
    const exportsBySource = claimProgram
      ? findCompanionExports({ program: claimProgram, scriptSources })
      : new Map<string, readonly string[]>();

    // Ahead of the source claims, so a source landing on an artifact's rel is
    // reported against the artifact as the incumbent.
    if (lualib !== undefined) {
      claims.claim(lualibBundleRel(config), runtimeArtifactClaimant(LUALIB_BUNDLE_LABEL));
    }
    if (timersRuntime !== undefined) {
      claims.claim(timersModuleRel(config), runtimeArtifactClaimant(TIMERS_RUNTIME_LABEL));
    }

    // Over the whole standing program rather than this rebuild's event batch,
    // for the same reason the reachability scan is: another source's output is
    // contested by what this rebuild compiles, and `session.update` re-emits
    // every source, so `result` already carries the Lua to judge it by. The
    // write set below stays on `keys`, so claiming more never writes more.
    const outputRelBySource = new Map<string, string>();
    for (const [rel, text] of sourceTexts) {
      if (failures.has(rel) || luaBySource[rel] === undefined) {
        continue;
      }
      const outputRel = computeOutputRel(rel, config, detectSourceOutputKind(text));
      outputRelBySource.set(rel, outputRel);
      claims.claim(outputRel, { source: rel });
      const companionRel = companionBySource[rel];
      if (companionRel !== undefined) {
        claims.claim(companionRel, companionClaimant(rel, result, exportsBySource));
      }
    }
    claims.throwOnCollisions();

    const written: string[] = [];
    for (const rel of writable) {
      const lua = luaBySource[rel];
      const outputRel = outputRelBySource.get(rel);
      if (lua === undefined || outputRel === undefined) {
        continue;
      }
      const companionRel = companionBySource[rel];
      const companion = companionLuaBySource[rel];
      if (pruneAlternatives) {
        pruneOutputs(rel, companionRel === undefined ? [outputRel] : [outputRel, companionRel]);
      }
      writeScriptFile(
        cwd,
        outputRel,
        lua,
        retargetSourceRoot(result.sourceMaps[rel], outputRel, rel),
      );
      written.push(outputRel);
      if (companionRel !== undefined && companion !== undefined) {
        writeScriptFile(cwd, companionRel, companion, undefined);
        written.push(companionRel);
      }
    }
    if (lualib !== undefined) {
      const bundleRel = lualibBundleRel(config);
      writeScriptFile(cwd, bundleRel, lualib, undefined);
      written.push(bundleRel);
    }
    if (timersRuntime !== undefined) {
      const runtimeRel = timersModuleRel(config);
      writeScriptFile(cwd, runtimeRel, timersRuntime, undefined);
      written.push(runtimeRel);
    }
    throwIfFailures(failures);
    return {
      written: written.sort(),
      warnings: [],
      unreachableAddresses: [],
      crossWorldAddresses: [],
    };
  }

  function buildAll(): BuildResult {
    const seen = new Set<string>();
    for (const pattern of config.include) {
      for (const match of scanFilesSync(cwd, pattern)) {
        seen.add(toPosix(match));
      }
    }
    const sources = [...seen].sort();
    if (sources.length === 0) {
      return { written: [], warnings: [], unreachableAddresses: [], crossWorldAddresses: [] };
    }

    const files: Record<string, string> = {};
    for (const rel of sources) {
      files[rel] = readFileSync(path.join(cwd, rel), "utf8");
    }

    const result = session.update(files);
    sourceTexts.clear();
    for (const rel of sources) {
      sourceTexts.set(rel, files[rel] ?? "");
    }
    const built = writeOutputs(result, sources, true);
    const reachability = scanReachability();
    const crossWorld = scanCrossWorld();
    return {
      written: built.written,
      warnings: [
        ...scanOrphanOutputs(cwd, sources, config),
        ...scanSceneResourceRefs(cwd),
        ...reachability.warnings,
        ...crossWorld.warnings,
      ],
      unreachableAddresses: reachability.entries,
      crossWorldAddresses: crossWorld.entries,
    };
  }

  function applyEvents(changed: string[], removed: string[]): BuildResult {
    const sourceChanged = changed.filter(isTranspilerSource);
    const sourceRemoved = removed.filter(isTranspilerSource);
    const changes: Record<string, string | null> = {};
    for (const rel of sourceChanged) {
      changes[rel] = readFileSync(path.join(cwd, rel), "utf8");
    }
    for (const rel of sourceRemoved) {
      changes[rel] = null;
    }

    const result = session.update(changes);

    for (const rel of sourceChanged) {
      sourceTexts.set(rel, changes[rel] ?? "");
    }
    for (const rel of sourceRemoved) {
      sourceTexts.delete(rel);
    }

    for (const rel of sourceRemoved) {
      pruneOutputs(rel);
    }

    const built = writeOutputs(result, sourceChanged, true);
    const reachability = scanReachability();
    const crossWorld = scanCrossWorld();
    return {
      written: built.written,
      warnings: [...reachability.warnings, ...crossWorld.warnings],
      unreachableAddresses: reachability.entries,
      crossWorldAddresses: crossWorld.entries,
    };
  }

  function rescanReachability(): Pick<
    BuildResult,
    "warnings" | "unreachableAddresses" | "crossWorldAddresses"
  > {
    const reachability = scanReachability();
    const crossWorld = scanCrossWorld();
    return {
      warnings: [...reachability.warnings, ...crossWorld.warnings],
      unreachableAddresses: reachability.entries,
      crossWorldAddresses: crossWorld.entries,
    };
  }

  return { buildAll, applyEvents, rescanReachability };
}
