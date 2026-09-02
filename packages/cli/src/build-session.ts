import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  createTranspileSession,
  type SceneComponentIndex,
  type TranspileProjectResult,
  type TranspileSession,
} from "@defold-typescript/transpiler";
import {
  type BuildConfig,
  collectFailures,
  computeOutputRel,
  detectSourceOutputKind,
  isTranspilerSource,
  lualibBundleRel,
  pruneAlternativeOutputs,
  readBuildConfig,
  retargetSourceRoot,
  throwIfFailures,
  timersModuleRel,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { scanOrphanOutputs } from "./orphan-scan";
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
    return scanUrlFragmentReachability({ program, index, table: loadUrlParameterTable() });
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

  function pruneOutputs(rel: string, keepRel?: string): void {
    pruneAlternativeOutputs(cwd, rel, config, keepRel);
  }

  function writeOutputs(
    result: TranspileProjectResult,
    keys: readonly string[],
    sources: Record<string, string>,
    pruneAlternatives = false,
  ): BuildResult {
    const failures = collectFailures(result.diagnostics);
    const written: string[] = [];
    for (const rel of keys) {
      if (failures.has(rel)) {
        continue;
      }
      const lua = result.lua[rel];
      if (lua === undefined) {
        continue;
      }
      const outputRel = computeOutputRel(rel, config, detectSourceOutputKind(sources[rel] ?? ""));
      if (pruneAlternatives) {
        pruneOutputs(rel, outputRel);
      }
      writeScriptFile(
        cwd,
        outputRel,
        lua,
        retargetSourceRoot(result.sourceMaps[rel], outputRel, rel),
      );
      written.push(outputRel);
    }
    if (result.lualib !== undefined) {
      const bundleRel = lualibBundleRel(config);
      writeScriptFile(cwd, bundleRel, result.lualib, undefined);
      written.push(bundleRel);
    }
    if (result.timersRuntime !== undefined) {
      const runtimeRel = timersModuleRel(config);
      writeScriptFile(cwd, runtimeRel, result.timersRuntime, undefined);
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
    const built = writeOutputs(result, sources, files, true);
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

    for (const rel of sourceRemoved) {
      pruneOutputs(rel);
    }

    const changedSources: Record<string, string> = {};
    for (const rel of sourceChanged) {
      changedSources[rel] = changes[rel] ?? "";
    }
    const built = writeOutputs(result, sourceChanged, changedSources, true);
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
