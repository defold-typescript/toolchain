import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { exportSearchIndex } from "@defold-typescript/docs-render/search-export";
import type { SearchRecord } from "@defold-typescript/docs-render/search-route";
import { apiVersionAxis, windowedApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadCombinedSurface,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import { resolveVersionWindow } from "@defold-typescript/docs-render/version-window";
import { renderGuidePage } from "../app/lib/content";
import { listGuidePages } from "../app/lib/guide-loader";
import {
  apiSearchRecords,
  buildSearchIndex,
  combinedSearchRecords,
  versionSearchIndexRecords,
} from "../app/lib/search-index";

// Anchored on the script's own location, never `process.cwd()`, so the index
// generation resolves the same whether the build runs from the package dir or
// the repo root (where the test suite invokes it).
const SCRIPTS_DIR = import.meta.dir;
const TYPES_DIR = join(SCRIPTS_DIR, "..", "..", "types");
const GUIDE_DIR = join(SCRIPTS_DIR, "..", "..", "docs", "guide");
// Served from public/ at a stable path, which the search dialog fetches under
// the site base (see `src/components/provider.tsx`).
const OUTPUT_DIR = join(SCRIPTS_DIR, "..", "public");

// The engine pages `/api/<id>/<ns>` renders for a version: its full-range window,
// so a version record carries the same declaration signatures as the page.
export function versionRoutePages(typesDir: string, versionId: string): ApiPage[] {
  const window = resolveVersionWindow(apiVersionAxis(typesDir), versionId, null);
  return window ? windowedApiPages(window, typesDir) : [];
}

export interface SearchIndexOutput {
  file: string;
  records: SearchRecord[];
}

// The directory dependencies each build resolves against. Defaults to the
// committed types/guide trees; a caller (a migration test) supplies a
// synthetic set so the same production code path generates real files from a
// fixture registry, not merely a selected filename.
export interface SearchIndexDeps {
  typesDir?: string;
  guideDir?: string;
}

const CANONICAL_FILE = "search-index.json";
const versionFile = (versionId: string): string => `search-index-${versionId}.json`;

// The files `searchIndexOutputs` emits, named without rendering the guide.
export function searchIndexFiles(deps: SearchIndexDeps = {}): string[] {
  const typesDir = deps.typesDir ?? TYPES_DIR;
  return [CANONICAL_FILE, ...versionsWithDiskFixtures(typesDir).map(({ id }) => versionFile(id))];
}

// Rendering the whole guide takes seconds, and one process (the test suite) asks
// for the outputs many times, so each guide directory renders once.
const guideRecordsByDir = new Map<string, Promise<SearchRecord[]>>();

function guideSearchRecords(guideDir: string): Promise<SearchRecord[]> {
  let records = guideRecordsByDir.get(guideDir);
  if (!records) {
    records = buildSearchIndex(listGuidePages(guideDir), (page) => renderGuidePage(guideDir, page));
    guideRecordsByDir.set(guideDir, records);
  }
  return records;
}

// The full set of search-index files a release emits: the shared canonical
// `search-index.json` (guide + Combined engine records + version-independent
// reference pages, all routed at `/api/<ns>`), plus one `search-index-<id>.json`
// per tracked version — the current version included. Each version file also
// carries the shared version-independent reference records at their canonical
// routes, so an in-page lookup resolves both. There is no
// `search-index-combined.json`: Combined IS the shared canonical index now.
export async function searchIndexOutputs(deps: SearchIndexDeps = {}): Promise<SearchIndexOutput[]> {
  const typesDir = deps.typesDir ?? TYPES_DIR;
  const guideRecords = await guideSearchRecords(deps.guideDir ?? GUIDE_DIR);
  const sharedPages = loadVersionIndependentPages(typesDir);
  const shared: SearchRecord[] = [
    ...guideRecords,
    ...combinedSearchRecords(loadCombinedSurface(typesDir)),
    ...apiSearchRecords(sharedPages),
  ];
  const outputs: SearchIndexOutput[] = [{ file: CANONICAL_FILE, records: shared }];
  for (const { version, records } of versionSearchIndexRecords(typesDir, guideRecords, {
    versions: versionsWithDiskFixtures(typesDir),
    pagesForVersion: versionRoutePages,
    sharedPages,
  })) {
    outputs.push({ file: versionFile(version), records });
  }
  return outputs;
}

// Each file holds a Fumadocs search export rather than the raw records: the
// static search client loads it into its search engine as is.
export async function writeSearchIndexes(
  outDir: string,
  deps: SearchIndexDeps = {},
): Promise<SearchIndexOutput[]> {
  const outputs = await searchIndexOutputs(deps);
  mkdirSync(outDir, { recursive: true });
  for (const { file, records } of outputs) {
    writeFileSync(join(outDir, file), JSON.stringify(await exportSearchIndex(records)));
  }
  return outputs;
}

if (import.meta.main) {
  for (const { file, records } of await writeSearchIndexes(OUTPUT_DIR)) {
    console.log(`${file}: ${records.length} records`);
  }
}
