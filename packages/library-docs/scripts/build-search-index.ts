import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportSearchIndex } from "@defold-typescript/docs-render/search-export";
import type { SearchRecord } from "@defold-typescript/docs-render/search-route";
import { apiPages, siteDirs, untypedListings } from "../app/lib/api-content";
import type { LibraryDirs } from "../app/lib/api-surface-loader";
import { guides } from "../app/lib/guides";
import {
  apiSearchRecords,
  guideSearchRecords,
  listingSearchRecords,
} from "../app/lib/search-index";

// Served from public/ at a stable path, which the search dialog fetches under
// the site base (see `src/components/provider.tsx`).
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

// Each file holds a Fumadocs search export rather than the raw records: the
// search dialog's static client loads it into its search engine as is.
export async function writeSearchIndexes(
  outDir: string,
  dirs: LibraryDirs = siteDirs(),
  guideDir?: string,
): Promise<SearchIndexOutput[]> {
  const outputs = searchIndexOutputs(dirs, guideDir);
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
