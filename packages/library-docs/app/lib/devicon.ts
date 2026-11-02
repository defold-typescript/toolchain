import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decorateSvg } from "./phosphor";

const nodeRequire = createRequire(import.meta.url);

const EXTRA_SHAPE = /<(?:g|circle|rect|polygon|style|linearGradient|radialGradient)[\s>/]/;

// Load a Devicon brand mark from the `devicon` package as the source of truth
// (no hand-copied path data) and render it single-colour: the asset's brand
// fills are dropped and the root takes `fill="currentColor"`, so the mark
// tracks the text colour in both themes, like the Phosphor glyphs beside it.
// A mark built from several shapes relies on per-shape colours (a white
// cutout, say) and would collapse into a blob, so it is refused.
// Server-only: it reads the asset from disk.
export function deviconMono(file: string, className: string): string {
  const raw = readFileSync(nodeRequire.resolve(`devicon/icons/${file}.svg`), "utf8");
  if ((raw.match(/<path[\s>/]/g)?.length ?? 0) > 1 || EXTRA_SHAPE.test(raw)) {
    throw new Error(`devicon ${file} is not a single-shape mark`);
  }
  const mono = raw.replace(/\sfill="[^"]*"/g, "").replace("<svg ", '<svg fill="currentColor" ');
  return decorateSvg(mono, className);
}
