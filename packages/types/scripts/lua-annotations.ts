import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchBracket, splitTopLevel } from "../src/luals-type-expr";
import type { ApiTarget } from "./regen";

// The LuaLS annotation files Defold ships in `ref-doc.zip` since 1.13.2, read as
// an upstream-written oracle for the declarations this repo derives from the
// ref-doc JSON. Kept apart from the library lane's `parse-luals.ts`, which drops
// dotted prefixes, function overloads, enums and bare globals by contract.

export type AnnotationSurface = "runtime" | "editor";

export interface AnnotatedParam {
  readonly name: string;
  readonly types: readonly string[];
  readonly optional: boolean;
  readonly vararg: boolean;
}

export interface AnnotatedReturn {
  readonly types: readonly string[];
  readonly name?: string;
}

export interface AnnotatedGeneric {
  readonly name: string;
  readonly constraint: readonly string[];
}

export interface AnnotatedSignature {
  readonly params: readonly AnnotatedParam[];
  readonly returns: readonly AnnotatedReturn[];
}

export interface AnnotatedFunction extends AnnotatedSignature {
  readonly name: string;
  readonly surface: AnnotationSurface;
  readonly file: string;
  readonly generics: readonly AnnotatedGeneric[];
  readonly overloads: readonly AnnotatedSignature[];
}

export interface AnnotatedAlias {
  readonly name: string;
  readonly surface: AnnotationSurface;
  readonly file: string;
  readonly members: readonly string[];
}

export interface AnnotatedEnum {
  readonly name: string;
  readonly surface: AnnotationSurface;
  readonly file: string;
  readonly types: readonly string[];
  readonly members: readonly string[];
}

export interface AnnotatedField {
  readonly name: string;
  readonly types: readonly string[];
  readonly optional: boolean;
}

export interface AnnotatedClass {
  readonly name: string;
  readonly surface: AnnotationSurface;
  readonly file: string;
  readonly parents: readonly string[];
  readonly fields: readonly AnnotatedField[];
}

// Every map is keyed `<surface>:<name>`: the runtime and the editor VM declare
// some of the same names (`json.decode`, `http.response`) with different shapes.
export interface AnnotationModel {
  readonly functions: Map<string, AnnotatedFunction>;
  readonly aliases: Map<string, AnnotatedAlias>;
  readonly enums: Map<string, AnnotatedEnum>;
  readonly classes: Map<string, AnnotatedClass>;
}

export interface AnnotationFile {
  readonly name: string;
  readonly text: string;
}

// Tags that carry nothing the model records. Any tag outside these and the
// handled ones fails the parse, so a new upstream tag is never silently dropped.
const IGNORED_TAGS = new Set(["meta", "diagnostic", "operator"]);

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function surfaceOf(file: string): AnnotationSurface {
  if (file.endsWith(".editor_script")) return "editor";
  if (file.endsWith(".lua")) return "runtime";
  throw new Error(`not an annotation file: ${file}`);
}

function splitUnion(text: string): string[] {
  return splitTopLevel(text.trim(), "|")
    .map((member) => member.trim())
    .filter((member) => member !== "");
}

// A tag's type runs to its first top-level space, so `fun(a:b, c:d)` and
// `table<K, V>` stay whole; whatever follows is the name and description.
function leadingType(text: string): { type: string; rest: string } {
  const trimmed = text.trim();
  const type = splitTopLevel(trimmed, " ")[0] ?? "";
  return { type, rest: trimmed.slice(type.length).trim() };
}

function headWord(text: string): { word: string; rest: string } {
  const trimmed = text.trim();
  const space = trimmed.search(/\s/);
  return space === -1
    ? { word: trimmed, rest: "" }
    : { word: trimmed.slice(0, space), rest: trimmed.slice(space).trim() };
}

function optionalName(raw: string): { name: string; optional: boolean } {
  return raw.endsWith("?")
    ? { name: raw.slice(0, -1), optional: true }
    : { name: raw, optional: false };
}

