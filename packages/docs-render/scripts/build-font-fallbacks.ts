/*
 * Generates metric-matched fallback @font-face rules — one per web-font weight —
 * so the swap from the local fallback (Arial / Courier New) to the real web font
 * changes glyph shapes but not layout, eliminating font-load CLS.
 *
 * Why per weight: the fallback's `size-adjust`/`*-override` values depend on the
 * web font's average advance width, which differs between weights. A single set
 * of overrides tuned at weight 400 leaves bold text (headings, links) to reflow
 * on swap. Capsize reads the real metrics from each bundled .woff2 (`fromFile`)
 * and pairs them with Arial's regular or bold metrics (`>= 600` -> Arial Bold),
 * emitting an accurate override set per weight.
 *
 * Outputs three committed artifacts consumed by both docs sites' render path:
 *   - src/generated/fonts.css  — the @font-face fallbacks + the --font-* @theme
 *     tokens, @import-ed by src/styles.css.
 *   - src/generated/fonts.ts   — the same --font-* stack as a string plus the
 *     preload list, imported by src/theme-tokens.ts and the post-build preload
 *     check so the inline <head> tokens and the checked preload set stay in
 *     lockstep with this file.
 *   - src/generated/font-preloads.ts — a Vite `?url` import per preload file,
 *     imported by each site's src/pages/_root.tsx so every <link rel="preload">
 *     names the hashed URL the build emits. Bun cannot load `?url`, so no test
 *     imports it.
 *
 * Regenerate after changing fonts or weights:
 * `bun run --cwd packages/docs-render build-font-fallbacks`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createFontStack } from "@capsizecss/core";
import arial from "@capsizecss/metrics/arial";
import arialBold from "@capsizecss/metrics/arial/700";
import courierNew from "@capsizecss/metrics/courierNew";
import { fromFile } from "@capsizecss/unpack/fs";

/** Metrics for a system fallback, and the weight above which the bold variant applies. */
type FamilyConfig = {
  /** Tailwind token this family backs. */
  token: "--font-sans" | "--font-heading" | "--font-mono";
  /** Registered family of the real web font, first in the stack. */
  primary: string;
  /** Canonical name forced onto every weight's metrics so the generated
   *  fallback family stays stable (Fontsource reports per-weight names like
   *  "Barlow Medium", which would otherwise yield "Barlow Medium Fallback"). */
  canonicalName: string;
  /** Generic families appended after the metric-matched fallback. */
  tail: string;
  /** Fontsource package the .woff2 files ship in. */
  pkg: string;
  /** `[weight, filename]` pairs; weight is null for a single variable face. */
  faces: Array<{ weight: number | null; file: string }>;
  /** System font Capsize derives the fallback metrics + `local()` from. */
  fallback: (weight: number | null) => typeof arial;
};

const SANS_TAIL = "ui-sans-serif, system-ui, sans-serif";

const FAMILIES: FamilyConfig[] = [
  {
    token: "--font-sans",
    primary: "Barlow",
    canonicalName: "Barlow",
    tail: SANS_TAIL,
    pkg: "@fontsource/barlow",
    faces: [400, 500, 600, 700].map((w) => ({ weight: w, file: `barlow-latin-${w}-normal.woff2` })),
    fallback: (w) => ((w ?? 400) >= 600 ? arialBold : arial),
  },
  {
    token: "--font-heading",
    primary: "Ubuntu",
    canonicalName: "Ubuntu",
    tail: SANS_TAIL,
    pkg: "@fontsource/ubuntu",
    // 600 headings resolve to the 700 face via CSS weight matching, so 500 + 700
    // (plus 400 body) cover every heading weight without a dedicated 600 file.
    faces: [400, 500, 700].map((w) => ({ weight: w, file: `ubuntu-latin-${w}-normal.woff2` })),
    fallback: (w) => ((w ?? 400) >= 600 ? arialBold : arial),
  },
  {
    token: "--font-mono",
    primary: "Spline Sans Mono Variable",
    canonicalName: "Spline Sans Mono",
    tail: "ui-monospace, SFMono-Regular, Menlo, monospace",
    pkg: "@fontsource-variable/spline-sans-mono",
    faces: [{ weight: null, file: "spline-sans-mono-latin-wght-normal.woff2" }],
    fallback: () => courierNew,
  },
];

/** Latin-subset primaries preloaded in <head>; Vite hashes each name, so the head takes the built URL. */
const PRELOAD_FONT_FILES = [
  "barlow-latin-400-normal.woff2",
  "barlow-latin-500-normal.woff2",
  "ubuntu-latin-700-normal.woff2",
  "spline-sans-mono-latin-wght-normal.woff2",
];

function fontDir(pkg: string): string {
  const pkgJson = Bun.resolveSync(`${pkg}/package.json`, import.meta.dir);
  return join(dirname(pkgJson), "files");
}

const faceBlocks: string[] = [];
const tokenLines: string[] = [];

for (const family of FAMILIES) {
  const dir = fontDir(family.pkg);
  for (const { weight, file } of family.faces) {
    const metrics = await fromFile(join(dir, file));
    const { fontFaces } = createFontStack(
      [{ ...metrics, familyName: family.canonicalName }, family.fallback(weight)],
      { fontFaceProperties: weight === null ? { fontWeight: "100 700" } : { fontWeight: weight } },
    );
    faceBlocks.push(fontFaces.trim());
  }
  const fallbackName = `${family.canonicalName} Fallback`;
  tokenLines.push(`  ${family.token}: "${family.primary}", "${fallbackName}", ${family.tail};`);
}

const outDir = join(import.meta.dir, "..", "src", "generated");
mkdirSync(outDir, { recursive: true });

const banner =
  "/* GENERATED by scripts/build-font-fallbacks.ts — do not edit.\n   Regenerate: bun run --cwd packages/docs-render build-font-fallbacks */";

writeFileSync(
  join(outDir, "fonts.css"),
  `${banner}\n\n${faceBlocks.join("\n\n")}\n\n@theme {\n${tokenLines.join("\n")}\n}\n`,
);

const tsBanner = banner
  .replace(/^\/\* /, "// ")
  .replace(/ \*\/$/, "")
  .replace(/\n {3}/g, "\n// ");
writeFileSync(
  join(outDir, "fonts.ts"),
  `${tsBanner}\n\nexport const FONT_TOKENS = \`\n${tokenLines.join("\n")}\`;\n\n` +
    `export const PRELOAD_FONT_FILES = ${JSON.stringify(PRELOAD_FONT_FILES, null, 2)} as const;\n`,
);

function familyPackage(file: string): string {
  const family = FAMILIES.find((candidate) => candidate.faces.some((face) => face.file === file));
  if (!family) throw new Error(`preload font ${file} belongs to no family in FAMILIES`);
  return family.pkg;
}

function importName(file: string): string {
  return file
    .replace(/\.woff2$/, "")
    .replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());
}

const preloadImports = PRELOAD_FONT_FILES.map(
  (file) => `import ${importName(file)} from "${familyPackage(file)}/files/${file}?url";`,
);
writeFileSync(
  join(outDir, "font-preloads.ts"),
  `${tsBanner}\n/// <reference types="vite/client" />\n\n${preloadImports.join("\n")}\n\n` +
    `export const FONT_PRELOAD_URLS: readonly string[] = [\n` +
    `${PRELOAD_FONT_FILES.map((file) => `  ${importName(file)},`).join("\n")}\n];\n`,
);

console.log(`fonts.css: ${faceBlocks.length} fallback faces across ${FAMILIES.length} families`);
