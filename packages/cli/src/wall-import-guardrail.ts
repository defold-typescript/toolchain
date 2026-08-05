import { readFileSync } from "node:fs";
import * as path from "node:path";
import { findMainEntryFactoryImports } from "@defold-typescript/transpiler";
import { readBuildConfig, toPosix } from "./build-output";
import { nearestWall } from "./directory-walls";
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
  // Per file, not per wall: nested walls enclose the same sources, and a file is
  // judged against the one kind that actually governs it.
  for (const [rel, source] of Object.entries(sources)) {
    if (!rel.endsWith(".ts")) {
      continue;
    }
    const wall = nearestWall(rel, currentWalls);
    if (wall === null) {
      continue;
    }
    const expected = `${DEFAULT_TYPES_ENTRYPOINT}/${wall.kind}`;
    for (const factory of findMainEntryFactoryImports(rel, source)) {
      violations.push({ file: rel, kind: wall.kind, factory, expected });
    }
  }
  return violations.sort((a, b) =>
    a.file === b.file
      ? a.factory < b.factory
        ? -1
        : a.factory > b.factory
          ? 1
          : 0
      : a.file < b.file
        ? -1
        : 1,
  );
}
