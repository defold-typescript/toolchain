// IO shell around the pure `library-match` core: locate the installed
// `@defold-typescript/library-types` package, select the library data folder its
// CLI version reads, and hand each lane's targets to its builder. `resolve`
// calls this once per run to match each `assetOnly` `[dependencies]` entry
// against the vendored pure-Lua corpus. Mirrors `api-registry.ts`'s
// empty-fallback shape so a workspace without the corpus degrades to "no
// libraries" rather than throwing.

import { createRequire } from "node:module";
import * as path from "node:path";
import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { readCliVersion } from "./cli-version";
import { selectDataFolder } from "./library/data-folder";
import { type LibraryData, readIndexSlots, readLibraryData } from "./library/library-data";
import {
  buildAuthoredRegistryEntries,
  buildLualsRegistryEntries,
  buildScriptApiRegistryEntries,
  mergeVendoredLibrariesBySourceId,
  normalizeSourceId,
  type VendoredLibrary,
} from "./library-match";

// The library-types package exports only per-module type entrypoints (no `.`
// root), so resolve its `package.json` — which it exports explicitly — and take
// the directory as the package root.
export function resolveLibraryTypesPackageRoot(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@defold-typescript/library-types/package.json");
    return path.dirname(entry);
  } catch {
    return null;
  }
}

// The data folder under the installed package that `cliVersion` reads, or `null`
// when the package or a folder for that version is missing.
export function resolveLibraryDataDir(cliVersion: string = readCliVersion()): string | null {
  const root = resolveLibraryTypesPackageRoot();
  return root === null ? null : selectDataFolder(path.join(root, "data"), cliVersion);
}

// Every lane's modules, grouped by source id. Unreadable library data degrades
// to no libraries rather than throwing, so `resolve` still types the rest of the
// project.
export function loadVendoredLibraryRegistry(
  dataDir: string | null = resolveLibraryDataDir(),
): VendoredLibrary[] {
  const libraries = readLibraryDataOrNone(dataDir);
  // Merge across lanes so one upstream repo split across lanes holds a single
  // `sourceId` entry; without it, `matchVendoredLibrary`'s first-match `find`
  // drops every later lane's modules for that source.
  return mergeVendoredLibrariesBySourceId([
    ...buildLualsRegistryEntries({ targets: libraries.flatMap((library) => library.luals) }),
    ...buildScriptApiRegistryEntries({
      targets: libraries.flatMap((library) => library.scriptApi),
    }),
    ...buildAuthoredRegistryEntries({
      targets: libraries.flatMap((library) => library.authored),
    }),
  ]);
}

function readLibraryDataOrNone(dataDir: string | null): LibraryData[] {
  if (dataDir === null) {
    return [];
  }
  try {
    return readLibraryData(dataDir);
  } catch {
    return [];
  }
}

// A native extension ships C++ and no Lua module, so it is matched by source id
// and confirmed by the `<manifestDir>/ext.manifest` its archive ships rather than
// by a require path. Its declaration is a curated ambient namespace the resolver
// writes into the extension surface in place of anything the archive emits.
export interface VendoredNativeExtension {
  readonly sourceId: string;
  readonly namespace: string;
  readonly manifestDir: string;
  readonly declarationPath: string;
}

export function loadVendoredNativeRegistry(
  dataDir: string | null = resolveLibraryDataDir(),
): VendoredNativeExtension[] {
  if (dataDir === null) {
    return [];
  }
  return readLibraryDataOrNone(dataDir).flatMap((library) =>
    library.native.map(({ repo, namespace, manifestDir, declaration }) => ({
      sourceId: normalizeSourceId(repo),
      namespace,
      manifestDir,
      declarationPath: path.join(dataDir, declaration),
    })),
  );
}

// The base each curated library slot counts from, keyed as the library-types
// parser documents. Read without that parser, which the CLI cannot load under
// Node; the library-types gates parse the same entries before they ship.
// Unreadable library data degrades to no notes, mirroring the other lanes.
export function loadLibraryIndexSlotClassifications(
  dataDir: string | null = resolveLibraryDataDir(),
): LibraryIndexSlotClassifications {
  if (dataDir === null) {
    return new Map();
  }
  try {
    return new Map(Object.entries(readIndexSlots(dataDir)));
  } catch {
    return new Map();
  }
}
