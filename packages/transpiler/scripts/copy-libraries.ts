import { copyFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { BUNDLED_LIBRARIES, librarySourceFiles } from "../src/bundled-libraries";

for (const { id } of BUNDLED_LIBRARIES) {
  const sourceDir = path.resolve(import.meta.dir, "../..", id, "src");
  const destDir = path.resolve(import.meta.dir, "../dist", id);
  mkdirSync(destDir, { recursive: true });
  for (const name of librarySourceFiles(sourceDir)) {
    copyFileSync(path.join(sourceDir, name), path.join(destDir, name));
  }
}
