import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

/** Sizes a bare icon asset to the surrounding text, marks it decorative, and adds a class hook. */
export function decorateSvg(raw: string, className: string): string {
  return raw.replace(
    "<svg ",
    `<svg class="${className}" aria-hidden="true" width="0.9em" height="0.9em" `,
  );
}

// Load a Phosphor duotone glyph from `@phosphor-icons/core` as the source of
// truth (no hand-copied path data), then decorate the bare asset: size it to
// the surrounding text, mark it decorative, and add a class hook. The asset
// already carries `fill="currentColor"`, so the glyph tracks the link colour.
// Server-only: it reads the asset from disk.
export function phosphorDuotone(name: string, className: string): string {
  const raw = readFileSync(
    nodeRequire.resolve(`@phosphor-icons/core/duotone/${name}-duotone.svg`),
    "utf8",
  );
  return decorateSvg(raw, className);
}
