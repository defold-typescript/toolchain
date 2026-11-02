import {
  type ApiPage,
  type ApiSymbol,
  type ApiSymbolParam,
  apiModuleSymbols,
  type FunctionRevisionGroup,
  functionOverviewCards,
  groupFunctionRevisions,
  groupFunctionSymbols,
  groupTypeSymbols,
  type LibraryMeta,
  outerCallParams,
  outerCallSlots,
  overloadFormCodes,
  overloadHeading,
  proseDocText,
  qualify,
  splitCallForm,
  typeShapeHeading,
} from "./api-surface";
import {
  API_NAME_CLOSE,
  API_NAME_OPEN,
  API_TYPE_CODE_CLOSE,
  API_TYPE_CODE_OPEN,
} from "./api-type-links";
import { forgeOf } from "./forge";
import type { LibraryListing } from "./nav";
import { LIBRARY_API_KIND_SENTENCE } from "./no-typed-api-icon";
import { escapeAttr, type SignatureSymbolTarget } from "./signature-brand-links";
import { functionTypeEmphasis } from "./signature-emphasis";
import { buildSymbolIndex, memberAnchors } from "./symbol-index";
import { symbolLinkifier } from "./symbol-linkify";
import { escapeUpstreamText } from "./upstream-text";

const KIND_SECTIONS: { kind: ApiSymbol["kind"]; label: string }[] = [
  { kind: "function", label: "Functions" },
  { kind: "variable", label: "Variables" },
  { kind: "constant", label: "Constants" },
  { kind: "property", label: "Properties" },
  { kind: "type", label: "Types" },
];

type SymbolDepth = 3 | 4;

// A wider-than-normal gap after the `:` between a name and its type. An en space
// (U+2002) survives HTML whitespace collapsing (repeated ASCII spaces do not), so
// the type reads as its own column across every parameter/return/field list.
const NAME_TYPE_GAP = "\u2002";

// The `` `name`?:<gap>`type` `` label shared by parameter, return, and field
// bullets, so name/type separation is uniform everywhere. An anonymous slot (an
// unnamed return value) is just its `` `type` `` with no colon; a typeless named
// slot is the name alone. With `emphasize` (top-level parameter and return
// bullets only) the name is bold, and so are the parameter names of a slot whose
// whole type is a function type, by the rule the signature heading uses.
//
// The type half is raw `<code class="api-type">` rather than a markdown code
// span, because `linkApiTypeTokens` needs a class to find it by — a markdown
// span renders as an unmarked `<code>` indistinguishable from every other
// inline code on the page. Emitting HTML means escaping here: the span's inner
// text is the only thing markdown-it will not escape for us, and a raw `<` in a
// type (`Opaque<"node">`) would otherwise split the element.
function nameTypeLabel(
  name: string,
  isOptional: boolean,
  types: readonly string[],
  emphasize = false,
): string {
  const optional = isOptional ? "?" : "";
  const joined = types.join(" | ");
  // Joined union members read as one function type (`(a) => void | undefined`),
  // so only a lone member is asked whether it is one.
  const ranges = emphasize && types.length === 1 ? functionTypeEmphasis(joined) : [];
  let typeText = "";
  let last = 0;
  for (const { start, end } of ranges) {
    typeText += `${escapeAttr(joined.slice(last, start))}${API_NAME_OPEN}${escapeAttr(joined.slice(start, end))}${API_NAME_CLOSE}`;
    last = end;
  }
  typeText += escapeAttr(joined.slice(last));
  const typeCode = joined ? `${API_TYPE_CODE_OPEN}${typeText}${API_TYPE_CODE_CLOSE}` : "";
  if (!name) return typeCode;
  const nameCode = emphasize ? `${API_NAME_OPEN}\`${name}\`${API_NAME_CLOSE}` : `\`${name}\``;
  if (!joined) return `${nameCode}${optional}`;
  return `${nameCode}${optional}:${NAME_TYPE_GAP}${typeCode}`;
}

