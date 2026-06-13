import { readFileSync } from "node:fs";
import * as path from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import {
  collectFailures,
  computeOutputRel,
  detectSourceOutputKind,
  lualibBundleRel,
  readBuildConfig,
  throwIfFailures,
  timersModuleRel,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { scanFilesSync } from "./scan";
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
}

export interface RunBuildResult {
  readonly written: string[];
}

export function runBuild(opts: RunBuildOptions): RunBuildResult {
  const { cwd } = opts;
  const config = readBuildConfig(cwd);

  const seen = new Set<string>();
  for (const pattern of config.include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      seen.add(toPosix(match));
    }
  }
  const sources = [...seen].sort();

  if (sources.length === 0) {
    return { written: [] };
  }

  const files: Record<string, string> = {};
  for (const rel of sources) {
    files[rel] = readFileSync(path.join(cwd, rel), "utf8");
  }

  throwOnWallImportViolations(cwd, files);

  const result = transpileProject({ files });
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
    writeScriptFile(cwd, outputRel, lua, result.sourceMaps[rel]);
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
  return { written: written.sort() };
}
