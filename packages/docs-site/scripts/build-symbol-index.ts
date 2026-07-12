import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apiPages, apiPagesForVersion, apiVersions, combinedSurface } from "../app/lib/api-content";
import {
  buildSymbolIndex,
  combinedSymbolIndexRecords,
  versionSymbolIndexRecords,
} from "../app/lib/symbol-index";

// Served from public/ at a stable path. The island appends a `?t=` query in
// dev (see symbol-tooltip.tsx) to defeat Safari's aggressive dev caching — a
// generated-asset `?url` import 404s in honox's dev server, so plain public/
// + fetch is the reliable path.
const OUTPUT_DIR = join(import.meta.dir, "../public");
const OUTPUT = join(OUTPUT_DIR, "symbol-index.json");

const index = buildSymbolIndex(apiPages());

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(index));

console.log(`symbol-index.json: ${Object.keys(index).length} symbols`);

const combinedIndex = combinedSymbolIndexRecords(combinedSurface());
writeFileSync(join(OUTPUT_DIR, "symbol-index-combined.json"), JSON.stringify(combinedIndex));
console.log(`symbol-index-combined.json: ${Object.keys(combinedIndex).length} symbols`);

// One version-correct index per non-default version so a historical page's
// tooltips resolve against its own surface rather than the canonical default.
for (const { version, index: versionIndex } of versionSymbolIndexRecords(
  apiVersions(),
  (versionId) => apiPagesForVersion(versionId),
)) {
  const file = `symbol-index-${version}.json`;
  writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(versionIndex));
  console.log(`${file}: ${Object.keys(versionIndex).length} symbols`);
}
