import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiVariable,
  DEFOLD_TYPE_MAP,
  examplesHtmlToMarkdown,
  hashExampleSource,
  htmlToCodeText,
  htmlToDocText,
  lookupSignature,
  lookupTranslation,
  type SignatureStore,
  type TranslationStore,
} from "@defold-typescript/types";
import { slugify } from "./headings";

export type ApiPageCategory = "engine" | "lua-stdlib" | "global-type";

export interface ApiPage {
  namespace: string;
  route: string;
  brief: string;
  module: ApiModule;
  /** Hand-authored TypeScript `@example` translations, shared across the surface. */
  translations: TranslationStore;
  /** Hand-authored `lua-types`-derived signature overrides, keyed by FQN, shared across the surface. */
  signatures: SignatureStore;
  /**
   * `engine` for Defold-engine namespaces emitted from `api-targets.json` `modules`
   * and the synthetic globals page; `lua-stdlib` for pure-Lua / LuaJIT surfaces
   * (currently `base`, `bit`) sourced from `target.luaStdlib` and rendered under
   * the docs-site's separate "Lua standard library" reference category. Types
   * for `lua-stdlib` pages come from the `lua-types` dependency, not from
   * `@defold-typescript/types` generation. `global-type` for the hand-curated
   * core value types (`Vector3`, `Hash`, …) parsed from `core-types.ts` and
   * rendered under the "Global types" reference category — never emitted from
   * `ref-doc.zip`.
   */
  category: ApiPageCategory;
}

export interface ApiSymbolParam {
  name: string;
  doc: string;
  types: string[];
  isOptional: boolean;
}

export interface ApiSymbol {
  kind: "function" | "variable" | "constant" | "property";
  name: string;
  /** Inner signature text, e.g. `go.get_position(): vector3` — no backticks. */
  signature: string;
  /** Plain-text description markdown (left column). */
  docMarkdown: string;
  /** Converted Lua example markdown (right rail), absent when the symbol has none. */
  exampleMarkdown?: string;
  /** Structured parameters; always present, empty for non-functions. */
  parameters: ApiSymbolParam[];
  /** Structured return values; always present, empty for non-functions. */
  returnValues: ApiSymbolParam[];
}

export interface ApiSymbolGroup {
  label: string;
  symbols: ApiSymbol[];
}

/**
 * Partition a namespace's `function` symbols for `/api` rendering: module
 * functions (no colon in `name`) lead under a single `Functions` group,
 * followed by one group per `<receiver>:<method>` receiver in first-appearance
 * order. Handle methods like `file:read` or `client:send` thus render apart
 * from the module table rather than interleaved as if `io.file:read` were
 * callable. The `Functions` group is emitted only when non-empty; input order
 * is preserved within every group. Presentation-only — does not feed the
 * search index or `apiModuleSymbols`.
 */
