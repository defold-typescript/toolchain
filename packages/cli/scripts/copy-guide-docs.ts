import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const source = resolve(repoRoot, "docs/guide");
const dest = resolve(here, "../docs/guide");

rmSync(dest, { recursive: true, force: true });
cpSync(source, dest, { recursive: true });
