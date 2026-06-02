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
  computeLuaRel,
  isTranspilerSource,
  readBuildConfig,
  throwIfFailures,
  toPosix,
  writeLuaFile,
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

  function writeOutputs(result: TranspileProjectResult, keys: readonly string[]): BuildResult {
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
      const luaRel = computeLuaRel(rel, config);
      writeLuaFile(cwd, luaRel, lua, result.sourceMaps[rel]);
      written.push(luaRel);
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
    return writeOutputs(result, sources);
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
      const luaAbs = path.join(cwd, computeLuaRel(rel, config));
      rmSync(luaAbs, { force: true });
      rmSync(`${luaAbs}.map`, { force: true });
    }

    return writeOutputs(result, sourceChanged);
  }

  return { buildAll, applyEvents };
}
