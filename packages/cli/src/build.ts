import { readFileSync } from "node:fs";
import * as path from "node:path";
import { createTranspileSession, type SceneComponentIndex } from "@defold-typescript/transpiler";
import {
  collectFailures,
  computeOutputRel,
  detectSourceOutputKind,
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
import { scanUrlFragmentReachability, type UnreachableAddressEntry } from "./url-reachability-scan";
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
}

export interface RunBuildResult {
  readonly written: string[];
  readonly warnings: string[];
  /** The unreachable addresses `warnings` also names in prose. */
  readonly unreachableAddresses: UnreachableAddressEntry[];
}

export function runBuild(opts: RunBuildOptions): RunBuildResult {
  const { cwd, sceneIndex } = opts;
  const config = readBuildConfig(cwd);

  const seen = new Set<string>();
  for (const pattern of config.include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      seen.add(toPosix(match));
    }
  }
  const sources = [...seen].sort();

  if (sources.length === 0) {
    return { written: [], warnings: [], unreachableAddresses: [] };
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

  const written: string[] = [];
  for (const rel of sources) {
    if (failures.has(rel)) {
      continue;
    }
    const lua = result.lua[rel];
    if (!lua) {
      continue;
    }
    const outputRel = computeOutputRel(rel, config, detectSourceOutputKind(files[rel] ?? ""));
    pruneAlternativeOutputs(cwd, rel, config, outputRel);
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
  const program = session.getProgram();
  const reachability =
    sceneIndex && program
      ? scanUrlFragmentReachability({ program, index: sceneIndex, table: loadUrlParameterTable() })
      : { warnings: [], entries: [] };
  const warnings = [
    ...scanOrphanOutputs(cwd, sources, config),
    ...scanSceneResourceRefs(cwd),
    ...reachability.warnings,
  ];
  return { written: written.sort(), warnings, unreachableAddresses: reachability.entries };
}
