import { htmlToDocText } from "@defold-typescript/types";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { apiPages } from "../../lib/api-content";
import {
  type ApiPage,
  type ApiSymbol,
  type ApiSymbolParam,
  apiModuleSymbols,
  functionSummaryTable,
  groupFunctionSymbols,
} from "../../lib/api-surface";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";
import { buildSymbolIndex } from "../../lib/symbol-index";
import { linkifySymbolMentions } from "../../lib/symbol-linkify";

const KIND_SECTIONS: { kind: ApiSymbol["kind"]; label: string }[] = [
  { kind: "function", label: "Functions" },
  { kind: "variable", label: "Variables" },
  { kind: "constant", label: "Constants" },
  { kind: "property", label: "Properties" },
];

function paramBullet(p: ApiSymbolParam): string {
  const parts: string[] = [];
  if (p.name) parts.push(`\`${p.name}\`${p.isOptional ? "?" : ""}`);
  const types = p.types.join(" | ");
  if (types) parts.push(`*${types}*`);
  let bullet = `- ${parts.join(" ")}`;
  if (p.doc) bullet += ` — ${p.doc}`;
  return bullet;
}

function paramSection(label: string, params: ApiSymbolParam[]): string {
  return [`**${label}**`, "", ...params.map(paramBullet)].join("\n");
}

// One symbol, single column: the `### signature` heading is the title, and the
// description + example are wrapped in an indented `.api-symbol-body` so the body
// reads as subordinate to the title. The signature is not repeated as a code
// block — the heading already shows it. The blank lines around the inner markdown
// let markdown-it parse it inside the raw HTML wrapper.
function symbolBlock(symbol: ApiSymbol): string {
  const heading = `### \`${symbol.signature}\``;
  const body: string[] = [];
  if (symbol.docMarkdown) body.push(symbol.docMarkdown);
  if (symbol.exampleMarkdown) body.push(symbol.exampleMarkdown);
  if (symbol.parameters.length > 0) body.push(paramSection("Parameters", symbol.parameters));
  if (symbol.returnValues.length > 0) body.push(paramSection("Returns", symbol.returnValues));
  if (body.length === 0) return heading;
  return [heading, "", '<div class="api-symbol-body">', "", body.join("\n\n"), "", "</div>"].join(
    "\n",
  );
}

// Render the module intro, then each kind's symbols stacked in one column. A
// single combined string keeps Shiki and the heading-id slugger to one pass, so
// per-symbol headings stay uniquely id'd for the "On this page" TOC. The
// `linkify` callback rewrites bare symbol mentions in the prose to local
// `/api/<namespace>` links (example code fences and signature headings are
// skipped — `linkify` is plain-text only and the route never hands it the
// example or signature fields).
function apiPageMarkdown(
  page: Pick<ApiPage, "module" | "translations">,
  linkify: (text: string) => string,
): string {
  const m = page.module;
  const symbols = apiModuleSymbols(page, page.translations);
  const lines: string[] = [`# ${m.namespace}`, ""];
  const intro = htmlToDocText(m.description || m.brief);
  if (intro) lines.push(linkify(intro), "");
  const emitSymbol = (symbol: ApiSymbol) => {
    const linkified: ApiSymbol = {
      ...symbol,
      docMarkdown: linkify(symbol.docMarkdown),
      parameters: symbol.parameters.map((p) => ({ ...p, doc: linkify(p.doc) })),
      returnValues: symbol.returnValues.map((r) => ({ ...r, doc: linkify(r.doc) })),
    };
    lines.push(symbolBlock(linkified), "");
  };
  for (const { kind, label } of KIND_SECTIONS) {
    const group = symbols.filter((s) => s.kind === kind);
    if (group.length === 0) continue;
    // Colon-named handle methods (`file:read`, `client:send`) get their own
    // `<receiver> methods` heading so they read apart from the module table.
    if (kind === "function") {
      for (const fnGroup of groupFunctionSymbols(group)) {
        lines.push(`## ${fnGroup.label}`, "");
        lines.push(functionSummaryTable(fnGroup.symbols), "");
        for (const symbol of fnGroup.symbols) emitSymbol(symbol);
      }
      continue;
    }
    lines.push(`## ${label}`, "");
    for (const symbol of group) emitSymbol(symbol);
  }
  return lines.join("\n");
}

export default createRoute(
  ssgParams(() => apiPages().map((page) => ({ namespace: page.namespace }))),
  async (c) => {
    const namespace = c.req.param("namespace");
    const page = apiPages().find((entry) => entry.namespace === namespace);
    if (!page) return c.notFound();

    // Build the linkify registry from the full surface. `linkifySymbolMentions`
    // itself drops bare-namespace keys (no `.`) — pointing a prose mention at
    // `/api/camera` is too broad; only qualified member keys like
    // `camera.screen_to_world` (with the heading-slug anchor) are linked.
    const linkRegistry = new Map(
      Object.entries(buildSymbolIndex(apiPages())).map(([k, v]) => [k, v.route]),
    );
    const linkify = (text: string) => linkifySymbolMentions(text, linkRegistry);
    const html = await renderMarkdown(apiPageMarkdown(page, linkify), {
      highlightSignatureHeadings: true,
    });
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: `${page.module.namespace} API`,
      headings: pageHeadings(html),
    });
  },
);
