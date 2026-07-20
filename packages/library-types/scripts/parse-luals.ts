/**
 * A line-oriented reader for the LuaLS `---@` annotation dialect that druid-style
 * pure-Lua libraries ship in place of a `.d.ts`. It populates a `LibraryModel`, a
 * richer OOP shape than the flat `ApiModule` (`packages/types/src/api-doc.ts`):
 * interfaces with methods/fields/generics/extends, aliases, and free module
 * functions. Naming mirrors the flat model where it fits (`types: string[]`,
 * `brief`, `isOptional`, `doc`) so the two read alike.
 *
 * Scope is parse-only: every LuaLS type expression is preserved as a raw token
 * string, verbatim (`integer`, `string?`, `fun(self):number`, `table<K,V>`,
 * `"a" | "b"`). Mapping those tokens to TypeScript is the next goal; this reader
 * never rewrites, splits, or normalizes a type toward TS.
 */

export interface LibraryModel {
  interfaces: LibraryInterface[];
  aliases: LibraryAlias[];
  moduleFunctions: LibraryMethod[];
}

export interface LibraryInterface {
  name: string;
  extends?: string;
  generics: LibraryGeneric[];
  fields: LibraryField[];
  methods: LibraryMethod[];
  brief: string;
}

export interface LibraryMethod {
  name: string;
  brief: string;
  generics: LibraryGeneric[];
  params: LibraryParam[];
  returns: LibraryParam[];
}

export interface LibraryParam {
  name: string;
  types: string[];
  doc: string;
  isOptional: boolean;
  isVararg: boolean;
}

export type LibraryFieldVisibility = "public" | "protected" | "private" | "package";

export interface LibraryField {
  name: string;
  types: string[];
  doc: string;
  isOptional: boolean;
  visibility?: LibraryFieldVisibility;
}

export interface LibraryGeneric {
  name: string;
  constraint?: string;
}

export interface LibraryAlias {
  name: string;
  types: string[];
  doc: string;
}

interface Pending {
  doc: string[];
  params: LibraryParam[];
  returns: LibraryParam[];
  generics: LibraryGeneric[];
}

const emptyPending = (): Pending => ({ doc: [], params: [], returns: [], generics: [] });

/**
 * Read a single raw type token from the head of `rest`, honoring bracket depth so
 * an inner space (`table<string, any>`, `fun(a, b): c`) does not end the token. The
 * token ends at the first top-level whitespace, except that a space right after a
 * top-level `:` or `,` continues the token — so a spaced `fun(text_id: string):
 * string` return arrow and a multi-return `fun(): number, string` separator are kept
 * whole rather than truncated at the `):`/`,`. Returns the token and the trailing
 * remainder (the human description). Never rewrites the token toward TS. The only
 * inputs carrying a top-level `:`/`,` are `fun(...)` type expressions, so plain
 * types, unions, and descriptions are unaffected.
 */
function readTypeToken(rest: string): { type: string; rest: string } {
  let depth = 0;
  let lastNonSpace = "";
  let i = 0;
  for (; i < rest.length; i++) {
    const c = rest[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if ((c === " " || c === "\t") && depth === 0) {
      if (lastNonSpace !== ":" && lastNonSpace !== ",") break;
      continue;
    }
    if (c !== undefined && c !== " " && c !== "\t") lastNonSpace = c;
  }
  return { type: rest.slice(0, i), rest: rest.slice(i).trim() };
}

/** A bare lowercase identifier — the shape druid uses for an optional `@return` name. */
const RETURN_NAME = /^[a-z_][A-Za-z0-9_]*$/;

function parseParam(rest: string): LibraryParam {
  const spaceAt = rest.search(/\s/);
  const rawName = spaceAt === -1 ? rest : rest.slice(0, spaceAt);
  const afterName = spaceAt === -1 ? "" : rest.slice(spaceAt).trim();
  const isVararg = rawName === "...";
  const isOptional = !isVararg && rawName.endsWith("?");
  const name = isOptional ? rawName.slice(0, -1) : rawName;
  const { type, rest: doc } = readTypeToken(afterName);
  return { name, types: type ? [type] : [], doc, isOptional, isVararg };
}

function parseReturn(rest: string): LibraryParam {
  const { type, rest: afterType } = readTypeToken(rest);
  const spaceAt = afterType.search(/\s/);
  const head = spaceAt === -1 ? afterType : afterType.slice(0, spaceAt);
  let name = "";
  let doc = afterType;
  if (head && RETURN_NAME.test(head)) {
    name = head;
    doc = spaceAt === -1 ? "" : afterType.slice(spaceAt).trim();
  }
  return { name, types: type ? [type] : [], doc, isOptional: false, isVararg: false };
}

const VISIBILITY_KEYWORDS = new Set<LibraryFieldVisibility>([
  "public",
  "protected",
  "private",
  "package",
]);

function parseField(rest: string): LibraryField {
  // LuaLS grammar is `---@field [scope] <name> <type> [description]`. Strip a leading
  // visibility keyword only when a further token follows it — a lone `---@field private`
  // is a field literally named `private`, matching LuaLS's own resolution.
  let body = rest;
  let visibility: LibraryFieldVisibility | undefined;
  const firstSpace = body.search(/\s/);
  if (firstSpace !== -1) {
    const first = body.slice(0, firstSpace);
    if (VISIBILITY_KEYWORDS.has(first as LibraryFieldVisibility)) {
      visibility = first as LibraryFieldVisibility;
      body = body.slice(firstSpace).trim();
    }
  }
  const spaceAt = body.search(/\s/);
  const rawName = spaceAt === -1 ? body : body.slice(0, spaceAt);
  const afterName = spaceAt === -1 ? "" : body.slice(spaceAt).trim();
  const isOptional = rawName.endsWith("?");
  const name = isOptional ? rawName.slice(0, -1) : rawName;
  const { type, rest: doc } = readTypeToken(afterName);
  return {
    name,
    types: type ? [type] : [],
    doc,
    isOptional,
    ...(visibility ? { visibility } : {}),
  };
}

function parseVararg(rest: string): LibraryParam {
  const { type, rest: doc } = readTypeToken(rest);
  return { name: "...", types: type ? [type] : [], doc, isOptional: false, isVararg: true };
}

function parseGenerics(rest: string): LibraryGeneric[] {
  return rest
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const colon = part.indexOf(":");
      if (colon === -1) return { name: part.trim() };
      return { name: part.slice(0, colon).trim(), constraint: part.slice(colon + 1).trim() };
    });
}

