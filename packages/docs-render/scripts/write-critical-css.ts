/*
 * Copies the shared `src/critical.css` into a site's public folder, where the
 * renderer links it as `/critical.css`. Each site's `build-indexes` runs it
 * first: `bun ../docs-render/scripts/write-critical-css.ts public`.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const publicDir = process.argv[2];
if (!publicDir) {
  console.error("usage: bun scripts/write-critical-css.ts <publicDir>");
  process.exit(1);
}

const outDir = resolve(publicDir);
mkdirSync(outDir, { recursive: true });
copyFileSync(join(import.meta.dir, "..", "src", "critical.css"), join(outDir, "critical.css"));
