// Turns the curated declarations `resolve` installs for a library into the
// `types/` folder that library can ship itself, so a release carrying it
// replaces the curated copy with the same declarations. Each file is written
// verbatim, and only once the folder as it will be -- the `.d.ts` files already
// directly in `types/`, with each curated file in place of the existing file it
// lands on: one of the same name or, where the file system ignores case, one
// whose name differs only in case, which keeps its name -- passes the selection
// and the check `resolve` runs on shipped types: a folder `resolve` would
// reject or trim is never left behind.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { readCliVersion } from "./cli-version";
import type { DownloadExtensionArchive, ReadExtensionZip } from "./extension-archive";
import { printLibraryModules } from "./library/print-library";
import {
  fetchNewestLibraryData,
  LIBRARY_DATA_MAIN_URL,
  libraryDataCacheDir,
} from "./library-data-archive";
import { matchLibraryName, namesSelectedBy } from "./library-match";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  readLibraryDataOrNone,
} from "./library-registry";
import {
  checkShippedDeclarations,
  isShippedDeclarationPath,
  type ShippedDeclarationFile,
  selectShippedDeclarations,
} from "./shipped-declarations";

export interface RunExportTypesOptions {
  readonly library: string;
  readonly cwd: string;
  // The library data folder to export from. Defaults to the data repo's archive.
  readonly libraryDataDir?: string | null;
  readonly cacheDir?: string;
  readonly download?: DownloadExtensionArchive;
  readonly readZip?: ReadExtensionZip;
  // The CLI version that picks the data folder and leaves out each library whose
  // `minCli` is above it. Defaults to this CLI's.
  readonly cliVersion?: string;
  // The `@defold-typescript/types` root the files are checked against. Defaults
  // to the installed package; `null` means it could not be found.
  readonly typesRoot?: string | null;
}

export interface RunExportTypesResult {
  readonly sourceId: string;
  // Project-relative, `/`-separated, sorted.
  readonly written: string[];
}

const SHIPPED_DIR = "types";

interface CuratedFile {
  readonly name: string;
  readonly contents: string;
}

// The declarations `resolve` would install for `sourceId`, from both registries,
// each once under the name it is installed as. A library module is printed from
// the sources library data pins, as `resolve` prints it with no archive at hand.
async function curatedFiles(
  sourceId: string,
  root: string | null,
  cliVersion: string,
): Promise<CuratedFile[]> {
  const files: CuratedFile[] = [];
  if (root !== null) {
    const printed = new Map<string, string>();
    for (const library of loadVendoredLibraryRegistry(root, cliVersion)) {
      if (library.sourceId !== sourceId) continue;
      for (const { module, contents } of (
        await printLibraryModules(root, library.modules, null, { cliVersion })
      ).printed) {
        printed.set(`${library.namespaces?.[module] ?? module}.d.ts`, contents);
      }
    }
    for (const [name, contents] of printed) files.push({ name, contents });
  }
  for (const target of loadVendoredNativeRegistry(root, cliVersion)) {
    if (target.sourceId === sourceId && existsSync(target.declarationPath)) {
      files.push({
        name: path.basename(target.declarationPath),
        contents: readFileSync(target.declarationPath, "utf8"),
      });
    }
  }
  return files;
}

function byEntryPath(a: ShippedDeclarationFile, b: ShippedDeclarationFile): number {
  return a.entry < b.entry ? -1 : a.entry > b.entry ? 1 : 0;
}

// The file `file` reaches on disk, as the file system itself tells files apart,
// so two names it routes to one file -- by ignoring case, by normalizing
// Unicode, or as hard links -- share one identity. `bigint` because NTFS file
// indexes exceed `Number.MAX_SAFE_INTEGER`.
function fileIdentity(file: string): string | undefined {
  const stat = statSync(file, { bigint: true, throwIfNoEntry: false });
  return stat === undefined ? undefined : `${stat.dev}:${stat.ino}`;
}

// The files already in `<cwd>/types/` that `resolve` would read as shipped
// types once the folder is released.
function existingShippedFiles(
  cwd: string,
): Array<ShippedDeclarationFile & { readonly identity: string | undefined }> {
  const dir = path.join(cwd, SHIPPED_DIR);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.posix.join(SHIPPED_DIR, dirent.name))
    .filter(isShippedDeclarationPath)
    .map((entry) => {
      const file = path.join(cwd, entry);
      return { entry, contents: readFileSync(file, "utf8"), identity: fileIdentity(file) };
    });
}

