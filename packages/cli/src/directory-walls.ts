import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { detectSourceScriptKind, isTranspilerSource, readBuildConfig } from "./build-output";
import { scanFilesSync } from "./scan";
import {
  excludedModulesForKind,
  isSkipped,
  type ScriptKind,
  selectDirectoryWalls,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

export interface DirectoryWall {
  readonly dir: string;
  readonly kind: ScriptKind;
  readonly excludedModules: Set<string>;
  readonly typesEntrypoint: string;
}

function describeWall(dir: string, kind: ScriptKind): DirectoryWall {
  return {
    dir,
    kind,
    excludedModules: excludedModulesForKind(kind),
    typesEntrypoint: selectScriptKindEntrypoint(new Set([kind])),
  };
}

export function planDirectoryWalls(cwd: string): DirectoryWall[] {
  return [...selectDirectoryWalls(cwd)]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dir, kind]) => describeWall(dir, kind));
}

export function groupSourceScriptKindsByDirectory(cwd: string): Map<string, Set<ScriptKind>> {
  const byDir = new Map<string, Set<ScriptKind>>();
  const seen = new Set<string>();
  for (const pattern of readBuildConfig(cwd).include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      const rel = match.split(path.sep).join("/");
      if (seen.has(rel) || !isTranspilerSource(rel) || isSkipped(rel)) {
        continue;
      }
      seen.add(rel);
      const kind = detectSourceScriptKind(readFileSync(path.join(cwd, match), "utf8"));
      const dir = path.posix.dirname(rel);
      let set = byDir.get(dir);
      if (set === undefined) {
        set = new Set<ScriptKind>();
        byDir.set(dir, set);
      }
      set.add(kind);
    }
  }
  return byDir;
}

export function planSourceDirectoryWalls(cwd: string): DirectoryWall[] {
  const walls: DirectoryWall[] = [];
  for (const [dir, kinds] of groupSourceScriptKindsByDirectory(cwd)) {
    const kind = selectScriptKind(kinds);
    if (kind !== null) {
      walls.push(describeWall(dir, kind));
    }
  }
  return walls.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

interface WallTsconfig {
  readonly extends: string;
  readonly compilerOptions: { readonly types: string[] };
}

export function directoryWallTsconfig(wall: DirectoryWall): WallTsconfig {
  const depth = wall.dir.split("/").length;
  return {
    extends: `${"../".repeat(depth)}tsconfig.json`,
    compilerOptions: { types: [wall.typesEntrypoint] },
  };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeDirectoryWallTsconfigs(cwd: string, walls: DirectoryWall[]): string[] {
  const written: string[] = [];
  for (const w of walls) {
    if (w.dir === ".") {
      continue;
    }
    const rel = `${w.dir}/tsconfig.json`;
    const target = path.join(cwd, w.dir, "tsconfig.json");
    const desired = directoryWallTsconfig(w);
    if (existsSync(target)) {
      const current = JSON.parse(readFileSync(target, "utf8")) as {
        extends?: string;
        compilerOptions?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const options = current.compilerOptions ?? {};
      // Skip the write when already narrowed so a consumer's formatting is not
      // churned to JSON.stringify's layout on every build.
      const alreadyNarrowed =
        current.extends === desired.extends &&
        JSON.stringify(options.types) === JSON.stringify(desired.compilerOptions.types);
      if (!alreadyNarrowed) {
        writeJson(target, {
          ...current,
          extends: desired.extends,
          compilerOptions: { ...options, types: desired.compilerOptions.types },
        });
        written.push(rel);
      }
    } else {
      writeJson(target, desired);
      written.push(rel);
    }
  }
  return written.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
