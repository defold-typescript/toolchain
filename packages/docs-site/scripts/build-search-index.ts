import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "../app/lib/api-surface-loader";
import { parseFrontmatter } from "../app/lib/frontmatter";
import { listGuidePages } from "../app/lib/guide-loader";
import {
  apiSearchRecords,
  buildSearchIndex,
  combinedSearchRecords,
  type SearchRecord,
  versionSearchIndexRecords,
} from "../app/lib/search-index";

// Anchored on the script's own location, never `process.cwd()`, so the index
// generation resolves the same whether the build runs from the package dir or
// the repo root (where the test suite invokes it).
const SCRIPTS_DIR = import.meta.dir;
const TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "types");
const LIBRARY_TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "library-types");
const GUIDE_DIR = join(SCRIPTS_DIR, "..", "..", "docs", "guide");
// Served from public/ at a stable path. The search islands append a `?t=`
// query in dev to defeat Safari's aggressive dev caching — a generated-asset
// `?url` import 404s in honox's dev server, so plain public/ + fetch is the
// reliable path.
const OUTPUT_DIR = join(SCRIPTS_DIR, "..", "public");

export interface SearchIndexOutput {
  file: string;
  records: SearchRecord[];
}

// The directory dependencies each build resolves against. Defaults to the
// committed types/library/guide trees; a caller (a migration test) supplies a
// synthetic set so the same production code path generates real files from a
// fixture registry, not merely a selected filename.
export interface SearchIndexDeps {
  typesDir?: string;
  libraryTypesDir?: string;
  guideDir?: string;
}

// The full set of search-index files a release emits: the shared canonical
// `search-index.json` (guide + Combined engine records + version-independent
// reference pages, all routed at `/api/<ns>`), plus one `search-index-<id>.json`
// per tracked version — the current version included. Each version file also
// carries the shared version-independent reference records at their canonical
// routes, so an in-page lookup resolves both. There is no
// `search-index-combined.json`: Combined IS the shared canonical index now.
export function searchIndexOutputs(deps: SearchIndexDeps = {}): SearchIndexOutput[] {
  const typesDir = deps.typesDir ?? TYPES_DIR;
  const libraryTypesDir = deps.libraryTypesDir ?? LIBRARY_TYPES_DIR;
  const guideDir = deps.guideDir ?? GUIDE_DIR;
  const guideRecords = buildSearchIndex(
    listGuidePages(guideDir),
    (page) => parseFrontmatter(readFileSync(join(guideDir, page.file), "utf8")).body,
  );
  const sharedPages = loadVersionIndependentPages(typesDir, libraryTypesDir);
  const shared: SearchRecord[] = [
    ...guideRecords,
    ...combinedSearchRecords(loadCombinedSurface(typesDir)),
    ...apiSearchRecords(sharedPages),
  ];
  const outputs: SearchIndexOutput[] = [{ file: "search-index.json", records: shared }];
  for (const { version, records } of versionSearchIndexRecords(typesDir, guideRecords, {
    versions: versionsWithDiskFixtures(typesDir),
    pagesForVersion: loadApiSurfaceForVersion,
    sharedPages,
  })) {
    outputs.push({ file: `search-index-${version}.json`, records });
  }
  return outputs;
}

if (import.meta.main) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, records } of searchIndexOutputs()) {
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(records));
    console.log(`${file}: ${records.length} records`);
  }
}
