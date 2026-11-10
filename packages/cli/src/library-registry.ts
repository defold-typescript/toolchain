// IO shell around the pure `library-match` core: read a library data folder and
// hand each lane's targets to its builder. `resolve` calls this once per run to
// match each `assetOnly` `[dependencies]` entry against the library data it
// selected. Mirrors `api-registry.ts`'s empty-fallback shape so a folder that is
// missing or unreadable degrades to "no libraries" rather than throwing.

import * as path from "node:path";
import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { type LibraryData, readIndexSlots, readLibraryData } from "./library/library-data";
import {
  buildAuthoredRegistryEntries,
  buildLualsRegistryEntries,
  buildScriptApiRegistryEntries,
  libraryName,
  matchedLibraryName,
  mergeVendoredLibrariesBySourceId,
  type VendoredLibrary,
} from "./library-match";

// Every lane's modules, grouped by library name. Unreadable library data degrades
// to no libraries rather than throwing, so `resolve` still types the rest of the
// project.
export function loadVendoredLibraryRegistry(
  dataDir: string | null,
  cliVersion?: string,
): VendoredLibrary[] {
  const libraries = readLibraryDataOrNone(dataDir, cliVersion);
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

// `cliVersion` leaves out each library whose `minCli` is above it.
export function readLibraryDataOrNone(dataDir: string | null, cliVersion?: string): LibraryData[] {
  if (dataDir === null) {
    return [];
  }
  try {
    return readLibraryData(dataDir, { cliVersion });
  } catch {
    return [];
  }
}

// The libraries the URLs read, each matched by `matchLibraryName` over every
// library given: its own `host/owner/repo`, else the one library sharing its repo name.
export function librariesMatching(
  libraries: readonly LibraryData[],
  urls: readonly string[],
): LibraryData[] {
  const names = libraries.map(({ dir }) => dir);
  const used = new Set(urls.map((url) => matchedLibraryName(url, names)));
  return libraries.filter(({ dir }) => used.has(dir));
}

// Reading each `library.json` covers every lane, native included. A folder that
// stops the registry loading reads as no libraries, so a run on it cannot hold a
// dependency it could not type.
export function librariesForDependencies(
  dataDir: string | null,
  urls: readonly string[],
  cliVersion?: string,
): LibraryData[] {
  return librariesMatching(readLibraryDataOrNone(dataDir, cliVersion), urls);
}

// A native extension ships C++ and no Lua module, so it is matched by library name
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
  dataDir: string | null,
  cliVersion?: string,
): VendoredNativeExtension[] {
  if (dataDir === null) {
    return [];
  }
  return readLibraryDataOrNone(dataDir, cliVersion).flatMap((library) =>
    library.native.map(({ repo, namespace, manifestDir, declaration }) => ({
      sourceId: libraryName(repo),
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
  dataDir: string | null,
  cliVersion?: string,
): LibraryIndexSlotClassifications {
  if (dataDir === null) {
    return new Map();
  }
  try {
    return new Map(Object.entries(readIndexSlots(dataDir, { cliVersion })));
  } catch {
    return new Map();
  }
}
