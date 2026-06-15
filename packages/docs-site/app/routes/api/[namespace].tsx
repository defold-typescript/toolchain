import { type ApiModule, htmlToDocText } from "@defold-typescript/types";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";
import { type ApiPage, type ApiSymbol, apiModuleSymbols } from "../../lib/api-surface";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";

const KIND_SECTIONS: { kind: ApiSymbol["kind"]; label: string }[] = [
  { kind: "function", label: "Functions" },
  { kind: "variable", label: "Variables" },
  { kind: "constant", label: "Constants" },
  { kind: "property", label: "Properties" },
];

function isEmptyModule(m: ApiModule): boolean {
  return (
    m.functions.length === 0 &&
    m.variables.length === 0 &&
    m.constants.length === 0 &&
    m.properties.length === 0
  );
}

// One `.api-symbol` grid row: the `### signature` heading + prose on the left,
// the highlighted signature and example fences on the right. The blank lines
// around the markdown let markdown-it parse it inside the raw HTML wrappers.
function symbolRow(symbol: ApiSymbol): string {
  const doc = [`### \`${symbol.signature}\``, "", symbol.docMarkdown].join("\n");
  const code = ["```ts", symbol.signature, "```"];
  if (symbol.exampleMarkdown) code.push("", symbol.exampleMarkdown);
  return [
    '<div class="api-symbol">',
    '<div class="api-symbol-doc">',
    "",
    doc,
    "",
    "</div>",
    '<div class="api-symbol-code">',
    "",
    code.join("\n"),
    "",
    "</div>",
    "</div>",
  ].join("\n");
}

// Render the module intro full-width, then each kind's symbols as two-column
// rows. A single combined string keeps Shiki and the heading-id slugger to one
// pass, so per-symbol headings stay uniquely id'd for the "On this page" TOC.
function apiPageMarkdown(page: Pick<ApiPage, "module">): string {
  const m = page.module;
  const symbols = apiModuleSymbols(page);
  const lines: string[] = [`# ${m.namespace}`, ""];
  const intro = htmlToDocText(m.description || m.brief);
  if (intro) lines.push(intro, "");
  for (const { kind, label } of KIND_SECTIONS) {
    const group = symbols.filter((s) => s.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${label}`, "");
    for (const symbol of group) lines.push(symbolRow(symbol), "");
  }
  return lines.join("\n");
}

export default createRoute(
  ssgParams(() => apiPages().map((page) => ({ namespace: page.namespace }))),
  async (c) => {
    const namespace = c.req.param("namespace");
    const page = apiPages().find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    if (isEmptyModule(page.module)) {
      // Honest empty state: the namespace exists, the fixture for it just
      // hasn't been populated with elements yet. Don't pretend there's
      // content — show the brief and a quiet "not yet documented" card.
      return c.render(
        <article class="prose">
          <h1>{page.module.namespace}</h1>
          {page.module.brief ? <p>{htmlToDocText(page.module.brief)}</p> : null}
          <div class="not-prose mt-6 rounded-lg border border-dashed border-border bg-surface px-5 py-6 text-sm text-text-muted">
            <p class="font-medium text-text">No symbols documented yet</p>
            <p class="mt-1">
              The Defold reference fixture for this namespace ships with no elements, so the
              reference surface for it is empty. Once a populated fixture lands, the page picks up
              functions, variables, constants, and properties automatically.
            </p>
          </div>
        </article>,
        { title: `${page.module.namespace} API` },
      );
    }

    const html = await renderMarkdown(apiPageMarkdown(page));
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
