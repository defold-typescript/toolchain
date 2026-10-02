import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SOURCE_README = "packages/docs/guide/README.md";
export const ROOT_README = "README.md";
export const AVAILABILITY_JSON = "packages/types/api-availability.json";

const SUPPORTED_VERSIONS_PREFIX = "> Defold versions supported:";

// Published docs base. The root README lives on GitHub, where guide-local `.md`
// links and `/api` routes have no meaning, so both are rewritten to the live
// site so readers land on the rendered docs.
export const SITE_BASE = "https://defold-typescript.github.io/toolchain";

const GENERATED_HEADER = `<!-- Generated from ${SOURCE_README} by \`bun run readme:sync\`. Do not edit directly. -->\n\n`;

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  return markdown.slice(end + "\n---\n".length);
}

function rewriteGuideLinksForSite(markdown: string): string {
  return markdown
    .replace(/\]\(\.\/([^\s)#]+)\.md(#[^)]+)?\)/g, (_match, slug, anchor = "") => {
      // `./getting-started.md` and `./agent-runbooks.md#anchor` map to the guide's
      // clean site route (`.md` dropped), preserving any fragment.
      return `](${SITE_BASE}/${slug}${anchor})`;
    })
    .replace(/\]\(\/api(\/[^)]*)?\)/g, (_match, path = "") => {
      return `](${SITE_BASE}/api${path})`;
    })
    .replace(/\]\(\/(llms(?:-full)?\.txt)\)/g, (_match, file) => {
      // `/llms.txt` and `/llms-full.txt` are static assets served at the site
      // base root; on GitHub they need the absolute site URL.
      return `](${SITE_BASE}/${file})`;
    });
}

function rewriteGuideImagesForGitHub(markdown: string): string {
  return markdown.replace(
    /^!\[defold-typescript logo\]\(logo-ver-classic\.png#max-width=200\)$/m,
    `<p align="center">\n  <img src="packages/docs/guide/logo-ver-classic.png" alt="defold-typescript logo" width="128" height="128">\n</p>`,
  );
}

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// The versions axis of `api-availability.json` is every Defold release with a
// complete committed API surface, so it is the list the guide advertises.
export function readSupportedVersions(availabilityJson: string): string[] {
  const { versions } = JSON.parse(availabilityJson) as { versions: string[] };
  return [...versions].sort(compareVersions);
}

export function supportedVersionsLine(versions: readonly string[]): string {
  return `${SUPPORTED_VERSIONS_PREFIX} ${versions.join(", ")}`;
}

export function withSupportedVersions(source: string, versions: readonly string[]): string {
  const lines = source.split("\n");
  const index = lines.findIndex((line) => line.startsWith(SUPPORTED_VERSIONS_PREFIX));
  if (index === -1) {
    throw new Error(`${SOURCE_README} has no "${SUPPORTED_VERSIONS_PREFIX}" line`);
  }
  lines[index] = supportedVersionsLine(versions);
  return lines.join("\n");
}

export function generateRootReadme(source: string): string {
  const body = rewriteGuideLinksForSite(rewriteGuideImagesForGitHub(stripFrontmatter(source)));
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
  const source = readFileSync(sourcePath, "utf8");
  const versions = readSupportedVersions(readFileSync(resolve(AVAILABILITY_JSON), "utf8"));
  const expectedSource = withSupportedVersions(source, versions);
  const expected = generateRootReadme(expectedSource);

  if (mode === "--write") {
    writeFileSync(sourcePath, expectedSource);
    writeFileSync(rootPath, expected);
    console.log(`${ROOT_README} synced from ${SOURCE_README}`);
    process.exit(0);
  }

  if (source !== expectedSource) {
    console.error(`${SOURCE_README} lists stale Defold versions. Run: bun run readme:sync`);
    process.exit(1);
  }

  const actual = readFileSync(rootPath, "utf8");
  if (actual !== expected) {
    console.error(`${ROOT_README} is stale. Run: bun run readme:sync`);
    process.exit(1);
  }

  console.log(`${ROOT_README} is in sync with ${SOURCE_README}`);
}
