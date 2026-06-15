import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apiPages } from "../app/lib/api-content";
import { buildSymbolIndex } from "../app/lib/symbol-index";

const OUTPUT = join(import.meta.dir, "../public/symbol-index.json");

const index = buildSymbolIndex(apiPages());

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(index));

console.log(`symbol-index.json: ${Object.keys(index).length} symbols`);
