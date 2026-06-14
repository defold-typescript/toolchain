import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GUIDE_DIR, guidePages } from "../app/lib/content";
import { buildSearchIndex } from "../app/lib/search-index";

const OUTPUT = join(import.meta.dir, "../public/search-index.json");

const records = buildSearchIndex(guidePages(), (page) =>
  readFileSync(join(GUIDE_DIR, page.file), "utf8"),
);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(records));

console.log(`search-index.json: ${records.length} records`);
