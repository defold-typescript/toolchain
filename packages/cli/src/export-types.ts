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
import { normalizeSourceId } from "./library-match";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  resolveLibraryTypesPackageRoot,
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
  // The curated corpus to export from. Defaults to the installed
  // `@defold-typescript/library-types`.
  readonly libraryTypesRoot?: string | null;
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

// The committed files `resolve` would install for `sourceId`, from both
// registries, each once.
function curatedFiles(sourceId: string, root: string | null): string[] {
  const { registry, generatedDir } = loadVendoredLibraryRegistry(root);
  const files = new Set<string>();
  if (generatedDir !== null) {
    for (const library of registry.filter((entry) => entry.sourceId === sourceId)) {
      for (const module of library.modules) {
        files.add(path.join(generatedDir, `${library.generatedStems?.[module] ?? module}.d.ts`));
      }
    }
  }
  for (const target of loadVendoredNativeRegistry(root)) {
    if (target.sourceId === sourceId) {
      files.add(target.declarationPath);
    }
  }
  return [...files].filter((file) => existsSync(file));
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

export function runExportTypes(opts: RunExportTypesOptions): RunExportTypesResult {
  const sourceId = normalizeSourceId(opts.library);
  const root =
    opts.libraryTypesRoot !== undefined ? opts.libraryTypesRoot : resolveLibraryTypesPackageRoot();
  const sources = sourceId === "" ? [] : curatedFiles(sourceId, root);
  if (sources.length === 0) {
    throw new Error(`no curated types for "${opts.library}"`);
  }

  const byEntry = new Map<string, string>();
  for (const source of sources) {
    const name = path.basename(source);
    const entry = path.posix.join(SHIPPED_DIR, name);
    if (byEntry.has(entry)) {
      throw new Error(`two curated files for ${sourceId} are both named ${name}`);
    }
    byEntry.set(entry, source);
  }
  const files: ShippedDeclarationFile[] = [...byEntry]
    .map(([entry, source]) => ({ entry, contents: readFileSync(source, "utf8") }))
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
