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
  // The name of the `---@class` a `return <name>` at column 0 hands back as the module
  // table. Its public fields are the module's own constants (`export const`s), not a
  // standalone interface. Set only when a returned local resolves to an opened class,
  // so a module with a plain returned table carries no key.
  moduleObject?: string;
  // Each column-0 `<table>.<NAME>` that starts a non-function assignment, in source
  // order, with its receiver: an unannotated constant can be typed via the
  // `moduleConstants` override only under a name assigned on `moduleReturn`. Omitted
  // when empty, like `moduleObject`.
  moduleAssignments?: { table: string; name: string }[];
  // The identifier of the last column-0 `return <ident>` in the file: the table the
  // module hands back. Omitted when the file has none (a dotted or call-expression
  // return, or only indented ones).
  moduleReturn?: string;
  // Each local table the returned module re-exports under a field (`FL.Node = Node`),
  // with the dot functions defined on it, in source order: a module value
  // (`flex.Node.new()`), not module functions. Omitted when empty, like
  // `moduleAssignments`.
  moduleTables?: { name: string; table: string; functions: LibraryMethod[] }[];
  // Module-level constants the Lua assigns without an annotation, added by the
  // `moduleConstants` override and emitted as `export const`s. Omitted when empty.
  moduleConstants?: LibraryField[];
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
  deprecated?: string;
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
  // A standalone `---@local`/`---@private`/`---@protected`/`---@package` before the
  // function declaration. Set only when marked (like a field's `visibility`), so an
  // unmarked method carries no key. `local` has no `@field` analogue (LuaLS field
  // scope has no `local`), so a method's visibility widens the field set with it.
  visibility?: LibraryMethodVisibility;
  // A `---@deprecated` on the pending block. Present exactly when the tag is, with
  // `""` for the bare form — absence of the key is the sole encoding of "not
  // deprecated", so a bare tag must never be collapsed away by a truthiness guard.
  deprecated?: string;
  // A class function the caller invokes with `.` (no `self`): a `---@meta` file's
  // `function cls.name()` on a local bound to `---@class cls`. Set only when true, so
  // a colon method carries no key; the emitter renders it with `this: void`.
  noSelf?: true;
  // A method the library checks for before calling it (`if network.request_idfa then`),
  // so an implementation may omit it. Set only when true, and only by an
  // `annotationOverrides` entry: LuaLS has no annotation the parser could read it from.
  optional?: true;
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

export type LibraryMethodVisibility = LibraryFieldVisibility | "local";

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
  deprecated?: string;
}

