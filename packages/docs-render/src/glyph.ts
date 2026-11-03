import { deviconMono } from "./devicon";
import { phosphorDuotone } from "./phosphor";
import type { Glyph } from "./platform-icons";

/** Renders a glyph from whichever icon set it names. Server-only: both loaders read from disk. */
export function glyphSvg(glyph: Glyph, className: string): string {
  return glyph.set === "devicon"
    ? deviconMono(glyph.file, className)
    : phosphorDuotone(glyph.name, className);
}
