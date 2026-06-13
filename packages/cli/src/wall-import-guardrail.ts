import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findMainEntryFactoryImports } from "@defold-typescript/transpiler";
import { readBuildConfig, toPosix } from "./build-output";
import { scanFilesSync } from "./scan";
import { DEFAULT_TYPES_ENTRYPOINT, type ScriptKind } from "./script-kind";
import { currentWalledDirs, eligibleWalls } from "./wall";

export interface WallImportViolation {
  readonly file: string;
  readonly kind: ScriptKind;
  readonly factory: string;
  readonly expected: string;
}

function readSources(
  cwd: string,
  files: Record<string, string> | undefined,
): Record<string, string> {
  if (files !== undefined) {
    return files;
  }
  const sources: Record<string, string> = {};
  for (const pattern of readBuildConfig(cwd).include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      const rel = toPosix(match);
      if (rel.endsWith(".ts")) {
        sources[rel] = readFileSync(path.join(cwd, rel), "utf8");
      }
    }
  }
  return sources;
}

function isUnderDir(rel: string, dir: string): boolean {
  return rel.startsWith(`${dir}/`);
}

export function findWallImportViolations(
  cwd: string,
  files?: Record<string, string>,
): WallImportViolation[] {
  const walled = currentWalledDirs(cwd);
  const currentWalls = eligibleWalls(cwd).filter((wall) => walled.includes(wall.dir));
  if (currentWalls.length === 0) {
    return [];
  }
  const sources = readSources(cwd, files);
  const violations: WallImportViolation[] = [];
  for (const wall of currentWalls) {
    const expected = `${DEFAULT_TYPES_ENTRYPOINT}/${wall.kind}`;
    for (const [rel, source] of Object.entries(sources)) {
      if (!rel.endsWith(".ts") || !isUnderDir(rel, wall.dir)) {
        continue;
      }
      for (const factory of findMainEntryFactoryImports(rel, source)) {
        violations.push({ file: rel, kind: wall.kind, factory, expected });
      }
    }
  }
  return violations;
}
