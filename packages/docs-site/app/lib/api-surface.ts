import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiVariable,
  examplesHtmlToMarkdown,
  hashExampleSource,
  htmlToCodeText,
  htmlToDocText,
  lookupTranslation,
  parseDefoldApiDoc,
  type TranslationStore,
} from "@defold-typescript/types";
import { slugify } from "./headings";

export type ApiPageCategory = "engine" | "lua-stdlib";

export interface ApiPage {
  namespace: string;
  route: string;
  brief: string;
  module: ApiModule;
  /** Hand-authored TypeScript `@example` translations, shared across the surface. */
  translations: TranslationStore;
  /**
   * `engine` for Defold-engine namespaces emitted from `api-targets.json` `modules`
   * and the synthetic globals page; `lua-stdlib` for pure-Lua / LuaJIT surfaces
   * (currently `base`, `bit`) sourced from `target.luaStdlib` and rendered under
   * the docs-site's separate "Lua standard library" reference category. Types
   * for `lua-stdlib` pages come from the `lua-types` dependency, not from
   * `@defold-typescript/types` generation.
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

// First sentence of a description, table-cell-safe: cut at the first `. `
// (keeping the period), collapse all whitespace runs to single spaces, trim,
// and escape `|` so it can't break the markdown table. Empty in -> empty out.
function summaryCell(text: string): string {
  const boundary = text.indexOf(". ");
  const sentence = boundary === -1 ? text : text.slice(0, boundary + 1);
  return sentence.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

/**
 * Compact per-group function index for the top of an `/api/<namespace>` page:
 * a GitHub markdown table whose rows link each function `name` down to its
 * detailed `### \`signature\`` block (anchor = `slugify(signature)`, matching
 * the `slugify-headings` markdown-it rule) and carry its first-sentence
 * summary. Presentation-only — no new heading, so the "On this page" TOC is
 * unchanged. Returns `""` for an empty list so the caller emits nothing.
 */
export function functionSummaryTable(symbols: ApiSymbol[]): string {
  if (symbols.length === 0) return "";
  const rows = symbols.map(
    (s) => `| [\`${s.name}\`](#${slugify(s.signature)}) | ${summaryCell(s.docMarkdown)} |`,
  );
  return ["| Function | Summary |", "| --- | --- |", ...rows].join("\n");
}

function normalizeTypes(types: string[]): string[] {
  return types.map((t) => t.trim()).filter((t) => t.length > 0);
}

function typeList(types: string[]): string {
  const real = normalizeTypes(types);
  return real.length > 0 ? real.join(" | ") : "unknown";
}

function projectParams(list: ApiParameter[]): ApiSymbolParam[] {
  return list.map((p) => ({
    name: p.name,
    doc: htmlToDocText(p.doc),
    types: normalizeTypes(p.types),
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
): ApiSymbol[] {
  const m = page.module;
  const symbols: ApiSymbol[] = [];

  for (const fn of m.functions) {
    const symbol: ApiSymbol = {
      kind: "function",
      name: fn.name,
      signature: functionSignature(fn),
      docMarkdown: htmlToDocText(fn.description || fn.brief),
      parameters: projectParams(fn.parameters),
      returnValues: projectParams(fn.returnValues),
    };
    const example = exampleMarkdownFor(fn, translations);
    if (example) symbol.exampleMarkdown = example;
    symbols.push(symbol);
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

interface ApiTarget {
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string }[];
  luaStdlib?: { namespace: string; fixture: string }[];
}

// The same `examples/translations.json` the `.d.ts` emit consumes; a missing
// file degrades gracefully to an empty store (every example renders its Lua
// fallback). The shipped `src/example-store.ts` stays node-free, so the file
// read lives here in the docs-site rather than in the types entry graph.
function loadTranslationStore(typesDir: string): TranslationStore {
  const path = join(typesDir, "examples", "translations.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as TranslationStore;
}

export function loadApiSurface(typesDir: string): ApiPage[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };

  const target = targets.find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }

  const translations = loadTranslationStore(typesDir);

  const pages = target.modules.map((mod): ApiPage => {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    return {
      namespace: mod.namespace,
      route: `/api/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      category: "engine",
    };
  });

  // Hand-vendored, presence-gated: the prefixless global symbols (`hash`, …)
  // have no api-targets module, so they never reach regen/generated output.
  const globalsPath = join(typesDir, target.fixturesDir, "globals_doc.json");
  if (existsSync(globalsPath)) {
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(globalsPath, "utf8")));
    pages.push({
      namespace: "globals",
      route: "/api/globals",
      brief: module.brief,
      module,
      translations,
      category: "engine",
    });
  }

  // Docs-only Lua standard library pages (`base`, `bit`, …): types are owned
  // by the `lua-types` dependency the `lua-stdlib-globals` goal adopted, so
  // these fixtures never feed regen / `MODULE_MANIFEST`; docs-site reads them
  // directly to render the "Lua standard library" reference category. The
  // per-namespace page also leads with a provenance note so a reader landing
  // on `/api/base` sees *why* this surface is not generated like the rest.
  for (const mod of target.luaStdlib ?? []) {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    const provenanceNote =
      "Types for this namespace are provided by the `lua-types` dependency " +
      "and are not generated by `@defold-typescript/types`.";
    module.description = provenanceNote + (module.description ? `\n\n${module.description}` : "");
    pages.push({
      namespace: mod.namespace,
      route: `/api/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      category: "lua-stdlib",
    });
  }

  return pages.sort((a, b) => {
    if (a.category !== b.category) return a.category === "engine" ? -1 : 1;
    if (a.namespace === b.namespace) return 0;
    if (a.category === "engine") {
      if (a.namespace === "globals") return -1;
      if (b.namespace === "globals") return 1;
    }
    return a.namespace.localeCompare(b.namespace);
  });
}
