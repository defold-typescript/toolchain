// Materialization slice of `library-type-resolution`: write the declarations
// `resolve` printed for the matched libraries into the gitignored sibling surface
// `.defold-types/libraries@<cliVersion>/`, then point tsconfig at it. Mirrors
// `extension-materialize.ts`; the two surfaces coexist under one
// `typeRoots: [".defold-types"]` alongside the engine `<surfaceId>/` surface.
// Unlike extension namespaces, the printed library modules are self-contained
// ambient `declare module` blocks that reference only global engine types, so
// they land byte-for-byte with no import rewriting.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { readCliVersion } from "./cli-version";
import { formatJsonLikeBiome } from "./format-json";
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
// carries the version and the stamp carries the modules and a digest of what was
// printed for them, which changes whenever a dependency's archive does.
export function librariesDirName(cliVersion: string): string {
  return surfaceDirName(LIBRARIES_BASE, cliVersion);
}

// A legacy flat `libraries` entry, or any older `libraries@<version>` one.
function isLibrariesEntry(entry: unknown): boolean {
  return namesSurfaceAxis(LIBRARIES_BASE, entry);
}

export interface PrintedLibrary {
  readonly module: string;
  readonly contents: string;
}

function printedDigest(printed: readonly PrintedLibrary[]): string {
  const hash = createHash("sha256");
  for (const { module, contents } of printed) {
    hash.update(`${module}\0${contents}\0`);
  }
  return hash.digest("hex");
}

// Reuse only a surface whose stamp vouches for it *and* whose recorded modules
// and digest are the ones being asked for: a matching stamp alone proves the
// toolchain axis, never the dependency axis.
function isReusableLibrarySurface(
  absDir: string,
  modules: readonly string[],
  digest: string,
): boolean {
  if (surfaceStampStatus(absDir) !== "match") {
    return false;
  }
  try {
    const stamp = JSON.parse(readFileSync(path.join(absDir, "package.json"), "utf8")) as {
      modules?: unknown;
      digest?: unknown;
    };
    return (
      stamp.digest === digest &&
      Array.isArray(stamp.modules) &&
      stamp.modules.length === modules.length &&
      stamp.modules.every((module, index) => module === modules[index])
    );
  } catch {
    return false;
  }
}

// The surface a previous run materialized, re-read from disk: its stamp's modules
// and their files must still hash to the digest it recorded.
function retainedLibrarySurface(
  absDir: string,
  relDir: string,
): MaterializeVendoredLibrariesResult {
  try {
    const stamp = JSON.parse(readFileSync(path.join(absDir, "package.json"), "utf8")) as {
      modules?: unknown;
    };
    const { modules } = stamp;
    if (!Array.isArray(modules) || !modules.every((module) => typeof module === "string")) {
      return { materializedDir: null, modules: [] };
    }
    const printed = modules.map((module) => ({
      module,
      contents: readFileSync(path.join(absDir, `${module}.d.ts`), "utf8"),
    }));
    if (isReusableLibrarySurface(absDir, modules, printedDigest(printed))) {
      return { materializedDir: relDir, modules };
    }
  } catch {}
  return { materializedDir: null, modules: [] };
}

export interface MaterializeVendoredLibrariesOptions {
  readonly cwd: string;
  // `null` when library data is unavailable, which keeps an intact surface already
  // there, and its tsconfig entry, without printing or pruning anything.
  readonly printed: readonly PrintedLibrary[] | null;
  // Defaults to the running package's version, so a consumer's directory always
  // names the toolchain that actually wrote it. Injected by tests.
  readonly cliVersion?: string;
}

export interface MaterializeVendoredLibrariesResult {
  readonly materializedDir: string | null;
  readonly modules: string[];
}

export function materializeVendoredLibraries(
  opts: MaterializeVendoredLibrariesOptions,
): MaterializeVendoredLibrariesResult {
  const { cwd } = opts;

  const cliVersion = opts.cliVersion ?? readCliVersion();
  const dirName = librariesDirName(cliVersion);
  const relDir = path.posix.join(MATERIALIZED_ROOT, dirName);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, dirName);

  // library-data-unavailable: keep a good surface rather than nuke it, and keep
  // pointing at it only while every file it was stamped with is still intact.
  // This branch never writes or deletes.
  if (opts.printed === null) {
    return retainedLibrarySurface(absDir, relDir);
  }
  const printed = [...opts.printed].sort((a, b) =>
    a.module < b.module ? -1 : a.module > b.module ? 1 : 0,
  );
  const modules = printed.map(({ module }) => module);

  // reconcile-to-zero: nothing printed means the declared set no longer wants
  // any library surface, so remove a previously-materialized one.
  if (modules.length === 0) {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, modules: [] };
  }

  const digest = printedDigest(printed);
  if (isReusableLibrarySurface(absDir, modules, digest)) {
    return { materializedDir: relDir, modules };
  }

  mkdirSync(absDir, { recursive: true });
  // Retract the stamp for the duration of the rewrite: re-materializing the same
  // `(module set, cliVersion)` lands in a directory whose existing stamp already
  // matches, so writing it last is not enough on its own.
  rmSync(path.join(absDir, "package.json"), { force: true });

  const wanted = new Set(modules.map((module) => `${module}.d.ts`));
  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const { module, contents } of printed) {
    writeFileSync(path.join(absDir, `${module}.d.ts`), contents);
  }

  const imports = modules.map((module) => `import "./${module}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  // Last write of the function: the stamp only ever vouches for a surface whose
  // every other file has already landed. `modules` and `digest` record the
  // dependency axis the directory name cannot carry.
  writeFileSync(
    path.join(absDir, "package.json"),
    `${formatJsonLikeBiome({
      name: "@defold-typescript/materialized-libraries",
      version: cliVersion,
      types: "index.d.ts",
      modules,
      digest,
    })}\n`,
  );

  return { materializedDir: relDir, modules };
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