/** Parse a `@class Name[ : parent]` head. The parent is kept as a single raw token. */
function parseClassHead(rest: string): { name: string; extends?: string } {
  const colon = rest.indexOf(":");
  if (colon === -1) return { name: rest.trim() };
  const parent = rest.slice(colon + 1).trim();
  return { name: rest.slice(0, colon).trim(), ...(parent ? { extends: parent } : {}) };
}

interface FunctionDecl {
  kind: "method" | "module";
  receiver?: string;
  name: string;
  // A dotted module form (`function T.name`, `T.name = function`) is public module
  // surface; a bare/`local` form (`function name`, `local function name`) is not.
  qualified: boolean;
}

const FUNCTION_FORMS: {
  re: RegExp;
  kind: "method" | "module";
  recv?: number;
  name: number;
  qualified?: boolean;
}[] = [
  { re: /^function\s+([A-Za-z_][\w.]*):([A-Za-z_]\w*)\s*\(/, kind: "method", recv: 1, name: 2 },
  {
    re: /^function\s+([A-Za-z_][\w.]*)\.([A-Za-z_]\w*)\s*\(/,
    kind: "module",
    name: 2,
    qualified: true,
  },
  { re: /^(?:local\s+)?function\s+([A-Za-z_]\w*)\s*\(/, kind: "module", name: 1, qualified: false },
  { re: /^([A-Za-z_][\w.]*):([A-Za-z_]\w*)\s*=\s*function\b/, kind: "method", recv: 1, name: 2 },
  {
    re: /^([A-Za-z_][\w.]*)\.([A-Za-z_]\w*)\s*=\s*function\b/,
    kind: "module",
    name: 2,
    qualified: true,
  },
  { re: /^([A-Za-z_]\w*)\s*=\s*function\b/, kind: "module", name: 1, qualified: false },
];

function parseFunctionDecl(line: string): FunctionDecl | null {
  for (const form of FUNCTION_FORMS) {
    const m = form.re.exec(line);
    if (!m) continue;
    const name = m[form.name] ?? "";
    if (form.kind === "method") {
      const receiver = form.recv ? m[form.recv] : undefined;
      return { kind: "method", name, qualified: true, ...(receiver ? { receiver } : {}) };
    }
    return { kind: "module", name, qualified: form.qualified ?? false };
  }
  return null;
}

const LOCAL_ASSIGN = /^local\s+([A-Za-z_]\w*)\s*=/;

/**
 * Scan one LuaLS-annotated source into a `LibraryModel`. Only column-0 lines are
 * recognized (module- and class-level declarations and their leading `---@` block);
 * indented lines — in-body closures, `---@cast`/`---@type` narrowing — are opaque,
 * so they neither create declarations nor pollute the pending block. Output order
 * follows source order, making the result stable across repeated runs.
 *
 * Only dotted module forms (`function T.name`, `T.name = function`) count as module
 * surface; a bare or `local function` is a private helper and is skipped. Limitation:
 * a bare function later re-exported via `M.x = helper` is not recovered as surface.
 */
export function parseLualsSource(source: string): LibraryModel {
  const interfaces: LibraryInterface[] = [];
  const byName = new Map<string, LibraryInterface>();
  const aliases: LibraryAlias[] = [];
  const moduleFunctions: LibraryMethod[] = [];
  const receiverBinding = new Map<string, string>();

  let pending = emptyPending();
  let openClass: LibraryInterface | null = null;
  let lastOpenedClass: string | null = null;

  const ensureInterface = (name: string): LibraryInterface => {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: LibraryInterface = {
      name,
      generics: [],
      fields: [],
      methods: [],
      brief: "",
    };
    byName.set(name, created);
    interfaces.push(created);
    return created;
  };

  const methodFromPending = (name: string): LibraryMethod => ({
    name,
    brief: pending.doc.join("\n"),
    generics: pending.generics,
    params: pending.params,
    returns: pending.returns,
  });

  for (const raw of source.split("\n")) {
    // Column-0 discipline: a line with leading whitespace is opaque to the scanner.
    if (/^\s/.test(raw) || raw.length === 0) continue;

    if (raw.startsWith("---@")) {
      const tagMatch = /^---@([a-zA-Z]+)\s*(.*)$/.exec(raw);
      if (!tagMatch) continue;
      const tag = tagMatch[1];
      const rest = (tagMatch[2] ?? "").trim();
      switch (tag) {
        case "class": {
          const head = parseClassHead(rest);
          const iface = ensureInterface(head.name);
          if (head.extends) iface.extends = head.extends;
          if (pending.doc.length > 0 && iface.brief === "") iface.brief = pending.doc.join("\n");
          if (pending.generics.length > 0) iface.generics = pending.generics;
          openClass = iface;
          lastOpenedClass = head.name;
          pending = emptyPending();
          break;
        }
        case "field": {
          if (openClass) openClass.fields.push(parseField(rest));
          break;
        }
        case "param": {
          pending.params.push(parseParam(rest));
          break;
        }
        case "vararg": {
          pending.params.push(parseVararg(rest));
          break;
        }
        case "return": {
          pending.returns.push(parseReturn(rest));
          break;
        }
        case "generic": {
          pending.generics.push(...parseGenerics(rest));
          break;
        }
        case "alias": {
          const spaceAt = rest.search(/\s/);
          const name = spaceAt === -1 ? rest : rest.slice(0, spaceAt);
          const expr = spaceAt === -1 ? "" : rest.slice(spaceAt).trim();
          aliases.push({ name, types: expr ? [expr] : [], doc: pending.doc.join("\n") });
          pending = emptyPending();
          break;
        }
        default:
          // @private, @protected, @cast, @type, @diagnostic, @overload, ... — outside
          // the Druid subset; recognized as a tag and skipped, never treated as doc.
          break;
      }
      continue;
    }

    if (raw.startsWith("---")) {
      pending.doc.push(raw.slice(3).trim());
      continue;
    }

    const decl = parseFunctionDecl(raw);
    if (decl) {
      if (decl.kind === "method") {
        const target = decl.receiver ? (receiverBinding.get(decl.receiver) ?? decl.receiver) : "";
        ensureInterface(target).methods.push(methodFromPending(decl.name));
      } else if (decl.qualified) {
        moduleFunctions.push(methodFromPending(decl.name));
      }
      pending = emptyPending();
      openClass = null;
      continue;
    }

    const localAssign = LOCAL_ASSIGN.exec(raw);
    if (localAssign) {
      const variable = localAssign[1];
      if (variable && lastOpenedClass) receiverBinding.set(variable, lastOpenedClass);
      lastOpenedClass = null;
      openClass = null;
      pending = emptyPending();
    }
  }

  return { interfaces, aliases, moduleFunctions };
}

/**
 * Fold several parsed models into one, merging interfaces by name (concatenating
 * fields and methods, keeping the first non-empty `extends`/`brief`/`generics`) and
 * concatenating aliases and module functions in argument order. Deterministic given
 * a stable input order — the snapshot feeds it the fixture files sorted by path.
 */
export function mergeLibraryModels(models: LibraryModel[]): LibraryModel {
  const interfaces: LibraryInterface[] = [];
  const byName = new Map<string, LibraryInterface>();
  const aliases: LibraryAlias[] = [];
  const moduleFunctions: LibraryMethod[] = [];

  for (const model of models) {
    for (const iface of model.interfaces) {
      const existing = byName.get(iface.name);
      if (!existing) {
        const copy: LibraryInterface = {
          name: iface.name,
          ...(iface.extends ? { extends: iface.extends } : {}),
          generics: [...iface.generics],
          fields: [...iface.fields],
          methods: [...iface.methods],
          brief: iface.brief,
        };
        byName.set(iface.name, copy);
        interfaces.push(copy);
        continue;
      }
      existing.fields.push(...iface.fields);
      existing.methods.push(...iface.methods);
      if (!existing.extends && iface.extends) existing.extends = iface.extends;
      if (existing.brief === "" && iface.brief !== "") existing.brief = iface.brief;
      if (existing.generics.length === 0 && iface.generics.length > 0) {
        existing.generics = [...iface.generics];
      }
    }
    aliases.push(...model.aliases);
    moduleFunctions.push(...model.moduleFunctions);
  }

  return { interfaces, aliases, moduleFunctions };
}
