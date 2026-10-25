/**
 * A reader for the Lua surface a native extension's C++ registers — the module
 * name, function names and constant names its declaration must match.
 *
 * A native extension has no Lua to measure against, but every one registers its
 * whole surface in one place: `luaL_register(L, <name>, <table>)` — or Lua 5.1's
 * `luaL_openlib(L, <name>, <table>, <nup>)`, which with a non-null name is the
 * same call — over a
 * `static const luaL_reg <table>[] = { { "name", fn }, ..., {0, 0} }`, followed by
 * constants set on the module table (`SETCONSTANT(NAME)`, or
 * `lua_setfield(L, -2, "NAME")` after a push). A module name passed by identifier
 * resolves through `#define NAME "..."` and `const char* NAME = "..."`, and through
 * the stringified-macro idiom (`#define A B` chains, and `#define A M(B)` where `M`
 * stringifies — its own body is `#x`, directly or through one forwarding macro — so
 * `A` reads as `B`'s resolved token spelling). Comments are stripped first, so a
 * commented-out entry is never read as registered, and a commented-out `#define`
 * never resolves a module-name identifier.
 *
 * A userdata type registers its methods the same way, with no module name:
 * `luaL_register(L, 0, <table>)` (or `NULL`, and `luaL_openlib` alike) fills the table on top of the
 * stack. Such a call is read as `methods`, with metamethods (`__gc`, `__index`,
 * ...) dropped, and keyed by the nearest table opened before it in the same
 * function: a `luaL_newmetatable(L, <name>)` keys it by that metatable name, and a
 * `lua_newtable` or `lua_createtable` — an object built as a plain table of
 * methods — keys it `<function>()` after the C function that builds it, which no
 * metatable name can collide with. An object a `<Class>::push(lua_State*)` method
 * builds field by field — `lua_pushcfunction` then `lua_setfield` on the outermost
 * table it opens — reads the same way, keyed `<Class>::push()`, with only its
 * cfunction fields as methods. A file that registers the module must make
 * exactly one named call. A file that only fills metatables or push tables is read
 * by `parseNativeMethodTables`, so an extension whose userdata types live in files
 * of their own is measured whole.
 *
 * A call's `luaL_reg <table>[]` definition is looked up inside the function that
 * makes the call first, then at file scope, so two functions that each declare a
 * local table of the same name are read apart.
 *
 * Constants are read from the named call to the end of the function that makes
 * it: the module table does not exist before the call, so a `lua_setfield` there
 * sets a metatable field such as `__index`, and the same
 * `lua_setfield(L, -2, "id")` shape builds result tables in the query functions,
 * where counting it would invent phantom constants. A table opened there with
 * `lua_newtable` or `lua_createtable` nests: a `lua_setfield` with a value pushed
 * since the table opened or since its last `lua_setfield` stores a key in it, and
 * one with nothing pushed closes it under that name, so its keys read as
 * `<table>.<key>` and the table's own name is not a constant. A table that
 * `lua_setmetatable(L, -2)` consumes instead is a metatable: its keys are dropped,
 * and when its `__index` is a cfunction, the `case HASH_<name>:` labels that
 * function switches on read as the fields it serves. A `->push(L)` or
 * `<Class>::push(L)` call pushes one value, and a `lua_setfield` into the module
 * with no push since the call or the field before it throws, since the reader has
 * lost track of what it stores.
 *
 * Like `parse-lua-surface.ts`, this prefers a loud failure to a short surface: a
 * file with no `luaL_register` call, a table it cannot find, a name it cannot
 * resolve, or a nested table left open throws naming the file, since an empty
 * surface would read as full coverage.
 */

export interface NativeRegistration {
  moduleName: string;
  functions: string[];
  /** Userdata methods, keyed by the metatable each nameless `luaL_register` call
   * fills, or `<function>()` for a plain table. Keys and each method list are
   * sorted. */
  methods: Record<string, string[]>;
  constants: string[];
}

interface RegisterCall {
  index: number;
  nameArgument: string;
  tableName: string;
}

interface ScannedSource {
  code: string;
  structure: string;
  names: NameDefines;
  calls: RegisterCall[];
}

