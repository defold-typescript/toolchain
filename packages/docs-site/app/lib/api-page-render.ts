import { htmlToDocText } from "@defold-typescript/types";
import {
  type ApiPage,
  type ApiSymbol,
  type ApiSymbolParam,
  apiModuleSymbols,
  functionOverviewCards,
  groupFunctionSymbols,
} from "./api-surface";
import {
  type ApiVersion,
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import { buildSymbolIndex } from "./symbol-index";
import { linkifySymbolMentions } from "./symbol-linkify";

const KIND_SECTIONS: { kind: ApiSymbol["kind"]; label: string }[] = [
  { kind: "function", label: "Functions" },
  { kind: "variable", label: "Variables" },
  { kind: "constant", label: "Constants" },
  { kind: "property", label: "Properties" },
];

// An object-literal member and its subtree, indented two spaces per depth so
// markdown-it nests it under the parameter bullet. Each member reads
// `` `name`?: `type` — doc ``, keeping the member type inline (backticked)
// rather than italic so a nested literal token stays legible.
function fieldBullets(fields: ApiSymbolParam[], depth: number): string[] {
  const indent = "  ".repeat(depth + 1);
  const out: string[] = [];
  for (const f of fields) {
    const name = `\`${f.name}\`${f.isOptional ? "?" : ""}`;
    let bullet = `${indent}- ${name}: \`${f.types.join(" | ")}\``;
    if (f.doc) bullet += ` — ${f.doc}`;
    out.push(bullet);
    if (f.fields && f.fields.length > 0) out.push(...fieldBullets(f.fields, depth + 1));
  }
  return out;
}

function paramBullet(p: ApiSymbolParam): string {
  const parts: string[] = [];
  if (p.name) parts.push(`\`${p.name}\`${p.isOptional ? "?" : ""}`);
  const types = p.types.join(" | ");
  if (types) parts.push(`*${types}*`);
  let bullet = `- ${parts.join(" ")}`;
  if (p.doc) bullet += ` — ${p.doc}`;
  if (p.fields && p.fields.length > 0) {
    return [bullet, ...fieldBullets(p.fields, 0)].join("\n");
  }
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
// `/api/<namespace>` links; it skips backtick-fenced code spans, so a Markdown
// intro carrying an `@example` fence is safe to pass through it.
//
// global-type pages carry a Markdown description (derived from the canonical
// JSDoc); it goes straight to the shared `markdown-it` pipeline so fenced
// examples and bullet lists render verbatim. ref-doc descriptions are HTML and
// still flow through `htmlToDocText` first.
export function apiPageMarkdown(
  page: Pick<ApiPage, "module" | "translations" | "signatures" | "category">,
  linkify: (text: string) => string,
): string {
  const m = page.module;
  const symbols = apiModuleSymbols(page, page.translations, page.signatures);
  const lines: string[] = [`# ${m.namespace}`, ""];
  const raw = m.description || m.brief;
  const intro = page.category === "global-type" ? raw : htmlToDocText(raw);
  if (intro) lines.push(linkify(intro), "");
  const linkifyParam = (p: ApiSymbolParam): ApiSymbolParam => ({
    ...p,
    doc: linkify(p.doc),
    ...(p.fields ? { fields: p.fields.map(linkifyParam) } : {}),
  });
  const emitSymbol = (symbol: ApiSymbol) => {
    const linkified: ApiSymbol = {
      ...symbol,
      docMarkdown: linkify(symbol.docMarkdown),
      parameters: symbol.parameters.map(linkifyParam),
      returnValues: symbol.returnValues.map(linkifyParam),
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
        lines.push(functionOverviewCards(fnGroup.symbols), "");
        for (const symbol of fnGroup.symbols) emitSymbol(symbol);
      }
      continue;
    }
    lines.push(`## ${label}`, "");
    for (const symbol of group) emitSymbol(symbol);
  }
  return lines.join("\n");
}

// A prose linkifier over a single surface's pages. `buildSymbolIndex` keys every
// member to its page route — which already carries the loader's version prefix
// (`/api/<version>/<namespace>`) for a non-default surface — so cross-links are
// version-correct without any per-call prefixing. `linkifySymbolMentions` itself
// drops bare-namespace keys, leaving only qualified member mentions linked.
export function apiLinkify(pages: ApiPage[]): (text: string) => string {
  const registry = new Map(
    Object.entries(buildSymbolIndex(pages)).map(([k, v]) => [k, v.route] as const),
  );
  return (text: string) => linkifySymbolMentions(text, registry);
}

// SSG params for the per-version namespace pages: one entry per page of every
// materialized non-default version. Filtered through `versionsWithDiskFixtures`
// so an unmaterialized ref-doc target contributes nothing and the build stays
// clean until its fixtures land.
export function versionedApiParams(typesDir: string): { version: string; namespace: string }[] {
  return versionsWithDiskFixtures(typesDir)
    .filter((v) => !v.isDefault)
    .flatMap((v) =>
      loadApiSurfaceForVersion(typesDir, v.id).map((page) => ({
        version: v.id,
        namespace: page.namespace,
      })),
    );
}

// The `/api/:param` route branches on this: a known non-default version id
// renders that version's index; anything else is treated as a default-surface
// namespace. The default version is served at bare `/api`, so its id is not a
// version-index target.
export function isKnownVersionId(param: string, versions: ApiVersion[]): boolean {
  return versions.some((v) => !v.isDefault && v.id === param);
}
