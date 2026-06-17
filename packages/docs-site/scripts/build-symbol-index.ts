import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apiPages } from "../app/lib/api-content";
import { buildSymbolIndex } from "../app/lib/symbol-index";

// Served from public/ at a stable path. The island appends a `?t=` query in
// dev (see symbol-tooltip.tsx) to defeat Safari's aggressive dev caching — a
// generated-asset `?url` import 404s in honox's dev server, so plain public/
// + fetch is the reliable path.
const OUTPUT = join(import.meta.dir, "../public/symbol-index.json");

const index = buildSymbolIndex(apiPages());

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(index));

console.log(`symbol-index.json: ${Object.keys(index).length} symbols`);
