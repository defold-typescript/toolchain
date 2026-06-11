import { readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
  createTranspileSession,
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
  outputRelsForSource,
  readBuildConfig,
  throwIfFailures,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { scanFilesSync } from "./scan";

export interface CreateBuildSessionOptions {
  readonly cwd: string;
}

export interface BuildResult {
  readonly written: string[];
}

export interface BuildSession {
  buildAll(): BuildResult;
  applyEvents(changed: string[], removed: string[]): BuildResult;
}

export function createBuildSession(opts: CreateBuildSessionOptions): BuildSession {
  const { cwd } = opts;
  const config: BuildConfig = readBuildConfig(cwd);
  const session: TranspileSession = createTranspileSession();

  function pruneOutputs(rel: string, keepRel?: string): void {
    for (const outputRel of outputRelsForSource(rel, config)) {
      if (outputRel !== keepRel && outputRel !== `${keepRel}.map`) {
        rmSync(path.join(cwd, outputRel), { force: true });
      }
    }
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
      writeScriptFile(cwd, outputRel, lua, result.sourceMaps[rel]);
      written.push(outputRel);
    }
    if (result.lualib !== undefined) {
      const bundleRel = lualibBundleRel(config);
      writeScriptFile(cwd, bundleRel, result.lualib, undefined);
      written.push(bundleRel);
    }
    throwIfFailures(failures);
    return { written: written.sort() };
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
      return { written: [] };
    }

    const files: Record<string, string> = {};
    for (const rel of sources) {
      files[rel] = readFileSync(path.join(cwd, rel), "utf8");
    }

    const result = session.update(files);
    return writeOutputs(result, sources, files);
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
    return writeOutputs(result, sourceChanged, changedSources, true);
  }

  return { buildAll, applyEvents };
}