// An export holds to no project's recorded commit, so it reads the newest data.
function selectLibraryData(
  opts: RunExportTypesOptions,
  cliVersion: string,
): Promise<{ readonly dir: string | null; readonly reason?: string }> {
  if (opts.libraryDataDir !== undefined) {
    return Promise.resolve({ dir: opts.libraryDataDir });
  }
  return fetchNewestLibraryData({
    mainUrl: LIBRARY_DATA_MAIN_URL,
    cacheDir:
      opts.cacheDir === undefined
        ? libraryDataCacheDir()
        : path.join(opts.cacheDir, "library-data"),
    cliVersion,
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
  });
}

// The library `library` names: a dependency URL as `resolve` matches it, else the one
// library a typed name selects; "" when none does.
function exportedLibrary(library: string, names: readonly string[]): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(library)) {
    const match = matchLibraryName(library, names);
    if (match?.kind === "shared") {
      throw new Error(
        `"${library}" shares its repo name with ${match.names.join(", ")}: name one as host/owner/repo`,
      );
    }
    return match?.name ?? "";
  }
  const selected = namesSelectedBy(library, names);
  if (selected.length > 1) {
    throw new Error(`"${library}" names more than one library: ${selected.join(", ")}`);
  }
  return selected[0] ?? "";
}

export async function runExportTypes(opts: RunExportTypesOptions): Promise<RunExportTypesResult> {
  const cliVersion = opts.cliVersion ?? readCliVersion();
  const data = await selectLibraryData(opts, cliVersion);
  const sourceId = exportedLibrary(
    opts.library,
    readLibraryDataOrNone(data.dir, cliVersion).map(({ dir }) => dir),
  );
  const sources = sourceId === "" ? [] : await curatedFiles(sourceId, data.dir, cliVersion);
  if (sources.length === 0) {
    const why = data.reason === undefined ? "" : `: ${data.reason}`;
    throw new Error(`no curated types for "${opts.library}"${why}`);
  }

  const byEntry = new Map<string, string>();
  for (const { name, contents } of sources) {
    const entry = path.posix.join(SHIPPED_DIR, name);
    if (byEntry.has(entry)) {
      throw new Error(`two curated files for ${sourceId} are both named ${name}`);
    }
    byEntry.set(entry, contents);
  }
  const files: ShippedDeclarationFile[] = [...byEntry]
    .map(([entry, contents]) => ({ entry, contents }))
    .sort(byEntryPath);

  const existing = existingShippedFiles(opts.cwd);
  const projected = new Map(existing.map(({ entry, contents }) => [entry, contents]));
  // The names the curated files will be found under once written: an existing
  // file a destination reaches keeps its own name.
  const landed = new Set<string>();
  for (const { entry, contents } of files) {
    const identity = fileIdentity(path.join(opts.cwd, entry));
    const reached =
      identity === undefined
        ? []
        : existing.filter((file) => file.identity === identity).map((file) => file.entry);
    for (const target of reached.length > 0 ? reached : [entry]) {
      projected.set(target, contents);
      landed.add(target);
    }
  }
  const written = [...landed].sort();
  const folder: ShippedDeclarationFile[] = [...projected]
    .map(([entry, contents]) => ({ entry, contents }))
    .sort(byEntryPath);

  const selected = selectShippedDeclarations(folder);
  const kept = new Set(selected.map(({ entry }) => entry));
  const skipped = written.filter((entry) => !kept.has(entry));
  if (skipped.length > 0) {
    throw new Error(
      `curated types for ${sourceId} would not install as shipped types: resolve skips ${skipped.join(", ")}, which add global names beside a module declaration`,
    );
  }

  const typesRoot = opts.typesRoot !== undefined ? opts.typesRoot : resolveTypesPackageRoot();
  if (typesRoot === null) {
    throw new Error(
      `curated types for ${sourceId} were not exported: @defold-typescript/types could not be found to check them`,
    );
  }
  const checked = checkShippedDeclarations(selected, typesRoot);
  const messages = selected.flatMap(({ entry }) => checked.get(entry) ?? []);
  if (messages.length > 0) {
    const more = messages.length > 1 ? ` (+${messages.length - 1} more)` : "";
    throw new Error(
      `curated types for ${sourceId} were not exported: ${SHIPPED_DIR}/ would not compile against @defold-typescript/types: ${messages[0]}${more}`,
    );
  }

  mkdirSync(path.join(opts.cwd, SHIPPED_DIR), { recursive: true });
  for (const { entry, contents } of files) {
    writeFileSync(path.join(opts.cwd, entry), contents);
  }
  return { sourceId, written };
}
