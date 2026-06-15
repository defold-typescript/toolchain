import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apiPages } from "../app/lib/api-content";
import { GUIDE_DIR, guidePages } from "../app/lib/content";
import { parseFrontmatter } from "../app/lib/frontmatter";
import { apiSearchRecords, buildSearchIndex } from "../app/lib/search-index";

const OUTPUT = join(import.meta.dir, "../public/search-index.json");

const guideRecords = buildSearchIndex(
  guidePages(),
  (page) => parseFrontmatter(readFileSync(join(GUIDE_DIR, page.file), "utf8")).body,
);
const apiRecords = apiSearchRecords(apiPages());
const records = [...guideRecords, ...apiRecords];

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(records));

console.log(`search-index.json: ${records.length} records`);
