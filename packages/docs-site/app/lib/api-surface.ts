import {
  type ApiAvailability,
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
  normalizedFunctionSignature,
  type SignatureStore,
  symbolIdentityKey,
  type TranslationStore,
} from "@defold-typescript/types";
import { slugify } from "./headings";

/**
 * Per-surface availability index, keyed by {@link symbolIdentityKey} so a symbol
 * joins its `api-availability.json` record at exact namespace/kind/name/overload-
 * signature granularity — adding or removing one overload never relabels its
 * siblings. Shared by every page of a version's surface; a symbol only carries a
 * badge when its identity is present, so the same lookup is safe on the canonical
 * and historical surfaces at once.
 */
export type AvailabilityLookup = ReadonlyMap<string, ApiAvailability>;

type IdentityKind = "FUNCTION" | "CONSTANT" | "VARIABLE" | "PROPERTY" | "TYPEDEF";

function joinAvailability(
  availability: AvailabilityLookup | undefined,
  namespace: string,
  kind: IdentityKind,
  name: string,
  signature: string,
): ApiAvailability | undefined {
  if (!availability) return undefined;
  return availability.get(symbolIdentityKey({ namespace, kind, name, signature }));
}

/**
 * The lifecycle labels rendered as compact text badges and threaded into the
 * search projection. Text, never color alone, so the facts stay accessible. The
 * replacement link is rendered separately (it needs version-correct resolution);
 * {@link availabilityProse} appends its plain name for the search text.
 */
export function availabilityLabels(av: ApiAvailability): string[] {
  const labels: string[] = [];
  if (av.since) labels.push(`Since ${av.since}`);
  if (av.deprecatedSince) labels.push(`Deprecated since ${av.deprecatedSince}`);
  if (av.removedIn) labels.push(`Removed in ${av.removedIn}`);
  if (av.box2d && av.box2d.length > 0) labels.push(`Box2D: ${av.box2d.join(", ")}`);
  return labels;
}

// Flat prose form for the search index: the badge labels plus the replacement's
// plain name, so a reader searching "removed" or a replacement symbol finds the
// historical page. Empty when the record carries no renderable fact.
function availabilityProse(av: ApiAvailability): string {
  const labels = availabilityLabels(av);
  if (av.replacement) labels.push(`Replaced by ${av.replacement.name}`);
  return labels.length > 0 ? `${labels.join(". ")}.` : "";
}

function pushAvailabilityProse(lines: string[], av: ApiAvailability | undefined): void {
  if (!av) return;
  const prose = availabilityProse(av);
  if (prose) lines.push(prose, "");
}

export type ApiPageCategory = "engine" | "lua-stdlib" | "global-type" | "library";

type ApiTypedef = ApiModule["typedefs"][number];

/**
 * Structured provenance for a vendored `library` page, joined from
 * `library-classification.json` (repo, pinned commit, license, the module's
 * upstream `dir`) and `NOTICE` (author credit). Rendered as the uniform
 * Author / GitHub / Commit pin / Import / License block; leads with the real
 * origin (the upstream author and their repo) rather than the ts-defold
 * vendoring plumbing.
 */
export interface LibraryMeta {
  /** NOTICE author credit for the upstream dir; `""` when the dir has no credit. */
  author: string;
  /** Link to the author's upstream repo (the NOTICE credit URL); `""` when the dir has no credit. */
  authorUrl: string;
  /** The pinned commit sha — abbreviated for display, full inside the link. */
  commit: string;
  /**
   * Link to the exact `.d.ts` the types were generated from, at the pinned
   * commit (`<repo>/blob/<commit>/<path>`); falls back to the repo tree at the
   * commit (`<repo>/tree/<commit>`) when the upstream file path is unknown.
   */
  sourceUrl: string;
  /** The vendored `import * as <alias> from '<module>'` string. */
  importString: string;
  /** SPDX-style license id from the classification `source`. */
  license: string;
}

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
   * `ref-doc.zip`. `library` for vendored third-party library modules
   * (`monarch.monarch`, `in.button`, …) sourced from `@defold-typescript/library-types`
   * fixtures, pinned to a ts-defold/library commit rather than a Defold version,
   * and surfaced default-only under the "Libraries" reference category.
   */
  category: ApiPageCategory;
  /**
   * Version-correct symbol availability for this surface, joined from
   * `api-availability.json`. Absent when the artifact is missing (the surface
   * renders exactly as before). The same lookup rides on every page of a version.
   */
  availability?: AvailabilityLookup;
  /** Structured provenance for a `library` page; absent for every other category. */
  libraryMeta?: LibraryMeta;
  /**
   * Presentation-only author-first title for a `library` page
   * (`paweljarosz / squid`); absent for every other category. The `namespace`
   * stays the canonical `require()` path — `displayName` never touches the
   * route, the import example, or the provenance block.
   */
  displayName?: string;
}