interface Pending {
  doc: string[];
  params: LibraryParam[];
  returns: LibraryParam[];
  generics: LibraryGeneric[];
  overloads: LibraryOverload[];
  visibility?: LibraryMethodVisibility;
  deprecated?: string;
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
 * Split `s` on every top-level occurrence of the single-character `sep`, honoring
 * bracket depth and double-quoted string literals so a separator nested inside
 * `<...>`, `(...)`, `[...]`, `{...}`, or a `"..."` literal does not split. A parser-
 * local copy of the mapper's identical helper — the parser is upstream of the mapper
 * and must not import it (`hasTopLevelNil`'s comment).
 */
function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === sep) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/**
 * Decompose a `fun(...)` token into a method's `params`/`returns`, dropping a leading
 * `self`. Used for a function-local `---@class` member typed by `---@type fun(...)`:
 * modeling it as a method (each param keeping its raw type token) rather than a field
 * makes the emitter render a full-typed method instead of the lossy permissive hook
 * `matchSelfHookField` would produce. An unbalanced token yields empty lists.
 */
function funToMethodParts(token: string): { params: LibraryParam[]; returns: LibraryParam[] } {
  const open = token.indexOf("(");
  const close = open === -1 ? -1 : matchCloser(token, open);
  if (open === -1 || close === -1) return { params: [], returns: [] };
  const paramsStr = token.slice(open + 1, close).trim();
  const afterClose = token.slice(close + 1).trim();

  const params: LibraryParam[] = [];
  const rawParams = paramsStr === "" ? [] : splitTopLevel(paramsStr, ",");
  for (const rawPart of rawParams) {
    const part = rawPart.trim();
    if (part === "") continue;
    if (part.startsWith("...")) {
      const after = part.slice(3).trim();
      const type = after.startsWith(":") ? after.slice(1).trim() : "";
      const vararg: LibraryParam = {
        name: "...",
        types: type ? [type] : [],
        doc: "",
        isOptional: false,
        isVararg: true,
      };
      if (type && hasTopLevelNil(type)) vararg.isNilable = true;
      params.push(vararg);
      continue;
    }
    const colon = splitTopLevel(part, ":");
    const rawName = (colon[0] ?? "").trim();
    const typeExpr = colon.length >= 2 ? colon.slice(1).join(":").trim() : "";
    const isOptional = rawName.endsWith("?");
    const name = isOptional ? rawName.slice(0, -1) : rawName;
    const param: LibraryParam = {
      name,
      types: typeExpr ? [typeExpr] : [],
      doc: "",
      isOptional,
      isVararg: false,
    };
    if (typeExpr && hasTopLevelNil(typeExpr)) param.isNilable = true;
    params.push(param);
  }
  if (params[0]?.name === "self") params.shift();

  const returns: LibraryParam[] = [];
  if (afterClose.startsWith(":")) {
    const retStr = afterClose.slice(1).trim();
    for (const raw of retStr === "" ? [] : splitTopLevel(retStr, ",")) {
      const type = raw.trim();
      if (type)
        returns.push({ name: "", types: [type], doc: "", isOptional: false, isVararg: false });
    }
  }
  return { params, returns };
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
  // A type-suffix `T?` (`string?`, `fun()?`, `(a|b)?`) is nil-bearing. Placed after the
  // fun-return guard so a nullable return (`fun(): a|nil`, `fun(): string?`) never flags.
  if (token.endsWith("?")) return true;
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

/**
 * A single `---@return` line may declare several values (`---@return number, number`),
 * which `readTypeToken`'s comma continuation hands back as one token. Split it on
 * top-level commas into one entry per value; LuaLS attaches the optional trailing name
 * and description to the whole line, so only the last segment carries them. The
 * emitter's `renderReturn` already lowers a multi-entry `returns` to `LuaMultiReturn`.
 */
function parseReturn(rest: string): LibraryParam[] {
  const { type, rest: afterType } = readTypeToken(rest);
  const spaceAt = afterType.search(/\s/);
  const head = spaceAt === -1 ? afterType : afterType.slice(0, spaceAt);
  let name = "";
  let doc = afterType;
  if (head && RETURN_NAME.test(head)) {
    name = head;
    doc = spaceAt === -1 ? "" : afterType.slice(spaceAt).trim();
  }
  const segments = (type ? splitTopLevel(type, ",") : [""])
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  if (segments.length === 0) {
    return [{ name, types: [], doc, isOptional: false, isVararg: false }];
  }
  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    return {
      name: isLast ? name : "",
      types: [segment],
      doc: isLast ? doc : "",
      isOptional: false,
      isVararg: false,
    };
  });
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
  const nameSuffix = rawName.endsWith("?");
  const name = nameSuffix ? rawName.slice(0, -1) : rawName;
  const { type, rest: doc } = readTypeToken(afterName);
  // Interface properties carry no optional-before-required rule, so a `|nil`/`?` type
  // folds straight into the field's optionality.
  const isOptional = nameSuffix || (type !== "" && hasTopLevelNil(type));
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

/**
 * Read one class-head token from `s` starting at `start`, tracking `<[({` depth so a
 * generic like `Bar<A, B>` stays whole. Ends at the first top-level space/tab, `:`, or
 * `,` (none consumed). Returns the trimmed token and its end index. Distinct from
 * `readTypeToken`, whose `fun(...)` `:`/`,` continuation rule wrongly glues a
 * `Name: Parent` head together.
 */
function readClassToken(s: string, start: number): { token: string; end: number } {
  let depth = 0;
  let i = start;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === " " || c === "\t" || c === ":" || c === ",")) break;
  }
  return { token: s.slice(start, i).trim(), end: i };
}

/**
 * Parse a `@class Name[: parent[, parent...]] [description]` head. The identifier and
 * optional parent list are read as bracket-aware tokens; any trailing human
 * description is dropped. Multiple parents are joined with `", "` to match the single
 * `extends` string the emitter renders.
 */
