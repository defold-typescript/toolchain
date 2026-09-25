/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.

// An inlined guide figure. The component, not the SVG, owns the size: it caps
// the figure on a wide page and lays each panel out as its own `<svg>`, so side-
// by-side panels share a row while they fit and stack full width on a narrow
// page. Markdown renderers stringify it with `String(<SvgFigure />)`, so the
// component must stay synchronous.
export type SvgFigureProps = {
  /** The figure file's markup, starting at its root `<svg`. */
  svg: string;
  /** Plain text: the figure's accessible name and its visible caption. */
  caption: string;
  /** Where the markup came from, named in errors. */
  src: string;
  /** A CSS length that caps the figure below its default width. */
  maxWidth?: string;
};

// A figure file marks its panels as nested `<svg class="fig-panel" viewBox="…">`
// elements, which keeps the file a whole figure when opened on its own; a file
// without them is one panel. A figure that cannot be cut into panels (a chain of
// boxes joined by arrows) instead carries whole alternative drawings as nested
// `<svg class="fig-layout" data-layout="wide|narrow">`; the stylesheet shows the
// one that fits the figure's width. Neither kind nests inside the other.
const FIG_PANEL = /<svg\b([^>]*\bclass="fig-panel"[^>]*)>([\s\S]*?)<\/svg>/g;
const FIG_LAYOUT = /<svg\b([^>]*\bclass="fig-layout"[^>]*)>([\s\S]*?)<\/svg>/g;

export type SvgFigureKind = "panels" | "single" | "layouts";

/**
 * One `<svg>` per panel or layout, each carrying its viewBox width as `--w`: the
 * stylesheet sizes every panel by that width, so panels in one row keep one
 * common scale. A layout keeps its `data-layout` so the stylesheet can pick it.
 */
export function svgFigurePanels(
  svg: string,
  src: string,
): { kind: SvgFigureKind; panels: string[] } {
  const root = /^\s*<svg\b([^>]*)>/.exec(svg);
  if (!root) throw new Error(`inline SVG figure has no SVG markup to inline: ${src}`);
  const rootAttrs = root[1] ?? "";
  const body = svg.slice(root.index + root[0].length, svg.lastIndexOf("</svg>"));
  const shared = rootAttrs.replace(/\s+(?:viewBox|width|height)="[^"]*"/g, "");
  const nested = (pattern: RegExp) =>
    [...body.matchAll(pattern)].map((m) => ({ attrs: m[1] ?? "", inner: m[2] ?? "" }));
  const layouts = nested(FIG_LAYOUT);
  const panels = nested(FIG_PANEL);
  const kind: SvgFigureKind =
    layouts.length > 0 ? "layouts" : panels.length > 0 ? "panels" : "single";
  const parts =
    kind === "layouts" ? layouts : kind === "panels" ? panels : [{ attrs: rootAttrs, inner: body }];
  return {
    kind,
    panels: parts.map(({ attrs, inner }) => {
      const viewBox = /\bviewBox="([^"]*)"/.exec(attrs)?.[1];
      const width = Number(viewBox?.trim().split(/[\s,]+/)[2]);
      if (!viewBox || !(width > 0)) {
        throw new Error(`inline SVG figure panel has no usable viewBox: ${src}`);
      }
      const layout =
        kind === "layouts" ? /\bdata-layout="(wide|narrow)"/.exec(attrs)?.[1] : undefined;
      if (kind === "layouts" && !layout) {
        throw new Error(`inline SVG figure layout needs data-layout="wide" or "narrow": ${src}`);
      }
      const layoutAttr = layout ? ` data-layout="${layout}"` : "";
      return `<svg${shared} viewBox="${viewBox}" style="--w: ${width}"${layoutAttr} aria-hidden="true" focusable="false">${inner}</svg>`;
    }),
  };
}

export function SvgFigure({ svg, caption, src, maxWidth }: SvgFigureProps) {
  const { kind, panels } = svgFigurePanels(svg, src);
  const className =
    kind === "single"
      ? "figure-svg figure-svg--single"
      : kind === "layouts"
        ? "figure-svg figure-svg--layouts"
        : "figure-svg";
  return (
    <figure
      data-slot="svg-figure"
      class={className}
      style={maxWidth ? `max-width: min(100%, ${maxWidth})` : undefined}
    >
      <div
        data-slot="svg-figure-panels"
        class="figure-svg-panels"
        role="img"
        aria-label={caption}
        dangerouslySetInnerHTML={{ __html: panels.join("") }}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
