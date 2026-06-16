import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiFunction,
  type ApiModule,
  type ApiParameter,
  type ApiVariable,
  examplesHtmlToMarkdown,
  htmlToDocText,
  parseDefoldApiDoc,
} from "@defold-typescript/types";

export interface ApiPage {
  namespace: string;
  route: string;
  brief: string;
  module: ApiModule;
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

function typeList(types: string[]): string {
  return types.length > 0 ? types.join(" | ") : "any";
}

function projectParams(list: ApiParameter[]): ApiSymbolParam[] {
  return list.map((p) => ({
    name: p.name,
    doc: htmlToDocText(p.doc),
    types: p.types,
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

export function apiModuleMarkdown(page: Pick<ApiPage, "namespace" | "module">): string {
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
      if (fn.examples) {
        const converted = examplesHtmlToMarkdown(fn.examples);
        if (converted) lines.push(converted, "");
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
export function apiModuleSymbols(page: Pick<ApiPage, "module">): ApiSymbol[] {
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
    if (fn.examples) {
      const converted = examplesHtmlToMarkdown(fn.examples);
      if (converted) symbol.exampleMarkdown = converted;
    }
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
}

export function loadApiSurface(typesDir: string): ApiPage[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };

  const target = targets.find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }

  const pages = target.modules.map((mod): ApiPage => {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    return {
      namespace: mod.namespace,
      route: `/api/${mod.namespace}`,
      brief: module.brief,
      module,
    };
  });

  // Hand-vendored, presence-gated: the prefixless global symbols (`hash`, …)
  // have no api-targets module, so they never reach regen/generated output.
  const globalsPath = join(typesDir, target.fixturesDir, "globals_doc.json");
  if (existsSync(globalsPath)) {
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(globalsPath, "utf8")));
    pages.push({ namespace: "globals", route: "/api/globals", brief: module.brief, module });
  }

  return pages.sort((a, b) => {
    if (a.namespace === b.namespace) return 0;
    if (a.namespace === "globals") return -1;
    if (b.namespace === "globals") return 1;
    return a.namespace.localeCompare(b.namespace);
  });
}
