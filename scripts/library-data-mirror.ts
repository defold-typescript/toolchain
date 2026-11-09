import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Writes the tree defold-typescript/library-data publishes: this repo's library
// data, its NOTICE and LICENSE, and a README that sends changes back here. The
// target ends up holding exactly that, so a file deleted here is deleted there;
// only its `.git` is left alone. The publish workflow runs it on each change.
// It refuses a target that is, holds or sits inside this repo, through any alias.

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LIBRARY_TYPES = "packages/library-types";
const TOOLCHAIN = "https://github.com/defold-typescript/toolchain";

const README = `# library-data

Library data for the [defold-typescript toolchain](${TOOLCHAIN}). See the [library guide](${TOOLCHAIN}/blob/main/packages/docs/guide/library.md).

This repository is written whole from [\`packages/library-types/data\`](${TOOLCHAIN}/tree/main/packages/library-types/data) in \`defold-typescript/toolchain\` each time that folder changes, so make changes there: a change made here is overwritten by the next publish. The [library docs site](https://defold-typescript.github.io/library-data/) is built from \`packages/library-docs\` in the same repository and served from this repository's \`gh-pages\` branch.

Each folder under \`data/\` holds the data of one data format, named for the first CLI release that reads it. [\`data/README.md\`](data/README.md) says which releases read each folder and when a change needs a new one.

A data folder also holds the extension docs, portal listings and display metadata the library docs site reads.
`;

function realPath(path: string): string {
  let existing = resolve(path);
  const missing: string[] = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    missing.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync.native(existing), ...missing);
}

function holds(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function writeMirror(repoRoot: string, target: string): void {
  const realRepo = realPath(repoRoot);
  const realTarget = realPath(target);
  if (holds(realRepo, realTarget) || holds(realTarget, realRepo)) {
    throw new Error(`refusing to write ${target}: it overlaps the source repo ${repoRoot}`);
  }
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(target)) {
    if (entry !== ".git") rmSync(join(target, entry), { recursive: true, force: true });
  }
  const source = join(repoRoot, LIBRARY_TYPES);
  cpSync(join(source, "data"), join(target, "data"), { recursive: true });
  for (const file of ["NOTICE", "LICENSE"]) cpSync(join(source, file), join(target, file));
  writeFileSync(join(target, "README.md"), README);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { target: { type: "string" } }, strict: true });
  if (!values.target) {
    console.error("usage: bun scripts/library-data-mirror.ts --target <library-data checkout>");
    process.exit(2);
  }
  writeMirror(REPO_ROOT, values.target);
}