// A multi-line slot doc (a list of constants) indents every continuation line to
// the bullet's content column, so markdown-it keeps it inside that bullet.
function underBullet(doc: string, indent: string): string {
  return doc.replace(/\n(?=[^\n])/g, `\n${indent}`);
}

// An object-literal member and its subtree, indented two spaces per depth so
// markdown-it nests it under the parameter bullet. Each member reads
// `` `name`?:<gap>`type` — doc ``, keeping the member type inline (backticked)
// so a nested literal token stays legible.
function fieldBullets(fields: ApiSymbolParam[], depth: number): string[] {
  const indent = "  ".repeat(depth + 1);
  const out: string[] = [];
  for (const f of fields) {
    let bullet = `${indent}- ${nameTypeLabel(f.name, f.isOptional, f.types)}`;
    if (f.doc) bullet += ` — ${underBullet(f.doc, `${indent}  `)}`;
    out.push(bullet);
    if (f.fields && f.fields.length > 0) out.push(...fieldBullets(f.fields, depth + 1));
  }
  return out;
}

function paramBullet(p: ApiSymbolParam): string {
  let bullet = `- ${nameTypeLabel(p.name, p.isOptional, p.types, true)}`;
  if (p.doc) bullet += ` — ${underBullet(p.doc, "  ")}`;
  if (p.fields && p.fields.length > 0) {
    return [bullet, ...fieldBullets(p.fields, 0)].join("\n");
  }
  return bullet;
}

// The `Parameters`/`Returns` label is set apart by color and case, not weight,
// so bold inside a symbol block marks names only.
function paramSection(label: string, params: ApiSymbolParam[]): string {
  return [`<p class="api-slot-label">${label}</p>`, "", ...params.map(paramBullet)].join("\n");
}

// A table moved onto a form it did not land on takes every slot's type and
// optionality, and a lone return's type, from that form's own signature: its
// source entry can describe several forms at once (`x: number | vector3`).
function tableForForm(
  table: Pick<ApiSymbol, "parameters" | "returnValues">,
  form: ApiSymbol,
): Pick<ApiSymbol, "parameters" | "returnValues"> {
  const slots = outerCallSlots(form.signature) ?? [];
  const returns = splitCallForm(form).returns?.replace(/^:\s*/, "");
  const [only] = table.returnValues;
  return {
    parameters: table.parameters.map((p, index) => {
      const slot = slots[index];
      return slot?.type ? { ...p, isOptional: slot.isOptional, types: [slot.type] } : p;
    }),
    returnValues:
      returns && only && table.returnValues.length === 1
        ? [{ ...only, types: [returns] }]
        : table.returnValues,
  };
}

// A `@deprecated` tag from the symbol's own source. Library symbols have no
// availability record, so this is the only lifecycle fact their pages state. A
// wrapped JSDoc tag carries newlines, so the text is folded to one line: a list
// item whose continuation began with `-` or `#` would otherwise break out.
function deprecationBadge(deprecated: string | undefined): string {
  if (deprecated === undefined) return "";
  const text = escapeUpstreamText(deprecated.replace(/\s+/g, " ").trim());
  return [
    '<div class="api-availability" aria-label="Availability">',
    "",
    `- <span class="api-availability-mark api-availability-mark--deprecated" aria-hidden="true">D</span> ${text === "" ? "Deprecated" : `Deprecated — ${text}`}`,
    "",
    "</div>",
  ].join("\n");
}

// The heading marker for an ambient global, reusing the `api-badge-dot` markup
// (and so the heading slugger's rule that strips it) rather than a second visual
// language. Independent of the availability categories above: a `library` page
// carries no availability record at all, and this marker rides every page.
function globalDot(symbol: ApiSymbol): string {
  if (!symbol.global) return "";
  return '<span class="api-badge-dot api-badge-dot--global" aria-label="Ambient global" title="Ambient global">G</span>';
}