interface NameDefines {
  /** `#define NAME "..."` and `const char* NAME = "...";`. */
  strings: Map<string, string>;
  /** Object-like `#define A B` bodies of one identifier each. */
  tokens: Map<string, string>;
  /** Object-like `#define A M(B)` arguments, kept only where `M` stringifies: its
   * function-like body is `#x`, directly or through one forwarding macro. */
  stringified: Map<string, string>;
}

export function parseNativeRegistration(source: string, file: string): NativeRegistration {
  const scanned = scanSource(source);
  if (scanned.calls.length === 0) {
    throw new Error(
      `native registration: ${file} has no luaL_register or luaL_openlib call, so its registered surface cannot be read.`,
    );
  }
  const named = scanned.calls.filter((call) => !isMethodTable(call));
  if (named.length === 0) {
    throw new Error(
      `native registration: ${file} makes only nameless luaL_register/luaL_openlib calls, which fill userdata metatables; with no named call its module cannot be read.`,
    );
  }
  if (named.length > 1) {
    throw new Error(
      `native registration: ${file} makes ${named.length} named luaL_register/luaL_openlib calls; this reader measures one module per file.`,
    );
  }
  const call = named[0] as RegisterCall;

  return {
    moduleName: resolveName(call.nameArgument, scanned.names, "module", file),
    functions: readRegisteredFunctions(scanned.code, scanned.structure, call, file),
    methods: readMethodTables(scanned, file),
    constants: readConstants(scanned.structure, call.index, file),
  };
}

/** The metatables and push tables a file fills and nothing else: the userdata methods
 * of an extension whose module is registered in another file. */
export function parseNativeMethodTables(source: string, file: string): Record<string, string[]> {
  const scanned = scanSource(source);
  if (scanned.calls.some((call) => !isMethodTable(call))) {
    throw new Error(
      `native registration: ${file} makes a named luaL_register/luaL_openlib call, so it registers a module; it belongs in the target's upstreamSource, not among its method sources.`,
    );
  }
  const tables = readMethodTables(scanned, file);
  if (Object.keys(tables).length === 0) {
    throw new Error(
      `native registration: ${file} has no nameless luaL_register/luaL_openlib call and no <Class>::push table, so it fills no method table to read.`,
    );
  }
  return tables;
}

const CALL_SHAPES = [
  /\bluaL_register\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*,\s*(\w+)\s*\)/g,
  /\bluaL_openlib\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*,\s*(\w+)\s*,\s*\w+\s*\)/g,
];

function scanSource(source: string): ScannedSource {
  const live = stripComments(source);
  const names = readNameDefines(live);
  const code = blankPreprocessorLines(live);
  const structure = maskStringContents(code);

  const calls: RegisterCall[] = CALL_SHAPES.flatMap((shape) => [...structure.matchAll(shape)])
    .map((call) => {
      const index = call.index ?? 0;
      const name = call[1] as string;
      const nameStart = index + call[0].indexOf(name);
      return {
        index,
        nameArgument: code.slice(nameStart, nameStart + name.length),
        tableName: call[2] as string,
      };
    })
    .sort((a, b) => a.index - b.index);
  return { code, structure, names, calls };
}

function isMethodTable(call: RegisterCall): boolean {
  return call.nameArgument === "0" || call.nameArgument === "NULL";
}

function readMethodTables(scanned: ScannedSource, file: string): Record<string, string[]> {
  const { code, structure, names } = scanned;
  const byMetatable = new Map<string, Set<string>>();
  const fill = (metatable: string, names: string[]) => {
    const methods = byMetatable.get(metatable) ?? new Set<string>();
    for (const name of names) {
      if (!name.startsWith("__")) methods.add(name);
    }
    byMetatable.set(metatable, methods);
  };
  for (const call of scanned.calls.filter(isMethodTable)) {
    fill(
      methodTableKey(code, structure, names, call, file),
      readRegisteredFunctions(code, structure, call, file),
    );
  }
  for (const [table, fields] of readPushTables(structure, file)) fill(table, fields);
  return Object.fromEntries(
    [...byMetatable.keys()]
      .sort()
      .map((metatable) => [metatable, [...(byMetatable.get(metatable) as Set<string>)].sort()]),
  );
}