function parseClassHead(rest: string): { name: string; extends?: string } {
  const s = rest.trim();
  const { token: name, end: afterName } = readClassToken(s, 0);
  let i = afterName;
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  if (s[i] !== ":") return { name };
  i++;
  const parents: string[] = [];
  while (true) {
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
    const { token, end } = readClassToken(s, i);
    if (token !== "") parents.push(token);
    i = end;
    while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
    if (s[i] !== ",") break;
    i++;
  }
  const extendsStr = parents.join(", ");
  return { name, ...(extendsStr ? { extends: extendsStr } : {}) };
}

interface FunctionDecl {
  kind: "method" | "module";
  receiver?: string;
  name: string;
  // A dotted module form (`function T.name`, `T.name = function`) is public module
  // surface; a bare/`local` form (`function name`, `local function name`) is not.
  qualified: boolean;
  // The named parameters of the Lua signature, without `...`; absent when the
  // parameter list does not close on the declaration line.
  signature?: string[];
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
    recv: 1,
    name: 2,
    qualified: true,
  },
  { re: /^(?:local\s+)?function\s+([A-Za-z_]\w*)\s*\(/, kind: "module", name: 1, qualified: false },
  { re: /^([A-Za-z_][\w.]*):([A-Za-z_]\w*)\s*=\s*function\b/, kind: "method", recv: 1, name: 2 },
  {
    re: /^([A-Za-z_][\w.]*)\.([A-Za-z_]\w*)\s*=\s*function\b/,
    kind: "module",
    recv: 1,
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
    const receiver = form.recv ? m[form.recv] : undefined;
    const signature = readSignature(line, m[0].length);
    const shared = {
      name,
      ...(receiver ? { receiver } : {}),
      ...(signature ? { signature } : {}),
    };
    if (form.kind === "method") return { kind: "method", qualified: true, ...shared };
    return { kind: "module", qualified: form.qualified ?? false, ...shared };
  }
  return null;
}

function readSignature(line: string, from: number): string[] | undefined {
  // A `function name(` form's match ends on its `(`; a `= function` form's ends before it.
  const start = line.indexOf("(", from - 1);
  if (start === -1) return undefined;
  const close = line.indexOf(")", start);
  if (close === -1) return undefined;
  return line
    .slice(start + 1, close)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "...");
}

/**
 * Order a function's params by its Lua signature, adding each signature param its
 * `---@param` lines omit as an untyped slot. LuaLS treats an unannotated param as
 * nullable, so a caller may leave it out; the slot is optional. A function whose
 * annotations already name every signature param keeps its annotation order. An
 * annotation naming no signature param stays after the param it followed, and the
 * vararg stays last.
 */
function mergeSignatureParams(params: LibraryParam[], signature: string[]): LibraryParam[] {
  if (signature.every((name) => params.some((p) => p.name === name))) return params;
  const merged: LibraryParam[] = signature.map(
    (name) =>
      params.find((p) => p.name === name && !p.isVararg) ?? {
        name,
        types: [],
        doc: "",
        isOptional: true,
        isVararg: false,
      },
  );
  const varargs: LibraryParam[] = [];
  params.forEach((param, index) => {
    if (signature.includes(param.name)) return;
    if (param.isVararg) {
      varargs.push(param);
      return;
    }
    const before = params[index - 1];
    merged.splice(before ? merged.indexOf(before) + 1 : 0, 0, param);
  });
  return [...merged, ...varargs];
}

const LOCAL_ASSIGN = /^local\s+([A-Za-z_]\w*)\s*=/;

// `M.NAME = ...` or the first target of `M.NAME, M[1] = ...`, capturing the receiver
// `M` and the field `NAME`; `M.NAME = function` is matched as a module function first,
// so it never reaches this.
const MODULE_ASSIGN = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*[=,]/;

// `T.name = X` with a bare identifier on the right: a re-export (`FL.Node = Node`) or a
// metatable self-index (`Node.__index = Node`).
const TABLE_ALIAS = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\s*$/;

type ModuleTable = NonNullable<LibraryModel["moduleTables"]>[number];

interface TableAlias {
  table: string;
  name: string;
  value: string;
}

/**
 * Split the dot functions of each local table the returned module re-exports
 * (`FL.Node = Node`) out of the module functions into a `moduleTables` entry, so
 * `Node.new` is declared on `flex.Node`, not as a top-level `flex.new`.
 */