function parseParamTag(text: string): AnnotatedParam {
  const { word, rest } = headWord(text);
  const { name, optional } = optionalName(word);
  return { name, types: splitUnion(leadingType(rest).type), optional, vararg: name === "..." };
}

const RETURN_NAME = /^(?:[A-Za-z_][A-Za-z0-9_]*|\.\.\.)$/;

function parseReturnTag(text: string): AnnotatedReturn {
  const { type, rest } = leadingType(text);
  const name = headWord(rest).word;
  return { types: splitUnion(type), ...(RETURN_NAME.test(name) ? { name } : {}) };
}

function parseGenericTag(text: string): AnnotatedGeneric[] {
  return splitTopLevel(text.trim(), ",").map((part) => {
    const colon = part.indexOf(":");
    return colon === -1
      ? { name: part.trim(), constraint: [] }
      : { name: part.slice(0, colon).trim(), constraint: splitUnion(part.slice(colon + 1)) };
  });
}

function parseFunParam(part: string): AnnotatedParam {
  const trimmed = part.trim();
  const colon = trimmed.indexOf(":");
  const { name, optional } = optionalName(colon === -1 ? trimmed : trimmed.slice(0, colon).trim());
  const types = colon === -1 ? [] : splitUnion(trimmed.slice(colon + 1));
  return { name, types, optional, vararg: name === "..." };
}

const NAMED_RETURN = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(.+)$/;

// `fun(a:T, b?:U):R1, R2` (returns may be grouped in parentheses) into params
// and returns, the same shape a primary signature's `@param`/`@return` tags give.
export function parseFunSignature(text: string): AnnotatedSignature {
  const trimmed = text.trim();
  const open = trimmed.indexOf("(");
  const close = open === -1 ? -1 : matchBracket(trimmed, open);
  if (!trimmed.startsWith("fun") || close === -1) {
    throw new Error(`not a fun(...) signature: ${text}`);
  }
  const inner = trimmed.slice(open + 1, close);
  const params = inner.trim() === "" ? [] : splitTopLevel(inner, ",").map(parseFunParam);
  let tail = trimmed.slice(close + 1).trim();
  if (!tail.startsWith(":")) return { params, returns: [] };
  tail = tail.slice(1).trim();
  if (tail.startsWith("(") && matchBracket(tail, 0) === tail.length - 1) tail = tail.slice(1, -1);
  const returns = splitTopLevel(tail, ",").map((part): AnnotatedReturn => {
    const named = NAMED_RETURN.exec(part.trim());
    return named
      ? { types: splitUnion(named[2] as string), name: named[1] as string }
      : { types: splitUnion(part) };
  });
  return { params, returns };
}

function nameAndSuffix(text: string): { name: string; suffix: string } {
  const colon = text.indexOf(":");
  return colon === -1
    ? { name: text.trim(), suffix: "" }
    : { name: text.slice(0, colon).trim(), suffix: text.slice(colon + 1).trim() };
}

interface PendingFunction {
  params: AnnotatedParam[];
  returns: AnnotatedReturn[];
  generics: AnnotatedGeneric[];
  overloads: AnnotatedSignature[];
}

function emptyPending(): PendingFunction {
  return { params: [], returns: [], generics: [], overloads: [] };
}

function addUnique<T>(map: Map<string, T>, key: string, value: T, where: string): void {
  if (map.has(key)) throw new Error(`${where}: ${key} is declared twice`);
  map.set(key, value);
}

