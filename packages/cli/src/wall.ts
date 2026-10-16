import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import {
  type DirectoryWall,
  PINNED_KIND_SUBPATHS,
  planSourceDirectoryWalls,
  resolveActivePinnedSurface,
  wireWallRoot,
  writeDirectoryWallTsconfigs,
} from "./directory-walls";

function sortDirs<T extends { dir: string }>(items: T[]): T[] {
  return items.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

export interface WallConfig {
  readonly dir: string;
  readonly kind: string;
  // True when the wall still carries the earlier release's composite shape.
  readonly composite: boolean;
}

function readWallConfig(cwd: string, dir: string): WallConfig | null {
  let parsed: { extends?: unknown; compilerOptions?: { types?: unknown; composite?: unknown } };
  try {
    parsed = JSON.parse(readFileSync(path.join(cwd, dir, "tsconfig.json"), "utf8"));
  } catch {
    return null;
  }
  const depth = dir.split("/").length;
  if (parsed.extends !== `${"../".repeat(depth)}tsconfig.json`) {
    return null;
  }
  const types = parsed.compilerOptions?.types;
  if (!Array.isArray(types) || types.length !== 1 || typeof types[0] !== "string") {
    return null;
  }
  const entry = types[0];
  const kind = PINNED_KIND_SUBPATHS.find((candidate) => entry.endsWith(`/${candidate}`));
  if (kind === undefined) {
    return null;
  }
  return { dir, kind, composite: parsed.compilerOptions?.composite === true };
}

// The walls are the wall files on disk, with no second record to drift from: a
// `<dir>/tsconfig.json` that extends the root config at its depth and narrows
// `types` to one kind entry. A user config without a kind entry is never a wall,
// so `--remove` never deletes it.
export function currentWallConfigs(cwd: string): WallConfig[] {
  if (!existsSync(path.join(cwd, "tsconfig.json"))) {
    return [];
  }
  const walls: WallConfig[] = [];
  const visit = (rel: string): void => {
    for (const entry of readdirSync(path.join(cwd, rel), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }
      const dir = rel === "." ? entry.name : `${rel}/${entry.name}`;
      if (existsSync(path.join(cwd, dir, "tsconfig.json"))) {
        const wall = readWallConfig(cwd, dir);
        if (wall !== null) {
          walls.push(wall);
        }
      }
      visit(dir);
    }
  };
  visit(".");
  return sortDirs(walls);
}

export function currentWalledDirs(cwd: string): string[] {
  return currentWallConfigs(cwd).map((wall) => wall.dir);
}

// The single-kind source directories that can be walled, each with its detected
// kind. Mixed-kind directories are absent (no single narrowing applies).
export function eligibleWalls(cwd: string): DirectoryWall[] {
  return planSourceDirectoryWalls(cwd);
}

// Reconcile the on-disk wall set to `desiredDirs`: write a standalone tsconfig
// for each desired wall, delete the wall file of every currently-walled dir not
// desired, and rewrite the root exclude to exactly the desired set. Idempotent
// and total — the same engine backs `wall <dir...>`, `wall --remove <dir...>`,
// and the interactive checkbox.
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

  const previous = currentWalledDirs(cwd);
  for (const dir of previous) {
    if (!desiredSet.has(dir)) {
      rmSync(path.join(cwd, dir, "tsconfig.json"), { force: true });
    }
  }

  writeDirectoryWallTsconfigs(cwd, desired, resolveActivePinnedSurface(cwd));
  wireWallRoot(cwd, previous, desired);
  return sortDirs(desired);
}
