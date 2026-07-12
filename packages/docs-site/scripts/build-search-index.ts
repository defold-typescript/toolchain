import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  apiPages,
  apiPagesForVersion,
  apiVersions,
  combinedSurface,
  TYPES_DIR,
} from "../app/lib/api-content";
import { GUIDE_DIR, guidePages } from "../app/lib/content";
import { parseFrontmatter } from "../app/lib/frontmatter";
import {
  apiSearchRecords,
  buildSearchIndex,
  combinedSearchRecords,
  versionSearchIndexRecords,
} from "../app/lib/search-index";

// Served from public/ at a stable path. The search islands append a `?t=`
// query in dev to defeat Safari's aggressive dev caching — a generated-asset
// `?url` import 404s in honox's dev server, so plain public/ + fetch is the
// reliable path.
const OUTPUT_DIR = join(import.meta.dir, "../public");

const guideRecords = buildSearchIndex(
  guidePages(),
  (page) => parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body,
);
const apiRecords = apiSearchRecords(apiPages());
const records = [...guideRecords, ...apiRecords];

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, "search-index.json"), JSON.stringify(records));

console.log(`search-index.json: ${records.length} records`);

const combinedRecords = combinedSearchRecords(combinedSurface());
writeFileSync(join(OUTPUT_DIR, "search-index-combined.json"), JSON.stringify(combinedRecords));
console.log(`search-index-combined.json: ${combinedRecords.length} records`);

for (const { version, records: versionRecords } of versionSearchIndexRecords(
  TYPES_DIR,
  guideRecords,
  {
    versions: apiVersions(),
    pagesForVersion: (_typesDir, versionId) => apiPagesForVersion(versionId),
  },
)) {
  const file = `search-index-${version}.json`;
  writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(versionRecords));
  console.log(`${file}: ${versionRecords.length} records`);
}
