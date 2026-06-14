import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { detectSourceOutputKind, isTranspilerSource, readBuildConfig } from "./build-output";
import { formatJsonLikeBiome } from "./format-json";
import { scanFilesSync } from "./scan";
import {
  isSkipped,
  type ScriptKind,
  selectDirectoryWalls,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

export interface DirectoryWall {
  readonly dir: string;
  readonly kind: ScriptKind;
  readonly typesEntrypoint: string;
}

function describeWall(dir: string, kind: ScriptKind): DirectoryWall {
  return {
    dir,
    kind,
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
      const kind = detectSourceOutputKind(readFileSync(path.join(cwd, match), "utf8"));
      if (kind === "module") {
        continue;
      }
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
  readonly compilerOptions: {
    readonly composite: true;
    readonly typeRoots: null;
    readonly types: string[];
  };
  readonly include: readonly ["**/*.ts"];
  readonly exclude: readonly [];
}

export function directoryWallTsconfig(wall: DirectoryWall): WallTsconfig {
  const depth = wall.dir.split("/").length;
  return {
    extends: `${"../".repeat(depth)}tsconfig.json`,
    compilerOptions: { composite: true, typeRoots: null, types: [wall.typesEntrypoint] },
    include: ["**/*.ts"],
    exclude: [],
  };
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

interface RootTsconfig {
  exclude?: string[];
  files?: string[];
  references?: Array<{ path: string }>;
  [key: string]: unknown;
}

function sortedWallDirs(walls: readonly DirectoryWall[]): string[] {
  return walls
    .map((w) => w.dir)
    .filter((dir) => dir !== ".")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function isInsideAnyDir(rel: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function hasRootOwnedTranspilerSources(cwd: string, wallDirs: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const pattern of readBuildConfig(cwd).include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      const rel = match.split(path.sep).join("/");
      if (seen.has(rel) || !isTranspilerSource(rel) || isSkipped(rel)) {
        continue;
      }
      seen.add(rel);
      if (!isInsideAnyDir(rel, wallDirs)) {
        return true;
      }
    }
  }
  return false;
}

export function wireWallReferences(cwd: string, walls: readonly DirectoryWall[]): void {
  const rootPath = path.join(cwd, "tsconfig.json");
  const current = JSON.parse(readFileSync(rootPath, "utf8")) as RootTsconfig;
  const wallDirs = sortedWallDirs(walls);
  const previousReferences = current.references ?? [];
  const previousManaged = new Set(previousReferences.map((ref) => ref.path));
  const nextExclude = [
    ...new Set([
      ...(current.exclude ?? []).filter((entry) => !previousManaged.has(entry)),
      ...wallDirs,
    ]),
  ];
  const next: RootTsconfig = { ...current };

  if (wallDirs.length > 0) {
    next.references = wallDirs.map((dir) => ({ path: dir }));
  } else {
    delete next.references;
  }

  if (nextExclude.length > 0) {
    next.exclude = nextExclude;
  } else {
    delete next.exclude;
  }

  if (wallDirs.length > 0 && !hasRootOwnedTranspilerSources(cwd, wallDirs)) {
    next.files = [];
  } else if (previousReferences.length > 0 && JSON.stringify(next.files) === JSON.stringify([])) {
    delete next.files;
  }

  if (JSON.stringify(next) !== JSON.stringify(current)) {
    writeJson(rootPath, next);
  }
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
        options.composite === desired.compilerOptions.composite &&
        options.typeRoots === desired.compilerOptions.typeRoots &&
        JSON.stringify(options.types) === JSON.stringify(desired.compilerOptions.types) &&
        JSON.stringify(current.include) === JSON.stringify(desired.include) &&
        JSON.stringify(current.exclude) === JSON.stringify(desired.exclude);
      if (!alreadyNarrowed) {
        writeJson(target, {
          ...current,
          extends: desired.extends,
          compilerOptions: {
            ...options,
            composite: desired.compilerOptions.composite,
            typeRoots: desired.compilerOptions.typeRoots,
            types: desired.compilerOptions.types,
          },
          include: desired.include,
          exclude: desired.exclude,
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
