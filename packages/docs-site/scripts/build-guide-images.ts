import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

// Mirror the guide's image assets into public/ so the docs site serves them at
// `/img/<name>` (the src the guide markdown uses). The guide source is the single
// source of truth; this keeps the served copy from going stale after a source
// image is edited by hand. Runs as part of `build-indexes`, before Vite copies
// public/ into dist/. `public/img` is a plain tracked mirror, not gitignored, so
// an unchanged image produces no diff.
const SCRIPTS_DIR = import.meta.dir;
const GUIDE_IMG_DIR = join(SCRIPTS_DIR, "..", "..", "docs", "guide", "img");
const PUBLIC_IMG_DIR = join(SCRIPTS_DIR, "..", "public", "img");

if (!existsSync(GUIDE_IMG_DIR)) {
  console.log("guide-images: no guide/img directory, nothing to sync");
  process.exit(0);
}

// Rebuild the mirror from scratch so a renamed or deleted source image does not
// linger in public/.
rmSync(PUBLIC_IMG_DIR, { recursive: true, force: true });
cpSync(GUIDE_IMG_DIR, PUBLIC_IMG_DIR, { recursive: true });
console.log("guide-images: synced guide/img -> public/img");
