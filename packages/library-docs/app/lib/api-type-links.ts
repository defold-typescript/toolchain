// Deep-link constant-union alias tokens inside a rendered parameter, return or
// field type to the API entry that lists the alias members — the same entry the
// signature heading above the breakdown links to.
//
// Unlike a signature, a type label sits in no enclosing anchor: `nameTypeLabel`
// (see api-page-render) emits it as a bare `<code class="api-type">` whose inner
// text is already HTML-escaped, so an `<a>` can nest *inside* the code and none
// of the anchor-splitting the signature path needs applies here. Escaping at the
// producer is also what makes the run scannable: the inner text holds no `<`
// besides the `api-name` tags around bold parameter names, so one match per run
// is exact, and tokens are looked for only in the text between those tags.
//
// Pure and `node:*`-free (string transform only) so it stays under root
// `bun test` and keeps the `client-graph-node-free` gate green.

import { withBase } from "./base";
import { brandWordRegex, escapeAttr } from "./signature-brand-links";

export const API_TYPE_CODE_OPEN = '<code class="api-type">';
export const API_TYPE_CODE_CLOSE = "</code>";
// A bold slot name: the name code span of a top-level parameter or return
// bullet, and each parameter name inside a function-typed slot's type run.
export const API_NAME_OPEN = '<strong class="api-name">';
export const API_NAME_CLOSE = "</strong>";

const API_TYPE_RUN_RE = new RegExp(
  `${API_TYPE_CODE_OPEN}((?:[^<]|${API_NAME_OPEN}|${API_NAME_CLOSE})*)${API_TYPE_CODE_CLOSE}`,
  "g",
);
const TAG_RE = /(<[^>]*>)/;

/**
 * Wrap every token of `links` appearing in an `api-type` code run in its own
 * anchor. `links` must hold only qualified (dotted) keys: a bare key such as
 * `node` would match inside the escaped string literal of `Opaque<"node">`,
 * because neither `&quot;` nor `;` is a word character. `renderMarkdown` owns
 * that filter so both link passes read one map.
 */
export function linkApiTypeTokens(
  html: string,
  links: ReadonlyMap<string, string>,
  applyBase: (route: string) => string = withBase,
): string {
  if (links.size === 0) return html;
  const tokenRe = brandWordRegex([...links.keys()]);

  return html.replace(API_TYPE_RUN_RE, (run, inner: string) => {
    let linked = false;
    const out = inner.split(TAG_RE).map((piece) =>
      piece.startsWith("<")
        ? piece
        : piece.replace(tokenRe, (name) => {
            linked = true;
            const href = escapeAttr(applyBase(links.get(name) as string));
            return `<a class="api-type-link" href="${href}">${name}</a>`;
          }),
    );
    if (!linked) return run;
    return `${API_TYPE_CODE_OPEN}${out.join("")}${API_TYPE_CODE_CLOSE}`;
  });
}