function extractModuleTables(
  moduleReturn: string,
  moduleFunctions: LibraryMethod[],
  receivers: Map<LibraryMethod, string>,
  aliases: TableAlias[],
  byName: Map<string, LibraryInterface>,
): { moduleFunctions: LibraryMethod[]; moduleTables: ModuleTable[] } {
  const moduleTables: ModuleTable[] = [];
  const moved = new Set<LibraryMethod>();
  for (const { table, name, value } of aliases) {
    if (table !== moduleReturn || value === moduleReturn) continue;
    const functions = moduleFunctions.filter((f) => receivers.get(f) === value && !moved.has(f));
    if (functions.length === 0) continue;
    for (const f of functions) moved.add(f);
    moduleTables.push({ name, table: value, functions });
    const isMetatable = aliases.some(
      (a) => a.table === value && a.name === "__index" && a.value === value,
    );
    if (isMetatable) bindConstructedClass(value, functions, byName);
  }
  return { moduleFunctions: moduleFunctions.filter((f) => !moved.has(f)), moduleTables };
}

/**
 * A metatable class (`Node.__index = Node`) whose `new` declares one class return
 * (`---@return Flow.FlexNode`) builds instances that carry both that class's fields and
 * the table's colon methods. The table's interface extends the class, and `new` plus
 * every method returning `self` as that class return the interface, so chained calls
 * keep the methods.
 */
