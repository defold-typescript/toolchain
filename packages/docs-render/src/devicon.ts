import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decorateSvg } from "./phosphor";

const nodeRequire = createRequire(import.meta.url);

const SHAPE = /<(?:path|circle|rect|polygon|ellipse)[\s>/][^>]*>/g;
const PAINT = /<(?:style|linearGradient|radialGradient)[\s>/]/;

// Load a Devicon brand mark from the `devicon` package as the source of truth
// (no hand-copied path data) and render it single-colour: the asset's brand
// fills are dropped and the root takes `fill="currentColor"`, so the mark
// tracks the text colour in both themes, like the Phosphor glyphs beside it.
// A mark whose shapes carry their own colours (a white cutout, say) would
// collapse into a blob, so it is refused; shapes that all inherit one fill,
// as GitHub's do from their group, keep their look.
// Server-only: it reads the asset from disk.
export function deviconMono(file: string, className: string): string {
  const raw = readFileSync(nodeRequire.resolve(`devicon/icons/${file}.svg`), "utf8");
  const shapes = raw.match(SHAPE) ?? [];
  const fills = new Set(raw.match(/\sfill="[^"]*"/g) ?? []);
  if (
    PAINT.test(raw) ||
    fills.size > 1 ||
    (shapes.length > 1 && shapes.some((shape) => /\sfill="/.test(shape)))
  ) {
    throw new Error(`devicon ${file} draws its shapes in more than one colour`);
  }
  const mono = raw.replace(/\sfill="[^"]*"/g, "").replace("<svg ", '<svg fill="currentColor" ');
  return decorateSvg(mono, className);
}
