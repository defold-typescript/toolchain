// Materialization slice of `library-type-resolution`: copy the matched vendored
// libraries' committed `generated/<module>.d.ts` files verbatim into the
// gitignored sibling surface `.defold-types/libraries@<cliVersion>/`, then point tsconfig at
// it. Mirrors `extension-materialize.ts`; the two surfaces coexist under one
// `typeRoots: [".defold-types"]` alongside the engine `<surfaceId>/` surface.
// Unlike extension namespaces, the generated library files are self-contained
// ambient `declare module` blocks that reference only global engine types, so
// they copy byte-for-byte with no import rewriting.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { readCliVersion } from "./cli-version";
import { formatJsonLikeBiome } from "./format-json";
import type { VendoredLibrary } from "./library-match";
import {
  ensureGitignoreLine,
  MATERIALIZED_ROOT,
  namesSurfaceAxis,
  surfaceDirName,
  surfaceStampStatus,
} from "./materialize";

const LIBRARIES_BASE = "libraries";

// The surface contents are a function of *(dependency set x toolchain version)*.
// Only the toolchain axis can ride the directory name — the dependency set is a
// set, and it changes for reasons unrelated to the toolchain — so the name
// carries the version and the stamp carries the modules.
export function librariesDirName(cliVersion: string): string {
  return surfaceDirName(LIBRARIES_BASE, cliVersion);
}

// A legacy flat `libraries` entry, or any older `libraries@<version>` one.
function isLibrariesEntry(entry: unknown): boolean {
  return namesSurfaceAxis(LIBRARIES_BASE, entry);
}

// Reuse only a surface whose stamp vouches for it *and* whose recorded module
// set is the one being asked for: a matching stamp alone proves the toolchain
// axis, never the dependency axis.
function isReusableLibrarySurface(absDir: string, present: readonly string[]): boolean {
  if (surfaceStampStatus(absDir) !== "match") {
    return false;
  }
  try {
    const stamp = JSON.parse(readFileSync(path.join(absDir, "package.json"), "utf8")) as {
      modules?: unknown;
    };
    return (
      Array.isArray(stamp.modules) &&
      stamp.modules.length === present.length &&
      stamp.modules.every((module, index) => module === present[index])
    );
  } catch {
    return false;
  }
}

export interface MaterializeVendoredLibrariesOptions {
  readonly cwd: string;
  readonly matched: readonly VendoredLibrary[];
  readonly generatedDir: string | null;
  // Defaults to the running package's version, so a consumer's directory always
  // names the toolchain that actually wrote it. Injected by tests.
  readonly cliVersion?: string;
}

export interface MaterializeVendoredLibrariesResult {
  readonly materializedDir: string | null;
  readonly modules: string[];
  readonly skipped: string[];
}

export function materializeVendoredLibraries(
  opts: MaterializeVendoredLibrariesOptions,
): MaterializeVendoredLibrariesResult {
  const { cwd, matched, generatedDir } = opts;

  const cliVersion = opts.cliVersion ?? readCliVersion();
  const dirName = librariesDirName(cliVersion);
  const relDir = path.posix.join(MATERIALIZED_ROOT, dirName);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, dirName);

  const modules = [...new Set(matched.flatMap((library) => library.modules))].sort();

  // The committed source file stem differs from the module id for LuaLS and
  // script_api libraries (druid ships `druid.druid` but its types live in
  // `generated/druid.d.ts`; bridge ships `bridge.bridge` from
  // `generated/bridge.d.ts`); pure-Lua modules map to themselves.
  const stemOf = new Map<string, string>();
  for (const library of matched) {
    for (const module of library.modules) {
      stemOf.set(module, library.generatedStems?.[module] ?? module);
    }
  }
  const sourceStem = (module: string): string => stemOf.get(module) ?? module;

  // reconcile-to-zero: an empty match set means the declared set no longer wants
  // any library surface, so remove a previously-materialized one.
  if (modules.length === 0) {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, modules: [], skipped: [] };
  }
  // corpus-unavailable: keep a good surface rather than nuke it on a null source.
  if (generatedDir === null) {
    return { materializedDir: null, modules: [], skipped: [] };
  }

  const present = modules.filter((module) =>
    existsSync(path.join(generatedDir, `${sourceStem(module)}.d.ts`)),
  );
  const skipped = modules.filter((module) => !present.includes(module));
  if (present.length === 0) {
    return { materializedDir: null, modules: [], skipped };
  }

  if (isReusableLibrarySurface(absDir, present)) {
    return { materializedDir: relDir, modules: present, skipped };
  }

  mkdirSync(absDir, { recursive: true });
  // Retract the stamp for the duration of the rewrite: re-materializing the same
  // `(module set, cliVersion)` lands in a directory whose existing stamp already
  // matches, so writing it last is not enough on its own.
  rmSync(path.join(absDir, "package.json"), { force: true });

  const wanted = new Set(present.map((module) => `${module}.d.ts`));
  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const module of present) {
    const source = readFileSync(path.join(generatedDir, `${sourceStem(module)}.d.ts`), "utf8");
    writeFileSync(path.join(absDir, `${module}.d.ts`), source);
  }

  const imports = present.map((module) => `import "./${module}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  // Last write of the function: the stamp only ever vouches for a surface whose
  // every other file has already landed. `modules` records the dependency axis
  // the directory name cannot carry.
  writeFileSync(
    path.join(absDir, "package.json"),
    `${formatJsonLikeBiome({
      name: "@defold-typescript/materialized-libraries",
      version: cliVersion,
      types: "index.d.ts",
      modules: present,
    })}\n`,
  );

  return { materializedDir: relDir, modules: present, skipped };
}

export function ensureLibraryTypesReference(cwd: string, materializedDir: string | null): void {
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (materializedDir === null) {
    if (!existsSync(tsconfigPath)) {
      return;
    }
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const types = Array.isArray(current.types) ? (current.types as unknown[]).slice() : [];
    const kept = types.filter((entry) => !isLibrariesEntry(entry));
    if (kept.length !== types.length) {
      tsconfig.compilerOptions = { ...current, types: kept };
      writeFileSync(tsconfigPath, `${formatJsonLikeBiome(tsconfig)}\n`);
    }
    return;
  }
  const entry = path.posix.basename(materializedDir);

  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const types = Array.isArray(current.types) ? (current.types as unknown[]).slice() : [];
    const typeRoots = Array.isArray(current.typeRoots)
      ? (current.typeRoots as unknown[]).slice()
      : [];

    // Additive towards siblings — an engine `surfaceId` and `"extensions"` entry
    // are preserved, so this composes with `ensureMaterializedReference` and
    // `ensureExtensionTypesReference` — but exclusive within its own axis: a
    // legacy flat `"libraries"` or an older `libraries@<version>` entry is
    // dropped, or an upgrade would load the retained previous surface alongside
    // the new one and every module would be declared twice.
    const kept = types.filter((value) => value === entry || !isLibrariesEntry(value));
    const needsEntry = !kept.includes(entry);
    const needsRoot = !typeRoots.includes(MATERIALIZED_ROOT);
    if (needsEntry || needsRoot || kept.length !== types.length) {
      if (needsEntry) {
        kept.push(entry);
      }
      if (needsRoot) {
        typeRoots.push(MATERIALIZED_ROOT);
      }
      tsconfig.compilerOptions = { ...current, typeRoots, types: kept };
      writeFileSync(tsconfigPath, `${formatJsonLikeBiome(tsconfig)}\n`);
    }
  }

  ensureGitignoreLine(cwd, `${MATERIALIZED_ROOT}/`);
}
