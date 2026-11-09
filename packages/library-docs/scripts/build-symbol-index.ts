import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSymbolIndex, type SymbolEntry } from "@defold-typescript/docs-render/symbol-index";
import { apiPages, siteDirs } from "../app/lib/api-content";
import type { LibraryDirs } from "../app/lib/api-surface-loader";

// Served from public/ at a stable path. The island appends a `?t=` query in dev
// (see symbol-tooltip.tsx) to defeat Safari's aggressive dev caching — a
// generated-asset `?url` import 404s in honox's dev server, so plain public/ +
// fetch is the reliable path.
const OUTPUT_DIR = join(import.meta.dir, "..", "public");

export interface SymbolIndexOutput {
  file: string;
  index: Record<string, SymbolEntry>;
}

// Library pages only: a link-only toolchain page has no tooltip entry here. The
// one index serves every page, so a name several libraries declare gets no entry
// rather than one library's.
export function symbolIndexOutputs(dirs: LibraryDirs = siteDirs()): SymbolIndexOutput[] {
  return [
    { file: "symbol-index.json", index: buildSymbolIndex(apiPages(dirs), { ambiguous: "drop" }) },
  ];
}

if (import.meta.main) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const { file, index } of symbolIndexOutputs()) {
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(index));
    console.log(`${file}: ${Object.keys(index).length} symbols`);
  }
}