// The heading marker for a symbol whose prose came from the library's upstream
// source rather than from the fork, on the same `api-badge-dot` terms as
// `globalDot`. The page's provenance block already names the repo and ref the text
// came from, so the marker points at a source the reader can already see.
function upstreamDot(symbol: ApiSymbol): string {
  if (!symbol.docSource) return "";
  return '<span class="api-badge-dot api-badge-dot--upstream" aria-label="Documentation imported from upstream" title="Documentation imported from upstream">U</span>';
}

// One symbol, single column: the signature heading is the title, and the
// description + example are wrapped in an indented `.api-symbol-body` so the body
// reads as subordinate to the title. The heading is `###` under a kind section
// and `####` under a group heading nested in one (a shape's members, a
// receiver's methods). The signature is not repeated as a code
// block — the heading already shows it. The blank lines around the inner markdown
// let markdown-it parse it inside the raw HTML wrapper.
function symbolBlock(symbol: ApiSymbol, badges = "", dots = "", depth: SymbolDepth = 3): string {
  const marks = "#".repeat(depth);
  const heading = dots
    ? `${marks} \`${symbol.signature}\` ${dots}`
    : `${marks} \`${symbol.signature}\``;
  const body: string[] = [];
  if (badges) body.push(badges);
  if (symbol.docMarkdown) body.push(symbol.docMarkdown);
  if (symbol.exampleMarkdown) body.push(symbol.exampleMarkdown);
  if (symbol.parameters.length > 0) body.push(paramSection("Parameters", symbol.parameters));
  if (symbol.returnValues.length > 0) body.push(paramSection("Returns", symbol.returnValues));
  if (body.length === 0) return heading;
  return [heading, "", '<div class="api-symbol-body">', "", body.join("\n\n"), "", "</div>"].join(
    "\n",
  );
}

// The `  1.` adopt step naming the dependency URL for a repo at its pin — shared by
// typed library pages and untyped listing pages so both give one instruction per
// pin kind. `ref` is the pinned tag or commit; a release pin leaves the choice to
// the reader, so it goes unused there.
export function dependencyStep(
  repoUrl: string,
  pinKind: LibraryMeta["pinKind"],
  ref: string,
): string {
  const repo = repoUrl ? repoUrl.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/$/, "") : "";
  const forge = forgeOf(repoUrl);
  const base = repoUrl.replace(/\/$/, "");
  const dependencies = "to `game.project` under `[project]` `dependencies`";
  // GitHub and Codeberg serve the same releases, tags and archive routes.
  const step1 = !forge
    ? `Pick a release from the library's GitHub repository and add its **Source code (zip)** URL (or a packaged \`.zip\` asset, if the library ships one) ${dependencies}`
    : pinKind === "tag"
      ? `This repo publishes no releases. Pick a tag from [${repo} tags](${base}/tags) and add its **Source code (zip)** URL — for the pinned tag, \`${base}/archive/refs/tags/${ref}.zip\` — ${dependencies}`
      : pinKind === "commit"
        ? `This repo publishes no releases or tags. Add a commit archive URL — for the pinned commit, \`${base}/archive/${ref}.zip\` — ${dependencies}`
        : `Pick a release from [${repo} releases](${base}/releases) and add its **Source code (zip)** URL (or a packaged \`.zip\` asset, if the library ships one) ${dependencies}`;
  return `  1. ${step1}, then **Fetch Libraries** in the Defold editor.`;
}

