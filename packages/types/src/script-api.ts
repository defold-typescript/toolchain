import { parse } from "yaml";

export interface RefDocParameter {
  name: string;
  doc: string;
  types: string[];
}

export interface RefDocFunctionElement {
  type: "FUNCTION";
  name: string;
  description: string;
  parameters: RefDocParameter[];
  returnvalues: RefDocParameter[];
  examples?: string;
}

export interface RefDocConstantElement {
  type: "CONSTANT";
  name: string;
  brief: string;
  description: string;
}

export type RefDocElement = RefDocFunctionElement | RefDocConstantElement;

export interface ScriptApiOptions {
  // Also carry scalar members as CONSTANT elements and function `examples:` as
  // ref-doc examples HTML. Off for the typing lanes, whose emitter and frozen
  // goldens only ever see functions without examples.
  complete?: boolean;
}

export interface RefDoc {
  info: { namespace: string; brief: string; description: string };
  elements: RefDocElement[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

// A `.script_api` `type:` may spell a union inline (`string | nil`), where the
// core ref-doc format carries one token per alternative. Splitting here keeps the
// downstream emitter and fidelity resolver working in single tokens.
function splitTypeTokens(type: unknown): string[] {
  if (typeof type !== "string") return [];
  return type
    .split("|")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function mapParameters(raw: unknown): RefDocParameter[] {
  if (!Array.isArray(raw)) return [];
  const out: RefDocParameter[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = stringOr(item.name, "");
    // The script_api lists the implicit `self` the engine passes; the emitter
    // stamps @noSelfInFile, so generated signatures must not declare it.
    if (name === "self") continue;
    out.push({
      name,
      doc: stringOr(item.desc, ""),
      types: splitTypeTokens(item.type),
    });
  }
  return out;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function proseHtml(markdown: string): string {
  const prose = markdown.trim();
  return prose === "" ? "" : `<p>${escapeHtml(prose)}</p>`;
}

function codeBlockHtml(lang: string, body: string): string {
  const langClass = lang === "" ? "" : ` class="language-${lang}"`;
  return `<div class="codehilite"><pre><code${langClass}>${escapeHtml(body)}</code></pre></div>`;
}

const FENCED_BLOCK = /^```([\w+#.-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm;

// Renders an example's markdown `desc` as the ref-doc `examples` HTML the engine
// pages carry, so `examplesHtmlToMarkdown` reads both through one path.
function exampleHtml(markdown: string): string {
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of markdown.matchAll(FENCED_BLOCK)) {
    parts.push(proseHtml(markdown.slice(lastIndex, match.index)));
    parts.push(codeBlockHtml(match[1] ?? "", (match[2] ?? "").replace(/\n$/, "")));
    lastIndex = match.index + match[0].length;
  }
  parts.push(proseHtml(markdown.slice(lastIndex)));
  return parts.join("");
}

function examplesHtml(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .map((entry) => (isRecord(entry) ? exampleHtml(stringOr(entry.desc, "")) : ""))
    .join("");
}

function isScalar(member: Record<string, unknown>): boolean {
  return member.type !== "function" && member.type !== "table";
}

/**
 * Convert a parsed Defold extension `.script_api` document into the core
 * ref-doc JSON object shape that `parseDefoldApiDoc` consumes. By default only
 * `type: function` members are carried; scalar members (constants) are
 * dropped, matching the core ref-doc pipeline where non-function elements
 * never reach the emitter. With `complete`, scalar members at the top level and
 * one table deep are also carried as CONSTANT elements, and each function's
 * `examples:` becomes `codehilite` examples HTML that keeps each fence's
 * language, for the docs pages.
 */
export function scriptApiToRefDoc(parsed: unknown, options: ScriptApiOptions = {}): RefDoc {
  if (!Array.isArray(parsed)) {
    throw new Error("scriptApiToRefDoc: expected a top-level YAML list");
  }
  const tables = parsed.filter(
    (e): e is Record<string, unknown> => isRecord(e) && e.type === "table",
  );
  if (tables.length === 0) {
    throw new Error("scriptApiToRefDoc: no top-level `type: table` namespace entry found");
  }
  if (tables.length > 1) {
    throw new Error("scriptApiToRefDoc: expected exactly one top-level table, found multiple");
  }
  const table = tables[0] as Record<string, unknown>;
  const namespace = stringOr(table.name, "");
  if (namespace.length === 0) {
    throw new Error("scriptApiToRefDoc: top-level table is missing a `name`");
  }
  const members = Array.isArray(table.members) ? table.members : [];
  const elements: RefDocElement[] = [];
  const fnElement = (name: string, member: Record<string, unknown>): RefDocFunctionElement => {
    const element: RefDocFunctionElement = {
      type: "FUNCTION",
      name,
      description: stringOr(member.desc, ""),
      parameters: mapParameters(member.parameters),
      returnvalues: mapParameters(member.returns),
    };
    const examples = options.complete ? examplesHtml(member.examples) : "";
    if (examples !== "") element.examples = examples;
    return element;
  };
  const constantElement = (
    name: string,
    member: Record<string, unknown>,
  ): RefDocConstantElement => ({
    type: "CONSTANT",
    name,
    brief: stringOr(member.desc, ""),
    description: stringOr(member.desc, ""),
  });
  for (const member of members) {
    if (!isRecord(member)) continue;
    if (member.type === "function") {
      elements.push(fnElement(`${namespace}.${stringOr(member.name, "")}`, member));
      continue;
    }
    if (options.complete && isScalar(member)) {
      elements.push(constantElement(`${namespace}.${stringOr(member.name, "")}`, member));
      continue;
    }
    if (member.type === "table") {
      const sub = stringOr(member.name, "");
      // A nameless sub-namespace can't form a valid dotted name; skip it.
      if (sub.length === 0) continue;
      const subMembers = Array.isArray(member.members) ? member.members : [];
      for (const subMember of subMembers) {
        // Recurse exactly one level: a `type: table` nested here is 2nd-level,
        // whose functions the emitter's one-dot pass would silently drop.
        if (!isRecord(subMember)) continue;
        const name = `${namespace}.${sub}.${stringOr(subMember.name, "")}`;
        if (subMember.type === "function") elements.push(fnElement(name, subMember));
        else if (options.complete && isScalar(subMember)) {
          elements.push(constantElement(name, subMember));
        }
      }
    }
  }
  const doc: RefDoc = {
    info: { namespace, brief: stringOr(table.desc, ""), description: stringOr(table.desc, "") },
    elements,
  };
  return doc;
}

export function parseScriptApi(yamlText: string, options: ScriptApiOptions = {}): RefDoc {
  return scriptApiToRefDoc(parse(yamlText), options);
}
