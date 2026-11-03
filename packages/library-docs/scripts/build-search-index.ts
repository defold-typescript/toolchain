import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SearchRecord } from "@defold-typescript/docs-render/search-route";
import { apiPages, siteDirs, untypedListings } from "../app/lib/api-content";
import type { LibraryDirs } from "../app/lib/api-surface-loader";
import { guides } from "../app/lib/guides";
import {
  apiSearchRecords,
  guideSearchRecords,
  listingSearchRecords,
} from "../app/lib/search-index";

// Served from public/ at a stable path. The search islands append a `?t=` query in
// dev to defeat Safari's aggressive dev caching — a generated-asset `?url` import
// 404s in honox's dev server, so plain public/ + fetch is the reliable path.
const OUTPUT_DIR = join(import.meta.dir, "..", "public");

export interface SearchIndexOutput {
  file: string;
  records: SearchRecord[];
}

// Library pages, listings and guides only: the link-only toolchain pages stay out,
// since they are served by the toolchain docs and its own search.
export function searchIndexOutputs(
  dirs: LibraryDirs = siteDirs(),
  guideDir?: string,
): SearchIndexOutput[] {
  return [
    {
      file: "search-index.json",
      records: [
        ...apiSearchRecords(apiPages(dirs)),
        ...listingSearchRecords(untypedListings(dirs)),
        ...guideSearchRecords(guides(guideDir)),
      ],
    },
  ];
}

if (import.meta.main) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, records } of searchIndexOutputs()) {
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(records));
    console.log(`${file}: ${records.length} records`);
  }
}