// A 40-hex commit pin reads as its short sha; a tag or release pin reads verbatim.
function pinLabel(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

// An untyped library's `/libraries/<owner>/<repo>` page body in the typed library
// page's order: the authored lead, the api-kind sentence, the linked GitHub pin
// with the setup steps nested under it, then the optional `Engine APIs` section.
// Only a `standard` adoption opens the steps with the shared dependency step; a
// `fork` listing's authored steps already start from the fork, and an
// `unavailable` one has nothing to install, so theirs number from 1. An Asset
// Portal listing closes the bullets with a link to its portal entry.
// Appended to a pin bullet: the Defold version current when the pin was cut.
function releaseEraSuffix(releaseEra: string | undefined): string {
  return releaseEra ? ` (released while Defold ${releaseEra} was current)` : "";
}

export function listingPageMarkdown(listing: LibraryListing): string {
  const repo = `${listing.owner}/${listing.repo}`;
  const standard = listing.adoption === "standard";
  const firstNumber = standard ? 2 : 1;
  const lines = [
    escapeUpstreamText(listing.ships),
    "",
    LIBRARY_API_KIND_SENTENCE[listing.api],
    "",
    `- GitHub: [${repo}](${listing.url}) — pinned to [\`${pinLabel(listing.ref)}\`](${listing.url}/tree/${listing.ref})${releaseEraSuffix(listing.releaseEra)}`,
    ...(standard ? [dependencyStep(listing.url, listing.pinKind, listing.ref)] : []),
    ...listing.steps.map((step, index) => `  ${index + firstNumber}. ${escapeUpstreamText(step)}`),
    ...(listing.portal ? [`- Asset Portal: [${listing.repo}](${listing.portal.url})`] : []),
  ];
  if (listing.engineApis) {
    lines.push("", "## Engine APIs", "", escapeUpstreamText(listing.engineApis));
  }
  return lines.join("\n");
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
function libraryMetaBlock(meta: LibraryMeta, hasGlobals: boolean): string[] {
  // Abbreviated, still-live pin — `2fe3aed` linking to the generating source.
  const pin = `[\`${meta.commit.slice(0, 7)}\`](${meta.sourceUrl})`;
  const repo = meta.authorUrl
    ? meta.authorUrl.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/$/, "")
    : "";
  // A single provenance bullet — the upstream repo, labelled by its forge (GitHub
  // or Codeberg), with the commit pin folded in
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
  // A Defold extension pinned to a tag or commit has no release to pick, so its
  // step 1 names the pin's own archive instead: a tag or commit archive is
  // immutable, so this still mints no moving archive URL, and the tag case
  // links the repo's tags so version choice stays the user's.
  // Step 3's import stays a fenced block at the ordered-item content column
  // (5 spaces) so it renders a copyable <pre>.
  const head = meta.authorUrl
    ? `- ${forgeOf(meta.authorUrl) ?? "Source"}: [${repo || meta.authorUrl}](${meta.authorUrl}) — pinned to ${pin}${releaseEraSuffix(meta.releaseEra)}`
    : `- Commit pin: ${pin}${releaseEraSuffix(meta.releaseEra)}`;
  // An extension adding members to an engine namespace has no module of its
  // own, so step 3 names the engine global instead of an import.
  const step3 =
    meta.usage === "ambient"
      ? [
          `  3. Call it through the global \`${meta.globalNamespace}\` — no import.${
            meta.extendsNamespace
              ? ` It adds members to the engine \`${meta.extendsNamespace}\` namespace.`
              : ""
          }`,
        ]
      : [
          "  3. Import it under a namespace alias of your choice:",
          "     ```ts",
          `     ${meta.importString}`,
          "     ```",
        ];
  return [
    head,
    dependencyStep(meta.authorUrl, meta.pinKind, meta.commit),
    "  2. Run `bunx @defold-typescript/cli resolve` to materialize its types.",
    ...step3,
    // A fork like `boom` or `deftest` publishes most of its surface outside the
    // `declare module` block, so the import above reaches only the symbols that
    // carry no marker; without this the page reads as if it reached them all.
    ...(hasGlobals
      ? [
          "     Symbols marked ambient globals are declared globally and need no import — call them directly.",
        ]
      : []),
    // Labelled by repo name, as an Asset Portal listing page labels its entry.
    ...(meta.portal ? [`- Asset Portal: [${repo.split("/").at(-1)}](${meta.portal.url})`] : []),
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
// still flow through `platformDocText` (`htmlToDocText` keeping platform icon
// markers) first, with each prose Lua fence swapped for its pinned translation.
export function apiPageMarkdown(
  page: Pick<
    ApiPage,
    | "namespace"
    | "module"
    | "translations"
    | "signatures"
    | "category"
    | "libraryMeta"
    | "displayName"
    | "route"
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
  const intro = escapeUpstreamText(
    proseDocText(m.description || m.brief, m.namespace, page.translations),
  );
  if (intro) lines.push(linkify(intro), "");
  if (page.libraryMeta) {
    lines.push(
      ...libraryMetaBlock(
        page.libraryMeta,
        symbols.some((s) => s.global),
      ),
      "",
    );
  }
  // Every doc string a symbol carries enters the page here, after the ref-doc
  // conversion, because that conversion decodes entities and anything escaped
  // ahead of it would come back as markup.
  const linkifyParam = (p: ApiSymbolParam): ApiSymbolParam => ({
    ...p,
    doc: linkify(escapeUpstreamText(p.doc)),
    ...(p.fields ? { fields: p.fields.map(linkifyParam) } : {}),
  });
  const linkifySymbol = (symbol: ApiSymbol): ApiSymbol => ({
    ...symbol,
    docMarkdown: linkify(escapeUpstreamText(symbol.docMarkdown)),
    ...(symbol.exampleMarkdown
      ? { exampleMarkdown: escapeUpstreamText(symbol.exampleMarkdown) }
      : {}),
    parameters: symbol.parameters.map(linkifyParam),
    returnValues: symbol.returnValues.map(linkifyParam),
  });
  const emitSymbol = (symbol: ApiSymbol, depth: SymbolDepth = 3) => {
    lines.push(
      symbolBlock(
        linkifySymbol(symbol),
        deprecationBadge(symbol.deprecated),
        globalDot(symbol) + upstreamDot(symbol),
        depth,
      ),
      "",
    );
  };
  // An overloaded function renders as one block: every form listed under the group
  // heading, each fact the forms share stated once for the block, and each fact
  // that differs kept under the form it belongs to.
  const emitOverloads = (group: FunctionRevisionGroup, depth: SymbolDepth) => {
    const forms = group.forms.map((form) => form.symbol);
    const [head] = forms;
    if (head === undefined) return;
    const linked = forms.map(linkifySymbol);
    const badges = forms.map((form) => deprecationBadge(form.deprecated));
    const shared = <T>(values: readonly T[]): boolean =>
      values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]));
    const sameBadges = shared(badges);
    const sameDoc = shared(linked.map((s) => s.docMarkdown));
    // `apiModuleSymbols` keeps an unpaired function's example on its primary row
    // alone, so an example only the first form carries belongs to the whole block.
    const sameExample =
      shared(forms.map((s) => s.exampleMarkdown ?? "")) ||
      forms.slice(1).every((s) => s.exampleMarkdown === undefined);
    const blockExample = sameExample ? linked[0]?.exampleMarkdown : undefined;
    // A table only one form carries moves to every form whose parameters it names,
    // and stays where it landed when it names none; once every form carries it,
    // it is shared and renders once for the block.
    const tabled = linked.filter((s) => s.parameters.length > 0 || s.returnValues.length > 0);
    const lone = tabled.length === 1 ? tabled[0] : undefined;
    const loneNames = lone?.parameters.map((p) => p.name).join(", ");
    const named = forms.map(
      (s) =>
        (lone?.parameters.length ?? 0) > 0 &&
        outerCallParams(s.signature)?.join(", ") === loneNames,
    );
    const tables: Pick<ApiSymbol, "parameters" | "returnValues">[] = linked.map((s, index) =>
      lone === undefined || !named.some(Boolean)
        ? s
        : named[index]
          ? tableForForm(lone, s)
          : { parameters: [], returnValues: [] },
    );
    const tableForm = tables[0];
    const sameParams = shared(tables.map((t) => t.parameters));
    const sameReturnTables = shared(tables.map((t) => t.returnValues));
    const codes = overloadFormCodes(forms);
    const sharedReturnTable = sameReturnTables && (tableForm?.returnValues.length ?? 0) > 0;

    const dots =
      globalDot(forms.find((s) => s.global) ?? head) +
      upstreamDot(forms.find((s) => s.docSource) ?? head);
    // The count badge stands where the heading reads `...`; the markdown renderer
    // splices it into the colored signature and keeps it out of the anchor.
    const heading = `${"#".repeat(depth)} \`${overloadHeading(forms)}\` <span class="api-overload-count">${forms.length} overloads</span>`;
    const items = linked.map((symbol, index) => {
      const code = codes[index] ?? symbol.signature;
      const parts = [`\`${code}\``];
      if (!sameBadges && badges[index]) parts.push(badges[index]);
      if (!sameDoc && symbol.docMarkdown) {
        // Forms can share prose without every form sharing it, so a repeat points
        // back to the first form that carries it instead of printing it again.
        const first = linked.findIndex((s) => s.docMarkdown === symbol.docMarkdown);
        parts.push(first < index ? `_Same description as form ${first + 1}._` : symbol.docMarkdown);
      }
      if (!sameExample && symbol.exampleMarkdown) parts.push(symbol.exampleMarkdown);
      const table = tables[index] ?? symbol;
      if (!sameParams && table.parameters.length > 0) {
        parts.push(paramSection("Parameters", table.parameters));
      }
      if (!sameReturnTables && table.returnValues.length > 0) {
        parts.push(paramSection("Returns", table.returnValues));
      }
      return ['<li class="api-overload">', "", parts.join("\n\n"), "", "</li>"].join("\n");
    });
    // The shared description comes ahead of the forms it describes. The shared
    // example closes the block, after every signature and table it illustrates.
    const body: string[] = [];
    if (sameBadges && badges[0]) body.push(badges[0]);
    if (sameDoc && linked[0]?.docMarkdown) body.push(linked[0].docMarkdown);
    body.push(['<ol class="api-overloads">', ...items, "</ol>"].join("\n"));
    if (sameParams && (tableForm?.parameters.length ?? 0) > 0) {
      body.push(paramSection("Parameters", tableForm?.parameters ?? []));
    }
    if (sharedReturnTable) body.push(paramSection("Returns", tableForm?.returnValues ?? []));
    if (blockExample) body.push(blockExample);
    lines.push(
      `${heading} ${dots}`.trimEnd(),
      "",
      '<div class="api-symbol-body">',
      "",
      body.join("\n\n"),
      "",
      "</div>",
      "",
    );
  };
  for (const { kind, label } of KIND_SECTIONS) {
    const group = symbols.filter((s) => s.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${label}`, "");
    // Colon-named handle methods (`file:read`, `client:send`) get their own
    // `<receiver> methods` heading nested in `Functions`, so they read apart
    // from the module table.
    if (kind === "function") {
      for (const fnGroup of groupFunctionSymbols(group)) {
        const methods = fnGroup.symbols.some((s) => s.name.includes(":"));
        const depth: SymbolDepth = methods ? 4 : 3;
        if (methods) lines.push(`### ${fnGroup.label}`, "");
        lines.push(functionOverviewCards(fnGroup.symbols, []), "");
        for (const revisions of groupFunctionRevisions(fnGroup.symbols, [])) {
          const [only] = revisions.forms;
          if (revisions.forms.length === 1 && only) emitSymbol(only.symbol, depth);
          else emitOverloads(revisions, depth);
        }
      }
      continue;
    }

    // Member-less types are rows directly under `Types`, each anchored by its
    // own signature heading. A shape with members follows under its own heading
    // nested in `Types`, so a signature token naming it has an anchor to
    // deep-link to.
    if (kind === "type") {
      const { types, shapes } = groupTypeSymbols(group);
      for (const symbol of types) emitSymbol(symbol);
      for (const shape of shapes) {
        lines.push(`### ${typeShapeHeading(page, shape.label)}`, "");
        for (const symbol of shape.symbols) emitSymbol(symbol, 4);
      }
      continue;
    }
    for (const symbol of group) emitSymbol(symbol);
  }
  return lines.join("\n");
}

