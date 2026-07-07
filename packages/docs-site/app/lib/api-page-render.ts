import { htmlToDocText } from "@defold-typescript/types";
import {
  type ApiPage,
  type ApiSymbol,
  type ApiSymbolParam,
  apiModuleSymbols,
  functionOverviewCards,
  groupFunctionSymbols,
  type LibraryMeta,
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
  { kind: "type", label: "Types" },
];

// A wider-than-normal gap after the `:` between a name and its type. An en space
// (U+2002) survives HTML whitespace collapsing (repeated ASCII spaces do not), so
// the type reads as its own column across every parameter/return/field list.
const NAME_TYPE_GAP = "\u2002";

// The `` `name`?:<gap>`type` `` label shared by parameter, return, and field
// bullets, so name/type separation is uniform everywhere. An anonymous slot (an
// unnamed return value) is just its `` `type` `` with no colon; a typeless named
// slot is the name alone.
function nameTypeLabel(name: string, isOptional: boolean, types: string): string {
  const optional = isOptional ? "?" : "";
  if (!name) return types ? `\`${types}\`` : "";
  if (!types) return `\`${name}\`${optional}`;
  return `\`${name}\`${optional}:${NAME_TYPE_GAP}\`${types}\``;
}

// An object-literal member and its subtree, indented two spaces per depth so
// markdown-it nests it under the parameter bullet. Each member reads
// `` `name`?:<gap>`type` — doc ``, keeping the member type inline (backticked)
// so a nested literal token stays legible.
function fieldBullets(fields: ApiSymbolParam[], depth: number): string[] {
  const indent = "  ".repeat(depth + 1);
  const out: string[] = [];
  for (const f of fields) {
    let bullet = `${indent}- ${nameTypeLabel(f.name, f.isOptional, f.types.join(" | "))}`;
    if (f.doc) bullet += ` — ${f.doc}`;
    out.push(bullet);
    if (f.fields && f.fields.length > 0) out.push(...fieldBullets(f.fields, depth + 1));
  }
  return out;
}

function paramBullet(p: ApiSymbolParam): string {
  let bullet = `- ${nameTypeLabel(p.name, p.isOptional, p.types.join(" | "))}`;
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

// The uniform provenance block for a `library` page: the bullets lead with the
// real origin (author + upstream GitHub repo), followed by the ts-defold
// commit pin, the import string, and the license. Author and GitHub are
// omitted when the dir carries no NOTICE credit (both `meta.author` and
// `meta.authorUrl` are `""`). The commit-pin text is the abbreviated `meta.commit`
// sha, linking to `meta.sourceUrl` (the exact `.d.ts` at the pin). The import
// statement is emitted as a `ts` code block nested under an `Import` bullet (not
// an inline span) so it renders as a `<pre>` and picks up the copy-to-clipboard
// button; the fence also keeps the prose linkifier off the dotted module name.
function libraryMetaBlock(meta: LibraryMeta): string[] {
  // Abbreviated, still-live pin — `2fe3aed` linking to the generating source.
  const pin = `[\`${meta.commit.slice(0, 7)}\`](${meta.sourceUrl})`;
  const repo = meta.authorUrl
    ? meta.authorUrl.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/$/, "")
    : "";
  // A single provenance bullet — the GitHub repo with the commit pin folded in
  // as `— pinned to <short-sha>` (or the standalone `Commit pin` when the dir
  // carries no NOTICE credit). Author and License are deliberately omitted: the
  // reader gets them from the linked repo. The adopt steps nest as a numbered
  // list directly under this bullet (no `Usage:` label).
  //
  // We deliberately do *not* mint a moving archive URL (`master`/`main`/
  // `HEAD.zip`): version choice is the user's, and a specific release is a
  // vetted, reproducible pin rather than whatever the default branch holds at
  // fetch time. So step 1 links the repo's `/releases` page (browsed, hence a
  // link) so the reader copies a release's Source-code ZIP or a packaged `.zip`
  // asset — Defold and `resolve` extract zip, never the tar.gz GitHub also
  // offers. With no NOTICE credit there is no repo to link, so it is named only.
  // Step 3's import stays a fenced block at the ordered-item content column
  // (5 spaces) so it renders a copyable <pre>.
  const head = meta.authorUrl
    ? `- GitHub: [${repo || meta.authorUrl}](${meta.authorUrl}) — pinned to ${pin}`
    : `- Commit pin: ${pin}`;
  const isGithub = /^https?:\/\/github\.com\//i.test(meta.authorUrl);
  const releasesUrl = isGithub ? `${meta.authorUrl.replace(/\/$/, "")}/releases` : "";
  const step1 = releasesUrl
    ? `Pick a release from [${repo} releases](${releasesUrl}) and add its **Source code (zip)** URL (or a packaged \`.zip\` asset, if the library ships one) to \`game.project\` under \`[project]\` \`dependencies\``
    : "Pick a release from the library's GitHub repository and add its **Source code (zip)** URL (or a packaged `.zip` asset, if the library ships one) to `game.project` under `[project]` `dependencies`";
  return [
    head,
    `  1. ${step1}, then **Fetch Libraries** in the Defold editor.`,
    "  2. Run `bunx @defold-typescript/cli resolve` to materialize its types.",
    "  3. Import it under a namespace alias of your choice:",
    "     ```ts",
    `     ${meta.importString}`,
    "     ```",
  ];
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
  page: Pick<
    ApiPage,
    "module" | "translations" | "signatures" | "category" | "libraryMeta" | "displayName"
  >,
  linkify: (text: string) => string,
  // Library pages render their heading as the styled `creator/dir/namespace`
  // path component in the route, so the markdown starts at the intro.
  { omitHeading = false }: { omitHeading?: boolean } = {},
): string {
  const m = page.module;
  const symbols = apiModuleSymbols(page, page.translations, page.signatures);
  const lines: string[] = [];
  if (!omitHeading) {
    lines.push(`# ${page.displayName ?? m.namespace}`, "");
    if (page.displayName && page.displayName !== m.namespace) {
      lines.push(`\`${m.namespace}\``, "");
    }
  }
  const raw = m.description || m.brief;
  const intro = page.category === "global-type" ? raw : htmlToDocText(raw);
  if (intro) lines.push(linkify(intro), "");
  if (page.category === "library" && page.libraryMeta) {
    lines.push(...libraryMetaBlock(page.libraryMeta), "");
  }
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
