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
  computeScriptRel,
  detectSourceScriptKind,
  isTranspilerSource,
  readBuildConfig,
  throwIfFailures,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { scanFilesSync } from "./scan";
import type { ScriptKind } from "./script-kind";

const ALL_SCRIPT_KINDS: readonly ScriptKind[] = ["script", "gui-script", "render-script"];

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

  function writeOutputs(
    result: TranspileProjectResult,
    keys: readonly string[],
    sources: Record<string, string>,
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
      const scriptRel = computeScriptRel(rel, config, detectSourceScriptKind(sources[rel] ?? ""));
      writeScriptFile(cwd, scriptRel, lua, result.sourceMaps[rel]);
      written.push(scriptRel);
    }
    throwIfFailures(failures);
    return { written };
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

    // The removed file is gone, so its prior factory-derived kind is unknown;
    // sweep every candidate suffix to avoid orphaning an output.
    for (const rel of sourceRemoved) {
      for (const kind of ALL_SCRIPT_KINDS) {
        const scriptAbs = path.join(cwd, computeScriptRel(rel, config, kind));
        rmSync(scriptAbs, { force: true });
        rmSync(`${scriptAbs}.map`, { force: true });
      }
    }

    const changedSources: Record<string, string> = {};
    for (const rel of sourceChanged) {
      changedSources[rel] = changes[rel] ?? "";
    }
    return writeOutputs(result, sourceChanged, changedSources);
  }

  return { buildAll, applyEvents };
}
