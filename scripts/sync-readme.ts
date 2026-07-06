import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SOURCE_README = "packages/docs/guide/README.md";
export const ROOT_README = "README.md";

const GENERATED_HEADER = `<!-- Generated from ${SOURCE_README} by \`bun run readme:sync\`. Do not edit directly. -->\n\n`;

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  return markdown.slice(end + "\n---\n".length);
}

function rewriteGuideLinksForGitHub(markdown: string): string {
  return markdown
    .replace(/\]\(\.\/([^\s)]+\.md(?:#[^)]+)?)\)/g, `](packages/docs/guide/$1)`)
    .replace(/\]\(\/api(\/[^)]*)?\)/g, (_match, path = "") => {
      return `](https://defold-typescript.github.io/toolchain/api${path})`;
    });
}

function rewriteGuideImagesForGitHub(markdown: string): string {
  return markdown.replace(
    /^!\[defold-typescript logo\]\(logo-ver-classic\.png#max-width=200\)$/m,
    `<p align="center">\n  <img src="packages/docs/guide/logo-ver-classic.png" alt="defold-typescript logo" width="128" height="128">\n</p>`,
  );
}

export function generateRootReadme(source: string): string {
  const body = rewriteGuideLinksForGitHub(rewriteGuideImagesForGitHub(stripFrontmatter(source)));
  return `${GENERATED_HEADER}${body.trimEnd()}\n`;
}

function usage(): never {
  console.error("usage: bun scripts/sync-readme.ts --check|--write");
  process.exit(2);
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== "--check" && mode !== "--write") usage();

  const sourcePath = resolve(SOURCE_README);
  const rootPath = resolve(ROOT_README);
  const expected = generateRootReadme(readFileSync(sourcePath, "utf8"));

  if (mode === "--write") {
    writeFileSync(rootPath, expected);
    console.log(`${ROOT_README} synced from ${SOURCE_README}`);
    process.exit(0);
  }

  const actual = readFileSync(rootPath, "utf8");
  if (actual !== expected) {
    console.error(`${ROOT_README} is stale. Run: bun run readme:sync`);
    process.exit(1);
  }

  console.log(`${ROOT_README} is in sync with ${SOURCE_README}`);
}