// A prose linkifier over a single surface's pages. `buildSymbolIndex` keys every
// member to its page route — which already carries the loader's version prefix
// (`/api/<version>/<namespace>`) for a non-default surface — so cross-links are
// version-correct without any per-call prefixing. `symbolLinkifier` itself
// drops bare-namespace keys, leaving only qualified member mentions linked.
export function apiLinkify(pages: ApiPage[]): (text: string) => string {
  const registry = new Map(
    Object.entries(buildSymbolIndex(pages)).map(([k, v]) => [k, v.route] as const),
  );
  return symbolLinkifier(registry);
}

// The `name → route` map that `renderMarkdown`'s `signatureSymbolLinks` uses to
// deep-link type tokens inside rendered signatures. Two sources with different
// scopes. `Opaque` — the generic engine-handle brand — resolves through
// `buildSymbolIndex` over `pages`, and is empty when that surface carries no such
// page: global types are version-independent, so the versioned route resolves
// this against the canonical surface, not its own pages. A page's own type, by
// contrast, belongs to the page that renders it, so `page`'s own types are keyed
// by bare name to that page's own route — a surface-global bare-name table would
// mislink the nine shape names declared on more than one page. A type called
// `Opaque` never displaces the global entry. A member-less type links to its
// row's signature heading through `memberAnchors`, the same anchor its qualified
// spelling takes below. A shape with members links from its bare name to its own
// heading, which names the qualified path on an engine page, and that anchor is
// deferred to `renderMarkdown` as
// `{ route, heading }` rather than fixed here: the heading id is only known once
// the render has de-duplicated it against every earlier heading on the page.
export function apiSignatureSymbolLinks(
  pages: ApiPage[],
  page?: ApiPage,
  aliasPages: ApiPage[] = pages,
): Map<string, SignatureSymbolTarget> {
  const links = new Map<string, SignatureSymbolTarget>();
  if (page) {
    const { types, shapes } = groupTypeSymbols(
      apiModuleSymbols(page, page.translations).filter((s) => s.kind === "type"),
    );
    const anchors = memberAnchors(page);
    for (const row of types) {
      const anchor = anchors.get(`type:${row.name}`);
      if (anchor) links.set(row.name, `${page.route}#${anchor}`);
    }
    for (const shape of shapes) {
      links.set(shape.label, { route: page.route, heading: typeShapeHeading(page, shape.label) });
    }
  }
  // A constant-union alias is spelled qualified in every signature that takes it
  // (`gui.Easing`, `graphics.State`), which is also how the symbol index keys it.
  // Keying the qualified name off every alias page rather than the current page
  // is what lets a `render` signature reach the `graphics` entry that lists the
  // members. The route is the type row's own anchor, not the index entry: the
  // index leaves a key a type shares with a value member (`vmath.vector`) to the
  // value, and a signature names the type.
  //
  // The aliases come from `aliasPages` — the surface the reader is on — not from
  // `pages`, which the versioned route sets to the canonical collection for the
  // sake of `Opaque` below. Every route in a windowed collection already carries
  // its version prefix, so scoping the source keeps an alias link inside the
  // release the reader opened without any per-call prefixing. On the canonical
  // route the two collections are the same object.
  for (const p of aliasPages) {
    for (const [key, anchor] of memberAnchors(p)) {
      if (!key.startsWith("type:")) continue;
      const name = key.slice("type:".length);
      const qualified = `${p.namespace}.${name}`;
      if (qualify(p.namespace, name) === qualified) links.set(qualified, `${p.route}#${anchor}`);
    }
  }
  // The core types live in the toolchain docs. A page's own type of the same name
  // keeps its link.
  for (const p of pages) {
    if (p.category === "global-type" && !links.has(p.namespace)) links.set(p.namespace, p.route);
  }
  return links;
}
