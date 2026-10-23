// Turns the curated declarations `resolve` installs for a library into the
// `types/` folder that library can ship itself, so a release carrying it
// replaces the curated copy with the same declarations. Each file is written
// verbatim, and only once the whole set passes the selection and the check
// `resolve` runs on shipped types: a folder `resolve` would reject or trim is
// never left behind.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([entry, source]) => ({ entry, contents: readFileSync(source, "utf8") }));

  const kept = new Set(selectShippedDeclarations(files).map(({ entry }) => entry));
  const skipped = files.map(({ entry }) => entry).filter((entry) => !kept.has(entry));
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
  const checked = checkShippedDeclarations(files, typesRoot);
  const messages = files.flatMap(({ entry }) => checked.get(entry) ?? []);
  if (messages.length > 0) {
    const more = messages.length > 1 ? ` (+${messages.length - 1} more)` : "";
    throw new Error(
      `curated types for ${sourceId} do not compile against @defold-typescript/types: ${messages[0]}${more}`,
    );
  }

  mkdirSync(path.join(opts.cwd, SHIPPED_DIR), { recursive: true });
  for (const { entry, contents } of files) {
    writeFileSync(path.join(opts.cwd, entry), contents);
  }
  return { sourceId, written: files.map(({ entry }) => entry) };
}