export function groupFunctionSymbols(functions: ApiSymbol[]): ApiSymbolGroup[] {
  const moduleFns: ApiSymbol[] = [];
  const byReceiver = new Map<string, ApiSymbol[]>();

  for (const fn of functions) {
    const colon = fn.name.indexOf(":");
    if (colon === -1) {
      moduleFns.push(fn);
      continue;
    }
    const receiver = fn.name.slice(0, colon);
    const bucket = byReceiver.get(receiver);
    if (bucket) bucket.push(fn);
    else byReceiver.set(receiver, [fn]);
  }

  const groups: ApiSymbolGroup[] = [];
  if (moduleFns.length > 0) groups.push({ label: "Functions", symbols: moduleFns });
  for (const [receiver, symbols] of byReceiver) {
    groups.push({ label: `\`${receiver}\` methods`, symbols });
  }
  return groups;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// First sentence of a description for the overview cards: cut at the first `. `
// (keeping the period), collapse all whitespace runs to single spaces, and trim.
// Empty in -> empty out.
function summaryText(text: string): string {
  const boundary = text.indexOf(". ");
  const sentence = boundary === -1 ? text : text.slice(0, boundary + 1);
  return sentence.replace(/\s+/g, " ").trim();
}

/**
 * Compact per-group function index for the top of an `/api/<namespace>` page:
 * a card grid whose rows link each function's full `signature` (parameter and
 * return types included) down to its detailed `### \`signature\`` block (anchor =
 * `slugify(signature)`, matching the `slugify-headings` markdown-it rule) and
 * carry its first-sentence summary. Linking the whole signature — not the bare
 * name — keeps overloads (two `mul` arms) distinct and surfaces the types at a
 * glance. Presentation-only — no new heading, so the "On this page" TOC is
 * unchanged. Returns `""` for an empty list so the caller emits nothing.
 */
export function functionOverviewCards(symbols: ApiSymbol[]): string {
  if (symbols.length === 0) return "";
  const rows = symbols.flatMap((s) => {
    const summary = summaryText(s.docMarkdown);
    const tooltip = summary ? `${s.signature} — ${summary}` : s.signature;
    return [
      `    <a class="api-overview-card" role="listitem" href="#${escapeHtml(slugify(s.signature))}" title="${escapeHtml(tooltip)}">`,
      `      <code class="api-overview-title">${escapeHtml(s.signature)}</code>`,
      `      <span class="api-overview-description">${escapeHtml(summary)}</span>`,
      "    </a>",
    ];
  });
  return [
    '<div class="api-overview" aria-label="Function overview">',
    '  <div class="api-overview-grid" role="list">',
    ...rows,
    "  </div>",
    "</div>",
  ].join("\n");
}

function normalizeTypes(types: string[]): string[] {
  return types.map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * Render a single Defold ref-doc type token as the TypeScript type the `.d.ts`
 * emitter produces, reusing the authoritative `DEFOLD_TYPE_MAP` so `/api`
 * signatures can't drift from the generated typings. Unmapped tokens (doc-only
 * names with no engine type, e.g. `playback`) pass through verbatim — unlike
 * `emit-dts.ts` `defaultMapType`, which falls back to `unknown`.
 */
export function mapDocType(token: string): string {
  return Object.hasOwn(DEFOLD_TYPE_MAP, token) ? (DEFOLD_TYPE_MAP[token] as string) : token;
}

function typeList(types: string[]): string {
  const real = normalizeTypes(types).map(mapDocType);
  return real.length > 0 ? real.join(" | ") : "unknown";
}

function projectParams(list: ApiParameter[]): ApiSymbolParam[] {
  return list.map((p) => ({
    name: p.name,
    doc: htmlToDocText(p.doc),
    types: normalizeTypes(p.types).map(mapDocType),
    isOptional: p.isOptional,
  }));
}

function functionSignature(fn: ApiFunction): string {
  const params = fn.parameters
    .map((p) => `${p.name}${p.isOptional ? "?" : ""}: ${typeList(p.types)}`)
    .join(", ");
  const ret = fn.returnValues.map((r) => typeList(r.types)).join(", ");
  return `${fn.name}(${params})${ret ? `: ${ret}` : ""}`;
}

function variableSignature(v: ApiVariable): string {
  return `${v.name}: ${typeList(v.types)}`;
}

// `ApiConstant`/`ApiProperty` are not re-exported from the types package entry;
// these helpers only touch the structural fields they need.
function constantSignature(cst: { name: string }): string {
  return cst.name;
}

function propertySignature(prop: { name: string; types: string[] }): string {
  return `${prop.name}: ${typeList(prop.types)}`;
}

// Resolve a function's example to rendered markdown, matching the `.d.ts` emit
// (`emit-dts.ts` `functionDocLines`) exactly so `/api` and the typings agree: a
// hand-authored TypeScript translation pinned to this exact Lua source flips the
// fence to ```ts; any hash mismatch or absent translation keeps the clean Lua
// fallback. Returns `undefined` when the function carries no example at all.
export function exampleMarkdownFor(
  fn: ApiFunction,
  translations: TranslationStore = {},
): string | undefined {
  if (!fn.examples) return undefined;
  const lua = htmlToCodeText(fn.examples);
  const ts = lua === "" ? null : lookupTranslation(translations, fn.name, hashExampleSource(lua));
  if (ts !== null) return `\`\`\`ts\n${ts.replace(/\n+$/, "")}\n\`\`\``;
  const converted = examplesHtmlToMarkdown(fn.examples);
  return converted === "" ? undefined : converted;
}

export function apiModuleMarkdown(
  page: Pick<ApiPage, "namespace" | "module">,
  translations: TranslationStore = {},
): string {
  const m = page.module;
  const lines: string[] = [`# ${m.namespace}`, ""];
  const intro = htmlToDocText(m.description || m.brief);
  if (intro) lines.push(intro, "");

  if (m.functions.length > 0) {
    lines.push("## Functions", "");
    for (const fn of m.functions) {
      lines.push(`### \`${functionSignature(fn)}\``, "");
      const doc = htmlToDocText(fn.description || fn.brief);
      if (doc) lines.push(doc, "");
      const example = exampleMarkdownFor(fn, translations);
      if (example) lines.push(example, "");
      for (const p of [...fn.parameters, ...fn.returnValues]) {
        const pdoc = htmlToDocText(p.doc);
        if (!pdoc) continue;
        lines.push(p.name ? `${p.name} — ${pdoc}` : pdoc, "");
      }
    }
  }

  if (m.variables.length > 0) {
    lines.push("## Variables", "");
    for (const v of m.variables) {
      lines.push(`### \`${variableSignature(v)}\``, "");
      const doc = htmlToDocText(v.description || v.brief);
      if (doc) lines.push(doc, "");
    }
  }

  if (m.constants.length > 0) {
    lines.push("## Constants", "");
    for (const cst of m.constants) {
      lines.push(`### \`${constantSignature(cst)}\``, "");
      const doc = htmlToDocText(cst.description || cst.brief);
      if (doc) lines.push(doc, "");
    }
  }

  if (m.properties.length > 0) {
    lines.push("## Properties", "");
    for (const prop of m.properties) {
      lines.push(`### \`${propertySignature(prop)}\``, "");
      const doc = htmlToDocText(prop.description || prop.brief);
      if (doc) lines.push(doc, "");
    }
  }

  return lines.join("\n");
}

/**
 * Structured per-symbol projection of a module — the same source walk as
 * `apiModuleMarkdown`, but emitting `{ kind, name, signature, docMarkdown,
 * exampleMarkdown }` records the API route lays out as prose-left / code-right
 * rows. `apiModuleMarkdown` stays the flat search/index projection.
 */
export function apiModuleSymbols(
  page: Pick<ApiPage, "module">,
  translations: TranslationStore = {},
  signatures: SignatureStore = {},
): ApiSymbol[] {
  const m = page.module;
  const symbols: ApiSymbol[] = [];

  for (const fn of m.functions) {
    const ov = lookupSignature(signatures, fn.name);
    const symbol: ApiSymbol = {
      kind: "function",
      name: fn.name,
      signature: ov === null ? functionSignature(fn) : (ov.signatures[0] ?? functionSignature(fn)),
      docMarkdown: htmlToDocText(fn.description || fn.brief),
      parameters: projectParams(fn.parameters),
      returnValues: projectParams(fn.returnValues),
    };
    const example = exampleMarkdownFor(fn, translations);
    if (example) symbol.exampleMarkdown = example;
    symbols.push(symbol);
    // Each remaining authored overload renders as its own row, reusing the
    // distinct-row overload pattern: same description, but no per-parameter block
    // or example since the primary row already carries them.
    if (ov !== null) {
      for (const signature of ov.signatures.slice(1)) {
        symbols.push({
          kind: "function",
          name: fn.name,
          signature,
          docMarkdown: symbol.docMarkdown,
          parameters: [],
          returnValues: [],
        });
      }
    }
  }

  for (const v of m.variables) {
    symbols.push({
      kind: "variable",
      name: v.name,
      signature: variableSignature(v),
      docMarkdown: htmlToDocText(v.description || v.brief),
      parameters: [],
      returnValues: [],
    });
  }

  for (const cst of m.constants) {
    symbols.push({
      kind: "constant",
      name: cst.name,
      signature: constantSignature(cst),
      docMarkdown: htmlToDocText(cst.description || cst.brief),
      parameters: [],
      returnValues: [],
    });
  }

  for (const prop of m.properties) {
    symbols.push({
      kind: "property",
      name: prop.name,
      signature: propertySignature(prop),
      docMarkdown: htmlToDocText(prop.description || prop.brief),
      parameters: [],
      returnValues: [],
    });
  }

  return symbols;
}
