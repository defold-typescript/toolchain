// Deep-link global-type brand tokens (today only `Opaque`) inside rendered
// engine signatures to their Reference page. Signatures are recolored into
// `<code class="api-signature shiki">…</code>` that is *already* wrapped in an
// `<a>` at both render sites (the heading permalink and the overview jump link),
// so wrapping a brand token in its own anchor *inside* the code would nest
// `<a>` in `<a>` — invalid HTML that splits the signature markup. Instead this
// splits the enclosing anchor around each brand token into sibling anchors: the
// original open tag is re-emitted verbatim around the non-brand fragments, and
// the brand word gets its own `signature-symbol-link` anchor between them. The
// whole split is wrapped in a `<span class="signature-split">` so the stylesheet
// can (a) re-anchor the heading permalink icon to the full signature — a
// re-emitted partial `heading-anchor` is a broken offset parent — and (b)
// neutralize the per-fragment pill seams so the run still reads as one signature.
//
// Pure and `node:*`-free (string transform only) so it stays under root
// `bun test` and keeps the `client-graph-node-free` gate green.

import { withBase } from "./base";

const CODE_OPEN = '<code class="api-signature shiki">';
const CODE_CLOSE = "</code>";

// An `<a …>` whose first child is an api-signature `<code>`, then the code, then
// any trailing non-code content (the heading-anchor icon), up to `</a>`. Prose
// links never wrap an api-signature code, so this matches only signature anchors.
// No nested anchors exist in this markup, so the first `</a>` closes the match.
const SIGNATURE_ANCHOR_RE = new RegExp(
  `(<a\\b[^>]*>)(${CODE_OPEN}.*?${CODE_CLOSE})((?:(?!</a>).)*?)</a>`,
  "gs",
);

// A flat `<span style="…">TEXT</span>` unit inside the recolored code. Shiki
// emits the code inner as an adjacent run of these; TEXT never contains `<`.
const SPAN_RE = /<span style="([^"]*)">([^<]*)<\/span>/g;

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Whole-word matcher for the brand names, `$`/`_`/alnum boundaries so
// `opaqueThing` and `MyOpaqueX` are left alone.
function brandWordRegex(names: readonly string[]): RegExp {
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?<![A-Za-z0-9_$])(?:${alt})(?![A-Za-z0-9_$])`, "g");
}

type Span = { style: string; text: string };

function renderSpans(spans: readonly Span[]): string {
  return spans.map((s) => `<span style="${s.style}">${s.text}</span>`).join("");
}

export function splitSignatureBrandLinks(
  html: string,
  links: ReadonlyMap<string, string>,
  applyBase: (route: string) => string = withBase,
): string {
  if (links.size === 0) return html;
  const brandRe = brandWordRegex([...links.keys()]);

  return html.replace(
    SIGNATURE_ANCHOR_RE,
    (match, open: string, codeBlock: string, tail: string) => {
      const inner = codeBlock.slice(CODE_OPEN.length, codeBlock.length - CODE_CLOSE.length);
      const spans: Span[] = [];
      for (const m of inner.matchAll(SPAN_RE)) {
        spans.push({ style: m[1] as string, text: m[2] as string });
      }

      const outerFragment = (frag: readonly Span[], trailing: string): string =>
        `${open}${CODE_OPEN}${renderSpans(frag)}${CODE_CLOSE}${trailing}</a>`;
      const brandFragment = (route: string, style: string, name: string): string =>
        `<a class="signature-symbol-link" href="${escapeAttr(applyBase(route))}">${CODE_OPEN}<span style="${style}">${name}</span>${CODE_CLOSE}</a>`;

      const out: string[] = [];
      let pre: Span[] = [];
      let found = false;
      for (const span of spans) {
        brandRe.lastIndex = 0;
        let last = 0;
        let m: RegExpExecArray | null;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
        while ((m = brandRe.exec(span.text)) !== null) {
          found = true;
          const name = m[0];
          const before = span.text.slice(last, m.index);
          if (before) pre.push({ style: span.style, text: before });
          if (pre.length > 0) out.push(outerFragment(pre, ""));
          pre = [];
          out.push(brandFragment(links.get(name) as string, span.style, name));
          last = m.index + name.length;
        }
        const rest = span.text.slice(last);
        if (rest) pre.push({ style: span.style, text: rest });
      }
      if (!found) return match;
      if (pre.length > 0 || tail) out.push(outerFragment(pre, tail));
      return `<span class="signature-split">${out.join("")}</span>`;
    },
  );
}
