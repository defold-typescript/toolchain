import { readFileSync } from "node:fs";
import * as path from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import {
  collectFailures,
  computeScriptRel,
  readBuildConfig,
  throwIfFailures,
  toPosix,
  writeScriptFile,
} from "./build-output";
import { scanFilesSync } from "./scan";

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
    const scriptRel = computeScriptRel(rel, config);
    writeScriptFile(cwd, scriptRel, lua, result.sourceMaps[rel]);
    written.push(scriptRel);
  }

  throwIfFailures(failures);
  return { written };
}