function bindConstructedClass(
  table: string,
  functions: LibraryMethod[],
  byName: Map<string, LibraryInterface>,
): void {
  const iface = byName.get(table);
  const ctor = functions.find((f) => f.name === "new");
  const ret = ctor?.returns.length === 1 ? ctor.returns[0] : undefined;
  const constructed = ret?.types.length === 1 ? ret.types[0] : undefined;
  if (!iface || !ctor || !ret || !constructed || constructed === table) return;
  if (!/^[A-Za-z_][\w.]*$/.test(constructed)) return;
  if (!iface.extends) iface.extends = constructed;
  ctor.returns = [{ ...ret, types: [table] }];
  for (const method of iface.methods) {
    const [only] = method.returns;
    if (method.returns.length !== 1 || !only || only.name !== "self") continue;
    if (only.types.length !== 1 || only.types[0] !== constructed) continue;
    method.returns = [{ ...only, types: [table] }];
  }
}

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
 *
 * In a `---@meta` file (its first non-blank line is the tag), a dotted function whose
 * receiver is a local bound to a `---@class` is a method of that class, flagged
 * `noSelf` because callers invoke it with `.` (ads-wrapper's `ads_network.setup`). A
 * meta file never runs, so such a function can only describe the class. Outside meta
 * files the same form stays a module function: a runtime module may annotate its own
 * table as a class (`---@class liveupdater` on `local M`) and still export `M.init`.
 *
 * A dot function on a local table that the returned module re-exports
 * (`FL.Node = Node` beside `return FL`) belongs to that table, not the module: it lands
 * in a `moduleTables` entry. When that table is also a metatable class
 * (`Node.__index = Node`), its interface extends the class `new` returns, and `new`
 * plus each method returning that class as `self` return the interface.
 */
export function parseLualsSource(source: string): LibraryModel {
  const isMeta = /^---@meta(?:\s|$)/.test(source.trimStart());
  const interfaces: LibraryInterface[] = [];
  const byName = new Map<string, LibraryInterface>();
  const aliases: LibraryAlias[] = [];
  const moduleFunctions: LibraryMethod[] = [];
  const moduleAssignments: { table: string; name: string }[] = [];
  let moduleReturn: string | undefined;
  const receiverBinding = new Map<string, string>();
  const functionReceivers = new Map<LibraryMethod, string>();
  const tableAliases: TableAlias[] = [];

  let pending = emptyPending();
  let openClass: LibraryInterface | null = null;
  let lastOpenedClass: string | null = null;
  let moduleObject: string | undefined;
  let lastModuleFunction: LibraryMethod | null = null;
  // A bare `---@alias Name` whose type follows on contiguous `---| <value>` lines.
  let openAlias: LibraryAlias | null = null;
  // The one open function-local `---@class` block (squid's `SquidInstance` inside
  // `Squid.new`). `owner` is the function whose body it sits in, so a returned local
  // bound to it infers the function's return; `pendingType` is a `---@type fun(...)`
  // armed for the next member key.
  let localClass: {
    iface: LibraryInterface;
    localVar: string | null;
    owner: LibraryMethod | null;
    pendingType: string | null;
    returnedSelf: boolean;
  } | null = null;

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
    ...(pending.visibility ? { visibility: pending.visibility } : {}),
    ...(pending.deprecated !== undefined ? { deprecated: pending.deprecated } : {}),
  });

  // Interpret one indented line while a function-local `---@class` block is open. Only
  // the `---@type fun(...)` + next `<key> = ...` member pattern, the backing `local`,
  // and the `return <local>` are recognized; every other indented line stays opaque.
  const handleLocalClassLine = (line: string): void => {
    const lc = localClass;
    if (!lc) return;
    const typeMatch = /^---@type\s+(.+)$/.exec(line);
    if (typeMatch) {
      const { type } = readTypeToken(typeMatch[1] ?? "");
      // A non-`fun` `---@type` also disarms a previously-armed one.
      lc.pendingType = /^fun\s*\(/.test(type) ? type : null;
      return;
    }
    if (lc.pendingType) {
      const keyMatch = /^([A-Za-z_]\w*)\s*=/.exec(line);
      if (keyMatch) {
        const { params, returns } = funToMethodParts(lc.pendingType);
        lc.iface.methods.push({
          name: keyMatch[1] as string,
          brief: "",
          generics: [],
          params,
          returns,
        });
        lc.pendingType = null;
        return;
      }
      // Not the immediately-following member key: the armed type has no member.
      lc.pendingType = null;
    }
    const returnMatch = /^return\s+([A-Za-z_]\w*)\s*$/.exec(line);
    if (returnMatch) {
      if (returnMatch[1] === lc.localVar) lc.returnedSelf = true;
      return;
    }
    const local = LOCAL_ASSIGN.exec(line);
    if (local) {
      // A `---@class` annotates the immediately-following declaration, so only the
      // first local after the class opens is the instance; a later local must not rebind.
      if (lc.localVar === null) lc.localVar = local[1] ?? null;
      return;
    }
  };

  for (const raw of source.split("\n")) {
    if (openAlias) {
      if (raw.startsWith("---|")) {
        const { type } = readTypeToken(raw.slice(4).trim());
        if (type) openAlias.types.push(type);
        continue;
      }
      openAlias = null;
    }
    const indented = /^\s/.test(raw);
    if (indented || raw.length === 0) {
      if (localClass) {
        handleLocalClassLine(raw.trim());
      } else if (indented) {
        // Only an indented `---@class` opens function-local capture; every other
        // indented line (druid-style `---@cast`/`---@type` narrowing) stays opaque.
        const classMatch = /^---@class\s+(.+)$/.exec(raw.trim());
        if (classMatch) {
          const head = parseClassHead(classMatch[1] ?? "");
          const iface = ensureInterface(head.name);
          if (head.extends) iface.extends = head.extends;
          localClass = {
            iface,
            localVar: null,
            owner: lastModuleFunction,
            pendingType: null,
            returnedSelf: false,
          };
        }
      }
      continue;
    }

    // A column-0 line ends any open function-local class (dedent). Apply the inferred
    // return to the owner only when it declared no explicit `---@return`.
    if (localClass) {
      const lc = localClass;
      if (lc.returnedSelf && lc.owner && lc.owner.returns.length === 0) {
        lc.owner.returns.push({
          name: "",
          types: [lc.iface.name],
          doc: "",
          isOptional: false,
          isVararg: false,
        });
      }
      localClass = null;
    }

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
          if (pending.deprecated !== undefined) iface.deprecated = pending.deprecated;
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
          pending.returns.push(...parseReturn(rest));
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
          const alias: LibraryAlias = {
            name,
            types: expr ? [expr] : [],
            doc: pending.doc.join("\n"),
            ...(pending.deprecated !== undefined ? { deprecated: pending.deprecated } : {}),
          };
          aliases.push(alias);
          if (!expr) openAlias = alias;
          pending = emptyPending();
          break;
        }
        case "private":
        case "protected":
        case "package":
        case "local": {
          // A standalone visibility tag on the pending block marks the next function
          // declaration's method/module-function `visibility` (a `@class` or `@alias`
          // that consumes the block first resets it, so it never leaks onto a type).
          pending.visibility = tag as LibraryMethodVisibility;
          break;
        }
        case "deprecated": {
          // `rest` is already trimmed and is `""` for the bare form, which is the
          // only form the fixtures actually ship; the text form is carried too.
          pending.deprecated = rest;
          break;
        }
        default:
          // @cast, @type, @diagnostic, ... — outside the Druid subset; recognized as a
          // tag and skipped, never treated as doc.
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
      const method = methodFromPending(decl.name);
      if (decl.signature) method.params = mergeSignatureParams(method.params, decl.signature);
      const metaClass =
        isMeta && decl.kind === "module" && decl.receiver
          ? receiverBinding.get(decl.receiver)
          : undefined;
      if (decl.kind === "method") {
        const target = decl.receiver ? (receiverBinding.get(decl.receiver) ?? decl.receiver) : "";
        ensureInterface(target).methods.push(method);
      } else if (metaClass) {
        method.noSelf = true;
        ensureInterface(metaClass).methods.push(method);
      } else if (decl.qualified) {
        moduleFunctions.push(method);
        if (decl.receiver) functionReceivers.set(method, decl.receiver);
      }
      // Any function may host a function-local `---@class`; remember the enclosing
      // function so a returned local can infer its return, even a bare helper.
      lastModuleFunction = method;
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
      continue;
    }

    const moduleAssign = MODULE_ASSIGN.exec(raw);
    if (moduleAssign) {
      moduleAssignments.push({
        table: moduleAssign[1] as string,
        name: moduleAssign[2] as string,
      });
      const alias = TABLE_ALIAS.exec(raw);
      if (alias) {
        tableAliases.push({
          table: alias[1] as string,
          name: alias[2] as string,
          value: alias[3] as string,
        });
      }
      continue;
    }

    // A column-0 `return <name>` handing back a local bound to an opened `---@class`
    // marks that class as the module object (its fields become module-level consts).
    // Restricted to squid's constants-table idiom to keep every other library's golden
    // untouched: the returned local is named after its class (`local Squid = {}` /
    // `return Squid`, not a generic `local M` alias), the class carries at least one
    // public field, and it has no methods. A component/instance class (colon methods),
    // an opaque handle (no fields), or an `M`-aliased module table is a type consumers
    // reference or a plain namespace, so it stays a standalone interface.
    // Any bare-identifier return is recorded as `moduleReturn` first, independent of
    // those conditions; a later column-0 return replaces it.
    const returnStmt = /^return\s+([A-Za-z_][\w.]*)\s*$/.exec(raw);
    if (returnStmt) {
      const name = returnStmt[1] as string;
      if (!name.includes(".")) moduleReturn = name;
      const resolvedName = receiverBinding.get(name) ?? (byName.has(name) ? name : undefined);
      const resolved = resolvedName ? byName.get(resolvedName) : undefined;
      if (
        resolved &&
        resolvedName === name &&
        resolved.methods.length === 0 &&
        resolved.fields.some((f) => f.visibility === undefined || f.visibility === "public")
      ) {
        moduleObject = resolved.name;
      }
    }
  }

  const split = moduleReturn
    ? extractModuleTables(moduleReturn, moduleFunctions, functionReceivers, tableAliases, byName)
    : { moduleFunctions, moduleTables: [] };

  return {
    interfaces,
    aliases,
    moduleFunctions: split.moduleFunctions,
    ...(moduleObject ? { moduleObject } : {}),
    ...(moduleAssignments.length > 0 ? { moduleAssignments } : {}),
    ...(moduleReturn ? { moduleReturn } : {}),
    ...(split.moduleTables.length > 0 ? { moduleTables: split.moduleTables } : {}),
  };
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
  let moduleObject: string | undefined;

  for (const model of models) {
    if (!moduleObject && model.moduleObject) moduleObject = model.moduleObject;
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
          ...(iface.deprecated !== undefined ? { deprecated: iface.deprecated } : {}),
        };
        byName.set(iface.name, copy);
        interfaces.push(copy);
        continue;
      }
      existing.fields.push(...iface.fields);
      existing.methods.push(...iface.methods);
      if (!existing.extends && iface.extends) existing.extends = iface.extends;
      if (existing.deprecated === undefined && iface.deprecated !== undefined) {
        existing.deprecated = iface.deprecated;
      }
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

  return { interfaces, aliases, moduleFunctions, ...(moduleObject ? { moduleObject } : {}) };
}

function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
