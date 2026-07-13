import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
import {
  buildSymbolIndex,
  combinedSymbolIndexRecords,
  type SymbolEntry,
  versionSymbolIndexRecords,
} from "../app/lib/symbol-index";

// Anchored on the script's own location, never `process.cwd()`, so the index
// generation resolves the same whether the build runs from the package dir or
// the repo root (where the test suite invokes it).
const SCRIPTS_DIR = import.meta.dir;
const TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "types");
const LIBRARY_TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "library-types");
// Served from public/ at a stable path. The island appends a `?t=` query in
// dev (see symbol-tooltip.tsx) to defeat Safari's aggressive dev caching — a
// generated-asset `?url` import 404s in honox's dev server, so plain public/
// + fetch is the reliable path.
const OUTPUT_DIR = join(SCRIPTS_DIR, "..", "public");

export interface SymbolIndexOutput {
  file: string;
  index: Record<string, SymbolEntry>;
}

// The directory dependencies each build resolves against. Defaults to the
// committed types/library trees; a caller (a migration test) supplies a synthetic
// set so the same production code path generates real files from a fixture
// registry, not merely a selected filename.
export interface SymbolIndexDeps {
  typesDir?: string;
  libraryTypesDir?: string;
}

// The full set of symbol-index files a release emits: the shared canonical
// `symbol-index.json` (Combined engine symbols + version-independent reference
// symbols, all routed at `/api/<ns>`), plus one `symbol-index-<id>.json` per
// tracked version — the current version included. Each version file also carries
// the shared version-independent reference symbols at their canonical routes,
// alongside that version's own prefixed engine symbols. There is no
// `symbol-index-combined.json`: the Combined symbols live in the shared file now.
export function symbolIndexOutputs(deps: SymbolIndexDeps = {}): SymbolIndexOutput[] {
  const typesDir = deps.typesDir ?? TYPES_DIR;
  const libraryTypesDir = deps.libraryTypesDir ?? LIBRARY_TYPES_DIR;
  const sharedPages = loadVersionIndependentPages(typesDir, libraryTypesDir);
  const shared: Record<string, SymbolEntry> = {
    ...buildSymbolIndex(sharedPages),
    ...combinedSymbolIndexRecords(loadCombinedSurface(typesDir)),
  };
  const outputs: SymbolIndexOutput[] = [{ file: "symbol-index.json", index: shared }];
  for (const { version, index } of versionSymbolIndexRecords(
    versionsWithDiskFixtures(typesDir),
    (versionId) => loadApiSurfaceForVersion(typesDir, versionId),
    sharedPages,
  )) {
    outputs.push({ file: `symbol-index-${version}.json`, index });
  }
  return outputs;
}

if (import.meta.main) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, index } of symbolIndexOutputs()) {
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(index));
    console.log(`${file}: ${Object.keys(index).length} symbols`);
  }
}