export interface ApiSymbolParam {
  name: string;
  doc: string;
  types: string[];
  isOptional: boolean;
  /** Object-literal member docs, projected recursively; absent for plain types. */
  fields?: ApiSymbolParam[];
}

export interface ApiSymbol {
  kind: "function" | "variable" | "constant" | "property" | "type";
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
  /**
   * Version-correct lifecycle/backend metadata joined by exact overload identity;
   * absent when the symbol has no availability record. The render layer turns it
   * into text badges and a resolved replacement link.
   */
  availability?: ApiAvailability;
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

/**
 * Compact per-group function index for the top of an `/api/<namespace>` page:
 * a bulleted list whose links use each function's full `signature` (parameter
 * and return types included) and point down to the detailed `### \`signature\``
 * block (anchor = `slugify(signature)`, matching the `slugify-headings`
 * markdown-it rule). Linking the whole signature — not the bare name — keeps
 * overloads (two `mul` arms) distinct and surfaces the types at a glance.
 * Presentation-only — no new heading, so the "On this page" TOC is unchanged.
 * Returns `""` for an empty list so the caller emits nothing.
 */
export function functionOverviewCards(symbols: ApiSymbol[]): string {
  if (symbols.length === 0) return "";
  const rows = symbols.map((s) => `- [\`${s.signature}\`](#${slugify(s.signature)})`);
  return [
    '<div class="api-overview" aria-label="Function overview">',
    "",
    ...rows,
    "",
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

type MapType = (token: string) => string;

function typeList(types: string[], mapType: MapType = mapDocType): string {
  const real = normalizeTypes(types).map(mapType);
  return real.length > 0 ? real.join(" | ") : "unknown";
}

function projectParams(list: ApiParameter[], mapType: MapType = mapDocType): ApiSymbolParam[] {
  return list.map((p) => ({
    name: p.name,
    doc: htmlToDocText(p.doc),
    types: normalizeTypes(p.types).map(mapType),
    isOptional: p.isOptional,
    ...(p.fields ? { fields: projectParams(p.fields, mapType) } : {}),
  }));
}

function functionSignature(fn: ApiFunction, mapType: MapType = mapDocType): string {
  const params = fn.parameters
    .map((p) => `${p.name}${p.isOptional ? "?" : ""}: ${typeList(p.types, mapType)}`)
    .join(", ");
  const ret = fn.returnValues.map((r) => typeList(r.types, mapType)).join(", ");
  return `${fn.name}(${params})${ret ? `: ${ret}` : ""}`;
}

function variableSignature(v: ApiVariable, mapType: MapType = mapDocType): string {
  return `${v.name}: ${typeList(v.types, mapType)}`;
}

function memberBearingTypedefs(typedefs: ApiTypedef[]): ApiTypedef[] {
  return typedefs.filter(
    (td) => (td.functions?.length ?? 0) > 0 || (td.properties?.length ?? 0) > 0,
  );
}

function typeMemberName(typeName: string, memberName: string): string {
  return `${typeName}.${memberName}`;
}

function typeMemberFunctionSignature(
  typeName: string,
  fn: ApiFunction,
  mapType: MapType = mapDocType,
): string {
  return `${typeName}.${functionSignature(fn, mapType)}`;
}

function typeMemberPropertySignature(
  typeName: string,
  prop: ApiVariable,
  mapType: MapType = mapDocType,
): string {
  return `${typeName}.${variableSignature(prop, mapType)}`;
}

// `ApiConstant`/`ApiProperty` are not re-exported from the types package entry;
// these helpers only touch the structural fields they need.
function constantSignature(cst: { name: string }): string {
  return cst.name;
}

function propertySignature(
  prop: { name: string; types: string[] },
  mapType: MapType = mapDocType,
): string {
  return `${prop.name}: ${typeList(prop.types, mapType)}`;
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
  page: Pick<ApiPage, "namespace" | "module" | "displayName" | "category" | "availability">,
  translations: TranslationStore = {},
): string {
  const m = page.module;
  // `library` JSON tokens are already TypeScript, so re-mapping them through the
  // ref-doc `DEFOLD_TYPE_MAP` would drift `/api` from the shipped `generated/*.d.ts`.
  const mapType: MapType = page.category === "library" ? (t) => t : mapDocType;
  const lines: string[] = [`# ${page.displayName ?? m.namespace}`, ""];
  if (page.displayName && page.displayName !== m.namespace) {
    lines.push(`\`${m.namespace}\``, "");
  }
  const intro = htmlToDocText(m.description || m.brief);
  if (intro) lines.push(intro, "");

  if (m.functions.length > 0) {
    lines.push("## Functions", "");
    for (const fn of m.functions) {
      lines.push(`### \`${functionSignature(fn, mapType)}\``, "");
      const doc = htmlToDocText(fn.description || fn.brief);
      if (doc) lines.push(doc, "");
      pushAvailabilityProse(
        lines,
        joinAvailability(
          page.availability,
          m.namespace,
          "FUNCTION",
          fn.name,
          normalizedFunctionSignature(fn),
        ),
      );
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
      lines.push(`### \`${variableSignature(v, mapType)}\``, "");
      const doc = htmlToDocText(v.description || v.brief);
      if (doc) lines.push(doc, "");
      pushAvailabilityProse(
        lines,
        joinAvailability(page.availability, m.namespace, "VARIABLE", v.name, ""),
      );
    }
  }

  if (m.constants.length > 0) {
    lines.push("## Constants", "");
    for (const cst of m.constants) {
      lines.push(`### \`${constantSignature(cst)}\``, "");
      const doc = htmlToDocText(cst.description || cst.brief);
      if (doc) lines.push(doc, "");
      pushAvailabilityProse(
        lines,
        joinAvailability(page.availability, m.namespace, "CONSTANT", cst.name, ""),
      );
    }
  }

  if (m.properties.length > 0) {
    lines.push("## Properties", "");
    for (const prop of m.properties) {
      lines.push(`### \`${propertySignature(prop, mapType)}\``, "");
      const doc = htmlToDocText(prop.description || prop.brief);
      if (doc) lines.push(doc, "");
      pushAvailabilityProse(
        lines,
        joinAvailability(page.availability, m.namespace, "PROPERTY", prop.name, ""),
      );
    }
  }

  const typedefs = memberBearingTypedefs(m.typedefs);
  if (typedefs.length > 0) {
    lines.push("## Types", "");
    for (const td of typedefs) {
      lines.push(`### ${td.name}`, "");
      for (const fn of td.functions ?? []) {
        lines.push(`#### \`${functionSignature(fn, mapType)}\``, "");
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
      for (const prop of td.properties ?? []) {
        lines.push(`#### \`${variableSignature(prop, mapType)}\``, "");
        const doc = htmlToDocText(prop.description || prop.brief);
        if (doc) lines.push(doc, "");
      }
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
  page: Pick<ApiPage, "module" | "category" | "availability">,
  translations: TranslationStore = {},
  signatures: SignatureStore = {},
): ApiSymbol[] {
  const m = page.module;
  // `library` JSON tokens are already TypeScript, so re-mapping them through the
  // ref-doc `DEFOLD_TYPE_MAP` would drift `/api` from the shipped `generated/*.d.ts`.
  const mapType: MapType = page.category === "library" ? (t) => t : mapDocType;
  const symbols: ApiSymbol[] = [];
  const overrideEmitted = new Set<string>();

  for (const fn of m.functions) {
    const ov = lookupSignature(signatures, fn.name);
    // override-covered FQN: render the store signatures once, not per fixture entry
    // (`vmath.lerp` has 3 ref-doc entries but one authored override set).
    if (ov !== null && overrideEmitted.has(fn.name)) continue;
    // per-overload description: each override row keeps its own `docs[i]` prose,
    // falling back to the shared ref-doc fixture description when absent/`null`.
    const fixtureDoc = htmlToDocText(fn.description || fn.brief);
    const overloadDoc = (i: number): string => {
      const authored = ov?.docs?.[i];
      return authored != null ? htmlToDocText(authored) : fixtureDoc;
    };
    const symbol: ApiSymbol = {
      kind: "function",
      name: fn.name,
      signature:
        ov === null
          ? functionSignature(fn, mapType)
          : (ov.signatures[0] ?? functionSignature(fn, mapType)),
      docMarkdown: ov === null ? fixtureDoc : overloadDoc(0),
      parameters: projectParams(fn.parameters, mapType),
      returnValues: projectParams(fn.returnValues, mapType),
    };
    const example = exampleMarkdownFor(fn, translations);
    if (example) symbol.exampleMarkdown = example;
    // The join keys off the raw ref-doc overload signature — the exact value
    // `api-availability.json` was derived with — so a badge lands on the one
    // overload it identifies. Authored-override extra rows below share the raw
    // symbol and carry no badge of their own.
    const av = joinAvailability(
      page.availability,
      m.namespace,
      "FUNCTION",
      fn.name,
      normalizedFunctionSignature(fn),
    );
    if (av) symbol.availability = av;
    symbols.push(symbol);
    // Each remaining authored overload renders as its own row, reusing the
    // distinct-row overload pattern: its own `docs[k+1]` prose (else the fixture
    // description), but no per-parameter block or example since the primary row
    // already carries them.
    if (ov !== null) {
      overrideEmitted.add(fn.name);
      for (const [k, signature] of ov.signatures.slice(1).entries()) {
        symbols.push({
          kind: "function",
          name: fn.name,
          signature,
          docMarkdown: overloadDoc(k + 1),
          parameters: [],
          returnValues: [],
        });
      }
    }
  }

  for (const v of m.variables) {
    const symbol: ApiSymbol = {
      kind: "variable",
      name: v.name,
      signature: variableSignature(v, mapType),
      docMarkdown: htmlToDocText(v.description || v.brief),
      parameters: [],
      returnValues: [],
    };
    const av = joinAvailability(page.availability, m.namespace, "VARIABLE", v.name, "");
    if (av) symbol.availability = av;
    symbols.push(symbol);
  }

  for (const cst of m.constants) {
    const symbol: ApiSymbol = {
      kind: "constant",
      name: cst.name,
      signature: constantSignature(cst),
      docMarkdown: htmlToDocText(cst.description || cst.brief),
      parameters: [],
      returnValues: [],
    };
    const av = joinAvailability(page.availability, m.namespace, "CONSTANT", cst.name, "");
    if (av) symbol.availability = av;
    symbols.push(symbol);
  }

  for (const prop of m.properties) {
    const symbol: ApiSymbol = {
      kind: "property",
      name: prop.name,
      signature: propertySignature(prop, mapType),
      docMarkdown: htmlToDocText(prop.description || prop.brief),
      parameters: [],
      returnValues: [],
    };
    const av = joinAvailability(page.availability, m.namespace, "PROPERTY", prop.name, "");
    if (av) symbol.availability = av;
    symbols.push(symbol);
  }

  for (const td of memberBearingTypedefs(m.typedefs)) {
    for (const fn of td.functions ?? []) {
      const symbol: ApiSymbol = {
        kind: "type",
        name: typeMemberName(td.name, fn.name),
        signature: typeMemberFunctionSignature(td.name, fn, mapType),
        docMarkdown: htmlToDocText(fn.description || fn.brief),
        parameters: projectParams(fn.parameters, mapType),
        returnValues: projectParams(fn.returnValues, mapType),
      };
      const example = exampleMarkdownFor(fn, translations);
      if (example) symbol.exampleMarkdown = example;
      symbols.push(symbol);
    }
    for (const prop of td.properties ?? []) {
      symbols.push({
        kind: "type",
        name: typeMemberName(td.name, prop.name),
        signature: typeMemberPropertySignature(td.name, prop, mapType),
        docMarkdown: htmlToDocText(prop.description || prop.brief),
        parameters: [],
        returnValues: [],
      });
    }
  }

  return symbols;
}
