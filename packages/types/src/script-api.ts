import { parse } from "yaml";

export interface RefDocParameter {
  name: string;
  doc: string;
  types: string[];
  fields?: RefDocParameter[];
  is_optional?: "True";
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
  /** The scalar's declared `type:` tokens; an engine `CONSTANT` carries none. */
  types: string[];
}

export type RefDocElement = RefDocFunctionElement | RefDocConstantElement;

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

// A `.script_api` spells a slot that takes one of a set of named constants as
// `enum`; the core ref-doc token for the same meaning is `constant`, which the
// emitter expands to the constants the slot's doc names.
const TYPE_TOKEN_ALIASES: ReadonlyMap<string, string> = new Map([["enum", "constant"]]);

// A `.script_api` `type:` may spell a union inline (`string | nil`), where the
// core ref-doc format carries one token per alternative. Splitting here keeps the
// downstream emitter and fidelity resolver working in single tokens. A `type:`
// may also be a YAML list (`[table, string]`), one alternative per entry.
function splitTypeTokens(type: unknown): string[] {
  if (Array.isArray(type)) return type.flatMap(splitTypeTokens);
  if (typeof type !== "string") return [];
  return type
    .split("|")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => TYPE_TOKEN_ALIASES.get(token) ?? token);
}

// Upstream writes a slot list either as a YAML list or, for a lone slot, as a
// single mapping (`return: {type: number}`); both mean the same slots.
function slotList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

// Some generators mark a required slot by suffixing its name (`project_id (REQUIRED)`);
// every slot is already required unless flagged optional, so the suffix is noise.
const REQUIRED_SUFFIX = /\s*\(required\)$/i;

// Upstream writes an omissible slot in call-syntax brackets (`[options]`), the
// same convention its own `desc` prose uses for an optional argument.
const BRACKETED_NAME = /^\[([^[\]]+)\]$/;

function slotName(item: Record<string, unknown>): string {
  return stringOr(item.name, "").replace(REQUIRED_SUFFIX, "");
}

function isBracketed(item: Record<string, unknown>): boolean {
  return BRACKETED_NAME.test(slotName(item));
}

// Generators emit placeholder or C-signature names (`None`, `int JoinRandomRoom`)
// that cannot form a Lua member access, so no page or declaration can carry them.
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isFunctionName(name: string): boolean {
  return name !== "None" && FUNCTION_NAME.test(name);
}

function mapSlot(item: Record<string, unknown>): RefDocParameter {
  const name = slotName(item);
  const bracketed = BRACKETED_NAME.exec(name);
  const slot: RefDocParameter = {
    name: bracketed ? (bracketed[1] ?? "").trim() : name,
    doc: stringOr(item.desc, ""),
    types: splitTypeTokens(item.type),
  };
  // A callback lists its arguments under `parameters:` and a table its keys under
  // `fields:` or `members:`; the ref-doc format carries all as `fields`. A
  // callback's own `self` is kept, since the engine really passes it to the callback.
  const nested = [
    ...slotList(item.parameters),
    ...slotList(item.fields),
    ...slotList(item.members),
  ];
  if (nested.length > 0) slot.fields = nested.map(mapSlot);
  if (item.optional === true || bracketed) slot.is_optional = "True";
  return slot;
}

// The script_api lists the implicit `self` the engine passes; the emitter
// stamps @noSelfInFile, so generated signatures must not declare it.
function callSlots(raw: unknown): Record<string, unknown>[] {
  return slotList(raw).filter((item) => stringOr(item.name, "") !== "self");
}

function mapParameters(raw: unknown): RefDocParameter[] {
  return callSlots(raw).map(mapSlot);
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
 * ref-doc JSON object shape that `parseDefoldApiDoc` consumes. `type: function`
 * members become FUNCTION elements; scalar members at the top level and one
 * table deep become CONSTANT elements carrying their `type:` tokens, so a
 * `type: string` scalar reaches the emitter as a string constant; each
 * function's `examples:` becomes
 * `codehilite` examples HTML that keeps each fence's language; and each slot's
 * nested `parameters:`/`fields:` and `optional: true` become ref-doc `fields`
 * and `is_optional`. The Libraries pages, the `script-api` lane, the extension
 * goldens and `resolve` all read this one conversion.
 *
 * Upstream dialects are normalized: a function's slots are read from the first
 * present of `parameters:`, `params:` or `members:` and its returns from
 * `returns:` or `return:`, any slot list may be a single mapping, a table slot's
 * `members:` nest like `fields:`, a `(REQUIRED)` name suffix is dropped, and a
 * function named `None` or not a Lua identifier is skipped. A slot or field
 * named in brackets (`[options]`) takes the bare name and `is_optional`, and a
 * function with such a slot before a slot that is not optional is also
 * converted, first and without its examples, as a form that leaves out every
 * such bracketed slot.
 */
export function scriptApiToRefDoc(parsed: unknown): RefDoc {
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
  const fnElement = (name: string, member: Record<string, unknown>): RefDocFunctionElement[] => {
    const raw = callSlots(member.parameters ?? member.params ?? member.members);
    const parameters = raw.map(mapSlot);
    const element: RefDocFunctionElement = {
      type: "FUNCTION",
      name,
      description: stringOr(member.desc, ""),
      parameters,
      returnvalues: mapParameters(member.returns ?? member.return),
    };
    const examples = examplesHtml(member.examples);
    if (examples !== "") element.examples = examples;
    // A bracketed slot a required one follows can only be left out by a call
    // that skips it, so that call gets its own form; an explicit
    // `optional: true` slot reads as passable-nil instead and gets none.
    const omissible = new Set(
      raw.flatMap((item, index) =>
        isBracketed(item) && parameters.slice(index + 1).some((p) => p.is_optional === undefined)
          ? [index]
          : [],
      ),
    );
    if (omissible.size === 0) return [element];
    const { examples: _examples, ...withoutExamples } = element;
    const omitted: RefDocFunctionElement = {
      ...withoutExamples,
      parameters: parameters.filter((_, index) => !omissible.has(index)),
    };
    return [omitted, element];
  };
  const constantElement = (
    name: string,
    member: Record<string, unknown>,
  ): RefDocConstantElement => ({
    type: "CONSTANT",
    name,
    brief: stringOr(member.desc, ""),
    description: stringOr(member.desc, ""),
    types: splitTypeTokens(member.type),
  });
  for (const member of members) {
    if (!isRecord(member)) continue;
    if (member.type === "function") {
      if (!isFunctionName(stringOr(member.name, ""))) continue;
      elements.push(...fnElement(`${namespace}.${stringOr(member.name, "")}`, member));
      continue;
    }
    if (isScalar(member)) {
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
        if (subMember.type === "function") {
          if (isFunctionName(stringOr(subMember.name, "")))
            elements.push(...fnElement(name, subMember));
        } else if (isScalar(subMember)) {
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

export function parseScriptApi(yamlText: string): RefDoc {
  return scriptApiToRefDoc(parse(yamlText));
}
