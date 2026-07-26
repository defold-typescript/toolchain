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
  // A class-level `---@overload fun(...)`, kept as its raw `fun(...)` token plus the
  // trailing description. Present only on interfaces that declare one (like `extends`),
  // so an interface without overloads carries no key. The emitter renders each as an
  // interface call signature; the mapper maps the token to a `(params): ret` form.
  overloads?: LibraryOverload[];
}

export interface LibraryOverload {
  type: string;
  doc: string;
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
  // True when the raw type token carries a top-level `nil` union member (`T|nil`),
  // distinct from the literal trailing `?` that drives `isOptional`. Set only when
  // true (like a field's `visibility`), so a non-nil-bearing param carries no key.
  // The emitter's trailing-run rule treats `isOptional || isNilable` as omittable.
  isNilable?: boolean;
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
  overloads: LibraryOverload[];
}

const emptyPending = (): Pending => ({
  doc: [],
  params: [],
  returns: [],
  generics: [],
  overloads: [],
});

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

/** Index of the bracket matching the opener at `open`, or -1 if unbalanced. */
function matchCloser(s: string, open: number): number {
  const pairs: Record<string, string> = { "<": ">", "(": ")", "[": "]", "{": "}" };
  const want = pairs[s[open] as string];
  let depth = 0;
  let inQuote = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return c === want ? i : -1;
    }
  }
  return -1;
}

/**
 * True when the raw type token has a top-level `nil` union member (`T|nil`,
 * `fun()|nil`) — the signal that a parameter is nil-bearing and can be emitted
 * TS-optional. Bracket- and quote-depth aware so a `nil` nested in
 * `table<...>`/`{...}`/a `"..."` literal does not count, and a `fun(...): ret|nil`
 * return-union (whose `|nil` sits at depth 0 after the `)`) is recognized as the
 * function's own return, not an outer nullable — only a `|nil` applied to the whole
 * token flags the param. Self-contained: the parser is upstream of the mapper and
 * must not import it.
 */
function hasTopLevelNil(rawToken: string): boolean {
  let token = rawToken.trim();
  while (token.startsWith("(") && matchCloser(token, 0) === token.length - 1) {
    token = token.slice(1, -1).trim();
  }
  if (/^fun\s*\(/.test(token)) {
    const close = matchCloser(token, token.indexOf("("));
    if (
      close !== -1 &&
      token
        .slice(close + 1)
        .trim()
        .startsWith(":")
    )
      return false;
  }
  const isNilSeg = (from: number, to: number): boolean => token.slice(from, to).trim() === "nil";
  let depth = 0;
  let inQuote = false;
  let segStart = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (inQuote) {
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === "|") {
      if (isNilSeg(segStart, i)) return true;
      segStart = i + 1;
    }
  }
  return isNilSeg(segStart, token.length);
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
  const param: LibraryParam = { name, types: type ? [type] : [], doc, isOptional, isVararg };
  if (type && hasTopLevelNil(type)) param.isNilable = true;
  return param;
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
  const param: LibraryParam = {
    name: "...",
    types: type ? [type] : [],
    doc,
    isOptional: false,
    isVararg: true,
  };
  if (type && hasTopLevelNil(type)) param.isNilable = true;
  return param;
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
          if (pending.overloads.length > 0) iface.overloads = pending.overloads;
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
        case "overload": {
          // A class-level `---@overload fun(...)`: keep the raw `fun(...)` token via
          // readTypeToken (its spaced `): ret` return stays whole) plus the trailing
          // doc, and transfer to the interface on the following `@class` — like brief
          // and generics. A non-`fun` overload is outside the modeled subset and dropped.
          const { type, rest: doc } = readTypeToken(rest);
          if (/^fun\s*\(/.test(type)) pending.overloads.push({ type, doc });
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
          // @private, @protected, @cast, @type, @diagnostic, ... — outside the Druid
          // subset; recognized as a tag and skipped, never treated as doc.
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
          ...(iface.overloads && iface.overloads.length > 0
            ? { overloads: [...iface.overloads] }
            : {}),
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
      if (
        (!existing.overloads || existing.overloads.length === 0) &&
        iface.overloads &&
        iface.overloads.length > 0
      ) {
        existing.overloads = [...iface.overloads];
      }
    }
    aliases.push(...model.aliases);
    moduleFunctions.push(...model.moduleFunctions);
  }

  // A class split across fixtures (e.g. druid's curated + runtime `druid.logger`
  // blocks) concatenates both field sets above, so the same field name can appear
  // twice with conflicting signatures — an invalid declaration masked by
  // `skipLibCheck`. Collapse to the first occurrence; methods stay untouched so
  // overloaded module functions keep every signature.
  for (const iface of interfaces) iface.fields = dedupeByName(iface.fields);

  return { interfaces, aliases, moduleFunctions };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
