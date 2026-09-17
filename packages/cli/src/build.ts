import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  createTranspileSession,
  type SceneComponentIndex,
  type SceneObjectComponents,
} from "@defold-typescript/transpiler";
import {
  collectFailures,
  computeOutputRel,
  detectSourceOutputKind,
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
import { throwOnUnresolvedRequires } from "./require-resolution";
import { scanFilesSync } from "./scan";
import { scanSceneResourceRefs } from "./scene-resource-scan";
import { loadUrlParameterTable } from "./url-parameter-table";
import {
  type CrossWorldAddressEntry,
  scanCrossWorldAddresses,
  scanUrlFragmentReachability,
  type UnreachableAddressEntry,
} from "./url-reachability-scan";
import { findWallImportViolations } from "./wall-import-guardrail";

function throwOnWallImportViolations(cwd: string, files: Record<string, string>): void {
  const violations = findWallImportViolations(cwd, files);
  if (violations.length === 0) {
    return;
  }
  const lines = violations.map(
    (v) =>
      `  ${v.file}: imports ${v.factory} from "@defold-typescript/types" — a walled ${v.kind} source must import it from "${v.expected}"`,
  );
  throw new Error(
    `defold-typescript build: wall bypass — a walled source imports a lifecycle factory off the main entry, which re-pulls the cross-kind ambient globals the wall removes:\n${lines.join(
      "\n",
    )}`,
  );
}

export interface RunBuildOptions {
  readonly cwd: string;
  /**
   * The component-id universe the build checks `#fragment` addresses against,
   * with every hole the caller knows about folded into its `incomplete`.
   * Optional: a caller that has not read the project's scenes gets the build it
   * always got, with no reachability warnings either way.
   */
  readonly sceneIndex?: SceneComponentIndex;
  /**
   * Which worlds each source file's script runs in. Optional for the same
   * reason `sceneIndex` is: a caller that has not read the project's scenes
   * cannot say where a script runs, and gets no cross-world warnings either way.
   */
  readonly scriptWorlds?: (fileName: string) => readonly (string | undefined)[];
  /**
   * Which objects exist in which world and what each declares, so an absolute
   * `#fragment` address is checked against the object it names. Optional for the
   * same reason `sceneIndex` is.
   */
  readonly sceneObjects?: SceneObjectComponents;
}

export interface RunBuildResult {
  readonly written: string[];
  readonly warnings: string[];
  /** The unreachable addresses `warnings` also names in prose. */
  readonly unreachableAddresses: UnreachableAddressEntry[];
  /** The foreign-world addresses `warnings` also names in prose. */
  readonly crossWorldAddresses: CrossWorldAddressEntry[];
}

export function runBuild(opts: RunBuildOptions): RunBuildResult {
  const { cwd, sceneIndex, sceneObjects, scriptWorlds } = opts;
  const config = readBuildConfig(cwd);

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

  throwOnWallImportViolations(cwd, files);

  // A session rather than `transpileProject`: the one-shot entry never surfaces
  // a `ts.Program`, and the reachability check needs one. Its compiler options
  // are kept in lockstep with `transpileProject`'s, which
  // `session.test.ts`'s output-equivalence cases are what hold.
  const session = createTranspileSession();
  const result = session.update(files);
  const failures = collectFailures(result.diagnostics);

  const outputBySource: Record<string, string> = {};
  const scriptSources: string[] = [];
  for (const rel of sources) {
    const kind = detectSourceOutputKind(files[rel] ?? "");
    outputBySource[rel] = computeOutputRel(rel, config, kind);
    if (kind !== "module") {
      scriptSources.push(rel);
    }
  }
  const companionBySource = companionOutputRels(result, config);

  // Before the write loop, so a build whose requires cannot resolve leaves no
  // half-correct output behind. Skipped while the program has type errors: the
  // emit is already untrustworthy there and the diagnostics are the real report.
  if (failures.size === 0) {
    // Violations first: an unsplittable source emits no companion, so an
    // importer of it also reports an unresolvable require. The violation names
    // the member and both positions, which is the diagnosis; the require error
    // would only name the symptom.
    const preEmitProgram = session.getProgram();
    if (preEmitProgram) {
      throwOnCompanionViolations({ program: preEmitProgram, scriptSources });
    }
    throwOnUnresolvedRequires({
      lua: result.lua,
      sources: outputBySource,
      plannedOutputs: sources.flatMap((rel) => {
        const outputRel = outputBySource[rel];
        if (outputRel === undefined || result.lua[rel] === undefined) {
          return [];
        }
        const companionRel = companionBySource[rel];
        return companionRel === undefined ? [outputRel] : [outputRel, companionRel];
      }),
    });
  }

  // Every output path is claimed before anything is written, so a contested path
  // fails the build with its own file byte-unchanged rather than half a tree
  // behind.
  const claims = createOutputClaimRegistry(cwd);
  const claimProgram = session.getProgram();
  const exportsBySource = claimProgram
    ? findCompanionExports({ program: claimProgram, scriptSources })
    : new Map<string, readonly string[]>();
  // Ahead of the source claims, so a source landing on an artifact's rel is
  // reported against the artifact as the incumbent.
  if (result.lualib !== undefined) {
    claims.claim(lualibBundleRel(config), runtimeArtifactClaimant(LUALIB_BUNDLE_LABEL));
  }
  if (result.timersRuntime !== undefined) {
    claims.claim(timersModuleRel(config), runtimeArtifactClaimant(TIMERS_RUNTIME_LABEL));
  }
  const writable = sources.filter((rel) => !failures.has(rel) && Boolean(result.lua[rel]));
  for (const rel of writable) {
    const outputRel = outputBySource[rel];
    if (outputRel !== undefined) {
      claims.claim(outputRel, { source: rel });
    }
    const companionRel = companionBySource[rel];
    if (companionRel !== undefined) {
      claims.claim(companionRel, companionClaimant(rel, result, exportsBySource));
    }
  }
  claims.throwOnCollisions();

  const written: string[] = [];
  for (const rel of writable) {
    const lua = result.lua[rel];
    const outputRel = outputBySource[rel];
    if (lua === undefined || outputRel === undefined) {
      continue;
    }
    const companionRel = companionBySource[rel];
    const companion = result.companions?.[rel];
    pruneAlternativeOutputs(
      cwd,
      rel,
      config,
      companionRel === undefined ? [outputRel] : [outputRel, companionRel],
    );
    writeScriptFile(
      cwd,
      outputRel,
      lua,
      retargetSourceRoot(result.sourceMaps[rel], outputRel, rel),
    );
    written.push(outputRel);
    if (companionRel !== undefined && companion !== undefined) {
      // No map: the companion is assembled from statements the script no longer
      // holds, so a map would point a debugger at a chunk that does not exist.
      writeScriptFile(cwd, companionRel, companion, undefined);
      written.push(companionRel);
    }
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
  const program = session.getProgram();
  const reachability =
    sceneIndex && program
      ? scanUrlFragmentReachability({
          program,
          index: sceneIndex,
          table: loadUrlParameterTable(),
          ...(sceneObjects !== undefined ? { sceneObjects } : {}),
        })
      : { warnings: [], entries: [] };
  const crossWorld =
    scriptWorlds && program
      ? scanCrossWorldAddresses({ program, worldsOf: scriptWorlds, table: loadUrlParameterTable() })
      : { warnings: [], entries: [] };
  const warnings = [
    ...scanOrphanOutputs(cwd, sources, config),
    ...scanSceneResourceRefs(cwd),
    ...reachability.warnings,
    ...crossWorld.warnings,
  ];
  return {
    written: written.sort(),
    warnings,
    unreachableAddresses: reachability.entries,
    crossWorldAddresses: crossWorld.entries,
  };
}