const FUNCTION_LINE = /^function\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(/;
const ENUM_TABLE_OPEN = /=\s*\{\s*$/;
const ENUM_MEMBER = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

export function parseAnnotations(files: readonly AnnotationFile[]): AnnotationModel {
  const model: AnnotationModel = {
    functions: new Map(),
    aliases: new Map(),
    enums: new Map(),
    classes: new Map(),
  };
  for (const file of files) parseFile(file, model);
  return model;
}

function parseFile(file: AnnotationFile, model: AnnotationModel): void {
  const surface = surfaceOf(file.name);
  let pending = emptyPending();
  let currentClass: { fields: AnnotatedField[] } | null = null;
  let currentAlias: { members: string[] } | null = null;
  let pendingEnum: { members: string[] } | null = null;
  let enumBody: { members: string[] } | null = null;

  const lines = file.text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const where = `${file.name}:${index + 1}`;
    const line = raw.trimEnd();

    if (currentAlias && line.startsWith("---|")) {
      currentAlias.members.push(line.slice(4).trim());
      continue;
    }
    currentAlias = null;

    if (enumBody) {
      if (/^\s*\}/.test(line)) enumBody = null;
      else {
        const member = ENUM_MEMBER.exec(line)?.[1];
        if (member) enumBody.members.push(member);
      }
      continue;
    }

    if (line.startsWith("---@")) {
      const { word: tag, rest } = headWord(line.slice(4));
      switch (tag) {
        case "param":
          pending.params.push(parseParamTag(rest));
          break;
        case "return":
          pending.returns.push(parseReturnTag(rest));
          break;
        case "generic":
          pending.generics.push(...parseGenericTag(rest));
          break;
        case "overload":
          pending.overloads.push(parseFunSignature(rest));
          break;
        case "class": {
          const { name, suffix } = nameAndSuffix(rest);
          const parents = suffix === "" ? [] : splitTopLevel(suffix, ",").map((p) => p.trim());
          const record = {
            name,
            surface,
            file: file.name,
            parents,
            fields: [] as AnnotatedField[],
          };
          addUnique(model.classes, `${surface}:${name}`, record, where);
          currentClass = record;
          pending = emptyPending();
          break;
        }
        case "field": {
          if (!currentClass) throw new Error(`${where}: @field outside a @class`);
          const { word, rest: typed } = headWord(rest);
          const { name, optional } = optionalName(word);
          currentClass.fields.push({ name, types: splitUnion(leadingType(typed).type), optional });
          break;
        }
        case "alias": {
          const { word: name, rest: body } = headWord(rest);
          const record = { name, surface, file: file.name, members: splitUnion(body) };
          addUnique(model.aliases, `${surface}:${name}`, record, where);
          currentAlias = record;
          currentClass = null;
          break;
        }
        case "enum": {
          const { name, suffix } = nameAndSuffix(rest);
          const record = {
            name,
            surface,
            file: file.name,
            types: splitUnion(suffix),
            members: [] as string[],
          };
          addUnique(model.enums, `${surface}:${name}`, record, where);
          pendingEnum = record;
          currentClass = null;
          break;
        }
        default:
          if (!IGNORED_TAGS.has(tag)) throw new Error(`${where}: unknown annotation tag @${tag}`);
      }
      continue;
    }

    if (line.startsWith("---")) continue;

    const fqn = FUNCTION_LINE.exec(line)?.[1];
    if (fqn) {
      addUnique(
        model.functions,
        `${surface}:${fqn}`,
        { name: fqn, surface, file: file.name, ...pending },
        where,
      );
    } else if (pendingEnum && ENUM_TABLE_OPEN.test(line)) {
      enumBody = pendingEnum;
    }
    pending = emptyPending();
    currentClass = null;
    pendingEnum = null;
  }
}

export function annotationsDir(
  target: Pick<ApiTarget, "fixturesDir">,
  packageRoot: string = PACKAGE_ROOT,
): string {
  return resolve(packageRoot, target.fixturesDir, "annotations");
}

export function loadAnnotations(
  target: Pick<ApiTarget, "fixturesDir">,
  packageRoot: string = PACKAGE_ROOT,
): AnnotationModel {
  const dir = annotationsDir(target, packageRoot);
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".lua") || name.endsWith(".editor_script"))
    .sort();
  if (names.length === 0) throw new Error(`no annotation files in ${dir}`);
  return parseAnnotations(
    names.map((name) => ({ name, text: readFileSync(resolve(dir, name), "utf8") })),
  );
}
