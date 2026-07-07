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
 * Outputs two committed artifacts consumed by the render path:
 *   - app/generated/fonts.css  — the @font-face fallbacks + the --font-* @theme
 *     tokens, @import-ed by app/styles.css.
 *   - app/generated/fonts.ts   — the same --font-* stack as a string plus the
 *     preload list, imported by app/routes/_renderer.tsx so the inline <head>
 *     tokens and the <link rel="preload"> set stay in lockstep with this file.
 *
 * Regenerate after changing fonts or weights: `bun run build-font-fallbacks`.
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

/** Latin-subset primaries preloaded in <head>; must be woff2 filenames Vite keeps verbatim. */
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

const outDir = join(import.meta.dir, "..", "app", "generated");
mkdirSync(outDir, { recursive: true });

const banner =
  "/* GENERATED by scripts/build-font-fallbacks.ts — do not edit.\n   Regenerate: bun run build-font-fallbacks */";

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

console.log(`fonts.css: ${faceBlocks.length} fallback faces across ${FAMILIES.length} families`);