const PUSH_DEFINITIONS = /\b(\w+)::push\s*\(\s*lua_State\s*\*\s*\w+\s*\)\s*(?:const\s*)?\{/g;

/** What moves a push table's walk: a table opening, a cfunction push, a `lua_setfield`
 * into the table below the top, a `lua_setmetatable` consuming the top, or any other
 * push. */
const PUSH_TABLE_EVENTS =
  /\b(?:(lua_newtable|lua_createtable)\s*\(|lua_pushcfunction\s*\(\s*\w+\s*,\s*(\w+)\s*\)|lua_setfield\s*\(\s*\w+\s*,\s*-2\s*,\s*"(\w+)"\s*\)|(lua_setmetatable)\s*\(|(?:lua_push\w+|dmScript::Push\w+)\s*\()/g;

/** The objects `<Class>::push(lua_State*)` methods build as plain tables: the fields
 * holding a cfunction on the outermost table each opens. A table opened inside it is
 * closed into a field or consumed by `lua_setmetatable`, so neither its keys nor a
 * metatable's `__index` read as methods. A push body that opens no table builds no
 * object here and yields no entry. */
function readPushTables(structure: string, file: string): [table: string, fields: string[]][] {
  const tables: [string, string[]][] = [];
  for (const definition of structure.matchAll(PUSH_DEFINITIONS)) {
    const open = (definition.index ?? 0) + definition[0].length - 1;
    const body = structure.slice(open + 1, matchingBrace(structure, open, file));
    const fields: string[] = [];
    let depth = 0;
    let opened = false;
    let pushed: "cfunction" | "value" | undefined;
    for (const [, opener, cfunction, field, setMetatable] of body.matchAll(PUSH_TABLE_EVENTS)) {
      if (opener !== undefined) {
        depth++;
        opened = true;
      } else if (cfunction !== undefined) {
        pushed = "cfunction";
        continue;
      } else if (field !== undefined) {
        if (pushed === undefined) depth--;
        else if (depth === 1 && pushed === "cfunction") fields.push(field);
      } else if (setMetatable !== undefined) {
        depth--;
      } else {
        pushed = "value";
        continue;
      }
      pushed = undefined;
    }
    if (opened) tables.push([`${definition[1]}::push()`, fields]);
  }
  return tables;
}

const TABLE_OPENERS =
  /\b(?:luaL_newmetatable\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*\)|(?:lua_newtable|lua_createtable)\s*\()/g;

function methodTableKey(
  code: string,
  structure: string,
  names: NameDefines,
  call: RegisterCall,
  file: string,
): string {
  const open = enclosingOpenBrace(structure, call.index);
  const before =
    open === -1 ? undefined : [...structure.slice(open, call.index).matchAll(TABLE_OPENERS)].at(-1);
  if (before === undefined) {
    throw new Error(
      `native registration: ${file} fills the table \`${call.tableName}\` with a nameless register call, but no luaL_newmetatable, lua_newtable or lua_createtable before it in the same function opens the table it fills.`,
    );
  }
  const name = before[1];
  if (name === undefined) {
    return `${enclosingFunctionName(structure, open, file)}()`;
  }
  const nameStart = open + (before.index ?? 0) + before[0].indexOf(name);
  return resolveName(code.slice(nameStart, nameStart + name.length), names, "metatable", file);
}

/** The name of the function whose body brace is `open`, read from its signature:
 * the identifier before the parameter list that the `)` ahead of the brace closes. */
function enclosingFunctionName(structure: string, open: number, file: string): string {
  const close = structure.lastIndexOf(")", open);
  let depth = 0;
  let paren = close;
  for (; paren >= 0; paren--) {
    if (structure[paren] === ")") depth++;
    else if (structure[paren] === "(" && --depth === 0) break;
  }
  const name = /(\w+(?:::\w+)*)\s*$/.exec(structure.slice(Math.max(0, paren - 256), paren));
  if (paren < 0 || name === null) {
    throw new Error(
      `native registration: ${file} fills a plain table in a function at offset ${open} whose name cannot be read from its signature.`,
    );
  }
  return name[1] as string;
}

function resolveName(
  argument: string,
  names: NameDefines,
  role: "module" | "metatable",
  file: string,
): string {
  if (argument.startsWith('"')) {
    return argument.slice(1, -1);
  }
  const seen = new Set<string>();
  let token = argument;
  while (!seen.has(token)) {
    seen.add(token);
    const direct = names.strings.get(token);
    if (direct !== undefined) return direct;
    const stringifiedToken = names.stringified.get(token);
    if (stringifiedToken !== undefined) {
      return stringifiedSpelling(stringifiedToken, names, argument, role, file);
    }
    const next = names.tokens.get(token);
    if (next === undefined) break;
    token = next;
  }
  throw new Error(
    `native registration: ${file} passes \`${argument}\` as the ${role} name, but defines no string for it with #define or a const char*.`,
  );
}

/** The spelling a stringify macro produces: the token itself, once `#define A B`
 * chains are followed. The stringified token must be #define'd — stringifying an
 * undefined token is read as a missing name, not as a module literally named after
 * the macro argument. */
function stringifiedSpelling(
  token: string,
  names: NameDefines,
  argument: string,
  role: "module" | "metatable",
  file: string,
): string {
  if (!names.tokens.has(token)) {
    throw new Error(
      `native registration: ${file} passes \`${argument}\` as the ${role} name, which stringifies \`${token}\`, but no #define gives that token a value.`,
    );
  }
  const seen = new Set<string>();
  let current = token;
  while (names.tokens.has(current) && !seen.has(current)) {
    seen.add(current);
    current = names.tokens.get(current) as string;
  }
  return current;
}

function readRegisteredFunctions(
  code: string,
  structure: string,
  call: RegisterCall,
  file: string,
): string[] {
  const { tableName } = call;
  const declarations = [
    ...structure.matchAll(
      new RegExp(`\\bluaL_[Rr]eg\\s+${tableName}\\s*\\[\\s*\\]\\s*=\\s*\\{`, "g"),
    ),
  ].map((match) => {
    const index = match.index ?? 0;
    return { match, index, scope: enclosingOpenBrace(structure, index) };
  });
  const callScope = enclosingOpenBrace(structure, call.index);
  const declaration =
    declarations
      .filter(({ index, scope }) => scope !== -1 && scope === callScope && index < call.index)
      .at(-1)?.match ?? declarations.find(({ scope }) => scope === -1)?.match;
  if (declaration === undefined) {
    throw new Error(
      `native registration: ${file} registers the table \`${tableName}\`, but no \`luaL_reg ${tableName}[] = { ... }\` definition was found in the function that registers it or at file scope.`,
    );
  }
  const open = declaration.index + declaration[0].length - 1;
  const close = matchingBrace(structure, open, file);
  const body = code.slice(open + 1, close);
  return [...body.matchAll(/\{\s*"([^"]+)"\s*,/g)].map((entry) => entry[1] as string).sort();
}

function readConstants(structure: string, callIndex: number, file: string): string[] {
  const open = enclosingOpenBrace(structure, callIndex);
  if (open === -1) {
    throw new Error(
      `native registration: ${file} calls luaL_register outside any function body, so its constants cannot be scoped.`,
    );
  }
  const body = structure.slice(callIndex, matchingBrace(structure, open, file));
  const constants = new Set<string>();
  const tables: OpenTable[] = [];
  let pushed = false;
  let cfunction: string | undefined;
  const store = (key: string) => {
    const table = tables.at(-1);
    if (table === undefined) constants.add(key);
    else table.keys.push(key);
  };
  for (const [, opened, setConstant, pushedFunction, field, setMetatable] of body.matchAll(
    CONSTANT_EVENTS,
  )) {
    if (opened !== undefined) {
      tables.push({ keys: [] });
    } else if (setConstant !== undefined) {
      store(setConstant);
    } else if (pushedFunction !== undefined) {
      pushed = true;
      cfunction = pushedFunction;
      continue;
    } else if (setMetatable !== undefined) {
      for (const key of metatableFields(structure, tables.pop(), file)) store(key);
    } else if (field === undefined) {
      pushed = true;
      cfunction = undefined;
      continue;
    } else if (pushed) {
      const table = tables.at(-1);
      if (table !== undefined && field === "__index") table.index = cfunction ?? null;
      store(field);
    } else if (tables.length === 0) {
      throw new Error(
        `native registration: ${file} sets "${field}" on the module with lua_setfield, but pushes no value this reader recognizes since the register call or the field before it, so what it stores cannot be read.`,
      );
    } else {
      for (const key of (tables.pop() as OpenTable).keys) store(`${field}.${key}`);
    }
    pushed = false;
    cfunction = undefined;
  }
  if (tables.length > 0) {
    throw new Error(
      `native registration: ${file} opens ${tables.length} table(s) after its luaL_register call that no lua_setfield closes, so their keys cannot be named.`,
    );
  }
  return [...constants].sort();
}

/** A table the constant walk has opened and not yet closed. `index` is the cfunction
 * stored under `__index`, or `null` when `__index` holds some other value. */
interface OpenTable {
  keys: string[];
  index?: string | null;
}

/** The fields a metatable serves once `lua_setmetatable` consumes it: none of its own
 * keys, and the `case HASH_<name>:` labels its `__index` cfunction switches on. A
 * metatable with no `__index` serves no fields; one whose `__index` cannot be read
 * throws rather than reading as serving none. */
function metatableFields(structure: string, table: OpenTable | undefined, file: string): string[] {
  if (table === undefined) {
    throw new Error(
      `native registration: ${file} calls lua_setmetatable after its luaL_register call with no table opened for it, so the metatable it sets cannot be read.`,
    );
  }
  if (table.index === undefined) return [];
  if (table.index === null) {
    throw new Error(
      `native registration: ${file} sets a metatable whose __index is not a cfunction, so the fields it serves cannot be read.`,
    );
  }
  const definitions = [
    ...structure.matchAll(
      new RegExp(`\\b${table.index}\\s*\\(\\s*lua_State\\s*\\*\\s*\\w+\\s*\\)\\s*\\{`, "g"),
    ),
  ];
  const definition = definitions[0];
  if (definitions.length !== 1 || definition === undefined) {
    throw new Error(
      `native registration: ${file} sets a metatable whose __index is \`${table.index}\`, which it defines ${definitions.length} times, so the fields it serves cannot be read.`,
    );
  }
  const open = (definition.index ?? 0) + definition[0].length - 1;
  const labels = [
    ...structure
      .slice(open, matchingBrace(structure, open, file))
      .matchAll(/\bcase\s+HASH_(\w+)\s*:/g),
  ].map((label) => label[1] as string);
  if (labels.length === 0) {
    throw new Error(
      `native registration: ${file} sets a metatable whose __index \`${table.index}\` switches on no case HASH_<name>: label, so the fields it serves cannot be read.`,
    );
  }
  return labels;
}

/** Everything that moves the constant walk: a table opening, a `SETCONSTANT` (which
 * pushes and sets at once), a cfunction push, a `lua_setfield` into the table below
 * the top, a `lua_setmetatable` consuming the top, or any other push — a custom
 * `->push(L)` or `<Class>::push(L)` among them. */
const CONSTANT_EVENTS =
  /\b(?:(lua_newtable|lua_createtable)\s*\(|SETCONSTANT\s*\(\s*(\w+)\s*\)|lua_pushcfunction\s*\(\s*\w+\s*,\s*(\w+)\s*\)|lua_setfield\s*\(\s*\w+\s*,\s*-2\s*,\s*"(\w+)"\s*\)|(lua_setmetatable)\s*\(\s*\w+\s*,\s*-2\s*\)|(?:lua_push\w+|dmScript::Push\w+)\s*\()|(?:->|::)push\s*\(\s*\w+\s*\)/g;

/** Names a call can pass by identifier: string defines and `const char*` constants,
 * plus the token defines and stringify macros `resolveName` follows. An object-like
 * body starts after whitespace; a `(` straight after the name makes the define
 * function-like, which is how the preprocessor itself tells them apart. */
function readNameDefines(source: string): NameDefines {
  const strings = new Map<string, string>();
  for (const match of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+"([^"]*)"/gm)) {
    strings.set(match[1] as string, match[2] as string);
  }
  for (const match of source.matchAll(
    /\bconst\s+char\s*\*\s*(?:const\s+)?(\w+)\s*=\s*"([^"]*)"\s*;/g,
  )) {
    strings.set(match[1] as string, match[2] as string);
  }

  const tokens = new Map<string, string>();
  for (const match of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\w+)[ \t]*\r?$/gm)) {
    tokens.set(match[1] as string, match[2] as string);
  }

  const stringifiers = new Set<string>();
  const forwarders = new Map<string, string>();
  for (const match of source.matchAll(
    /^[ \t]*#[ \t]*define[ \t]+(\w+)\(\s*(\w+)\s*\)[ \t]+(.+?)[ \t]*\r?$/gm,
  )) {
    const [, name, param, body] = match as unknown as [string, string, string, string];
    if (body === `#${param}`) {
      stringifiers.add(name);
    } else {
      const forward = new RegExp(`^(\\w+)\\(\\s*${param}\\s*\\)$`).exec(body);
      if (forward !== null) forwarders.set(name, forward[1] as string);
    }
  }
  const stringifies = (macro: string): boolean =>
    stringifiers.has(macro) || stringifiers.has(forwarders.get(macro) ?? "");

  const stringified = new Map<string, string>();
  for (const match of source.matchAll(
    /^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(\w+)\s*\(\s*(\w+)\s*\)[ \t]*\r?$/gm,
  )) {
    const [, name, macro, argument] = match as unknown as [string, string, string, string];
    if (stringifies(macro)) stringified.set(name, argument);
  }
  return { strings, tokens, stringified };
}

/** Replaces `//` and `/* *\/` comments with spaces, leaving string and character
 * literals intact and every newline in place. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '"' || ch === "'") {
      const end = literalEnd(source, i);
      out += source.slice(i, end);
      i = end;
    } else if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i++;
      }
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Blanks every preprocessor directive, continuation lines included, so a
 * `#define SETCONSTANT(name)` body is not read as a use of the macro. */
function blankPreprocessorLines(code: string): string {
  const lines = code.split("\n");
  let continuing = false;
  return lines
    .map((line) => {
      const directive = continuing || /^[ \t]*#/.test(line);
      continuing = directive && line.trimEnd().endsWith("\\");
      return directive ? " ".repeat(line.length) : line;
    })
    .join("\n");
}

/** Replaces braces and parentheses inside string and character literals with
 * spaces, so they do not disturb structural scanning. Offsets are preserved. */
function maskStringContents(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    if (code[i] === '"' || code[i] === "'") {
      const end = literalEnd(code, i);
      out += code.slice(i, end).replace(/[{}()]/g, " ");
      i = end;
    } else {
      out += code[i];
      i++;
    }
  }
  return out;
}

function literalEnd(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length && text[i] !== quote && text[i] !== "\n") {
    i += text[i] === "\\" ? 2 : 1;
  }
  return Math.min(i + 1, text.length);
}

function matchingBrace(structure: string, open: number, file: string): number {
  let depth = 0;
  for (let i = open; i < structure.length; i++) {
    if (structure[i] === "{") depth++;
    else if (structure[i] === "}" && --depth === 0) return i;
  }
  throw new Error(`native registration: ${file} has an unbalanced brace at offset ${open}.`);
}

/** The body brace of the function that contains `index`: the outermost enclosing
 * `{` that follows a `)`, so a nested `if` block is widened to the whole function
 * and a wrapping `namespace x {` is not mistaken for it. */
function enclosingOpenBrace(structure: string, index: number): number {
  let found = -1;
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    if (structure[i] === "}") depth++;
    else if (structure[i] === "{") {
      if (depth > 0) {
        depth--;
      } else if (/\)\s*(?:const\s*)?$/.test(structure.slice(Math.max(0, i - 64), i))) {
        found = i;
      }
    }
  }
  return found;
}
