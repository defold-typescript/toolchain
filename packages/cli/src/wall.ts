import { existsSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
  type DirectoryWall,
  planSourceDirectoryWalls,
  wireWallReferences,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";

function sortDirs<T extends { dir: string }>(items: T[]): T[] {
  return items.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

// The directories the root tsconfig currently walls — its managed `references`
// set, which `wireWallReferences` keeps in lockstep with the walls on disk.
export function currentWalledDirs(cwd: string): string[] {
  const rootPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(rootPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(rootPath, "utf8")) as {
      references?: Array<{ path: string }>;
    };
    return (parsed.references ?? [])
      .map((ref) => ref.path)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch {
    return [];
  }
}

// The single-kind source directories that can be walled, each with its detected
// kind. Mixed-kind directories are absent (no single narrowing applies).
export function eligibleWalls(cwd: string): DirectoryWall[] {
  return planSourceDirectoryWalls(cwd);
}

// Reconcile the on-disk wall set to `desiredDirs`: write a composite tsconfig for
// each desired wall, delete the child tsconfig of every currently-walled dir not
// desired, and re-wire the root references/exclude/files to exactly the desired
// set. Idempotent and total — the same engine backs `wall <dir...>`,
// `wall --remove <dir...>`, and the interactive checkbox.
export function applyWallSelection(cwd: string, desiredDirs: readonly string[]): DirectoryWall[] {
  const byDir = new Map(eligibleWalls(cwd).map((wall) => [wall.dir, wall]));
  const desired: DirectoryWall[] = [];
  const desiredSet = new Set<string>();
  for (const dir of desiredDirs) {
    if (desiredSet.has(dir)) {
      continue;
    }
    const wall = byDir.get(dir);
    if (wall === undefined) {
      throw new Error(
        `defold-typescript wall: ${dir} is not a single-kind source directory that can be walled`,
      );
    }
    desired.push(wall);
    desiredSet.add(dir);
  }

  for (const dir of currentWalledDirs(cwd)) {
    if (!desiredSet.has(dir)) {
      rmSync(path.join(cwd, dir, "tsconfig.json"), { force: true });
    }
  }

  writeDirectoryWallTsconfigs(cwd, desired);
  wireWallReferences(cwd, desired);
  return sortDirs(desired);
}

// Slice F replaces this with the `@inquirer/prompts` checkbox. Until then the
// bare `wall` invocation on a TTY has nowhere to go.
export function runWallInteractive(_cwd: string): Promise<DirectoryWall[]> {
  throw new Error("interactive menu not wired");
}
