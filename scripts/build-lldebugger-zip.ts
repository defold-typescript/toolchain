// Build entry for the self-hosted lldebugger Defold library archive.
//
// Packs the pinned vendored snapshot under `scripts/lldebugger/library/` into a
// `lldebugger.zip` that Defold's Fetch Libraries can consume. The release
// workflow invokes this; run locally with `bun run build:lldebugger`.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildZip, packZipEntries } from "./lldebugger/pack.ts";

const outPath = resolve(process.argv[2] ?? "dist/lldebugger.zip");

const entries = packZipEntries();
const zip = buildZip(entries);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, zip);

process.stdout.write(`wrote ${outPath} (${zip.length} bytes)\n`);
for (const [path, data] of entries) {
  process.stdout.write(`  ${path} (${data.length} bytes)\n`);
}
