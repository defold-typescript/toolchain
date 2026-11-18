// Deep-link global-type brand tokens (today only `Opaque`) inside rendered
// engine signatures to their Reference page. A signature's colored code is
// *already* wrapped in an `<a>` at both render sites (the heading permalink and
// the overview jump link), so wrapping a brand token in its own anchor *inside*
// the code would nest `<a>` in `<a>` — invalid HTML that splits the signature
// markup. Instead `splitSignatureAnchors` in `api-plugins.ts` splits the
// enclosing anchor on the hast around each brand token into sibling anchors: the
// original anchor is re-emitted around the non-brand fragments, and the brand
// word gets its own `signature-symbol-link` anchor between them. The whole split
// is wrapped in a `<span class="signature-split">` so the stylesheet can (a)
// re-anchor the heading permalink icon to the full signature — a re-emitted
// partial `heading-anchor` is a broken offset parent — and (b) neutralize the
// per-fragment pill seams so the run still reads as one signature.
//
// Pure and `node:*`-free so it stays under root `bun test` and keeps the
// `client-graph-node-free` gate green.

// What a signature token resolves to. A plain route is a whole-page target (the
// global-type brands); a page shape is `{ route, heading }` because its anchor is
// not knowable until the render mints the heading id — a shape whose name
// slugifies to the same string as an earlier heading gets a de-duplication
// suffix, so a target built from the label alone would point at that earlier
// heading. `rehypeApiLinks` resolves the union down to plain hrefs once the
// page's headings are minted.
export type SignatureSymbolTarget = string | { route: string; heading: string };

// Whole-word matcher for the brand names, `$`/`_`/alnum boundaries so
// `opaqueThing` and `MyOpaqueX` are left alone. Shared with the parameter/return
// type pass so a token linked in a signature and the same token linked in the
// Parameters breakdown cannot disagree about where a name begins and ends.
export function brandWordRegex(names: readonly string[]): RegExp {
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?<![A-Za-z0-9_$])(?:${alt})(?![A-Za-z0-9_$])`, "g");
}
