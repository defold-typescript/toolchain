import { copyFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { hsmSourceFiles } from "../src/vendor-hsm";

const sourceDir = path.resolve(import.meta.dir, "../../hsm/src");
const destDir = path.resolve(import.meta.dir, "../dist/hsm");

mkdirSync(destDir, { recursive: true });
for (const name of hsmSourceFiles(sourceDir)) {
  copyFileSync(path.join(sourceDir, name), path.join(destDir, name));
}
