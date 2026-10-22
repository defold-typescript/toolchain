/**
 * A reader for the Lua surface a native extension's C++ registers — the module
 * name, function names and constant names its declaration must match.
 *
 * A native extension has no Lua to measure against, but every one registers its
 * whole surface in one place: `luaL_register(L, <name>, <table>)` over a
 * `static const luaL_reg <table>[] = { { "name", fn }, ..., {0, 0} }`, followed by
 * constants set on the module table (`SETCONSTANT(NAME)`, or
 * `lua_setfield(L, -2, "NAME")` after a push). Comments are stripped first, so a
 * commented-out entry is never read as registered, and a commented-out `#define`
 * never resolves a module-name identifier.
 *
 * A userdata type registers its methods the same way, with no module name:
 * `luaL_register(L, 0, <table>)` (or `NULL`) fills the metatable on top of the
 * stack. Such a call is read as `methods`, keyed by the metatable the nearest
 * `luaL_newmetatable(L, <name>)` before it in the same function names, with
 * metamethods (`__gc`, `__index`, ...) dropped. A file that registers the module
 * must make exactly one named call. A file that only fills metatables is read by
 * `parseNativeMethodTables`, so an extension whose userdata types live in files
 * of their own is measured whole.
 *
 * Constants are read from the named call to the end of the function that makes
 * it: the module table does not exist before the call, so a `lua_setfield` there
 * sets a metatable field such as `__index`, and the same
 * `lua_setfield(L, -2, "id")` shape builds result tables in the query functions,
 * where counting it would invent phantom constants. A table opened there with
 * `lua_newtable` or `lua_createtable` nests: a `lua_setfield` with a value pushed
 * since the table opened or since its last `lua_setfield` stores a key in it, and
 * one with nothing pushed closes it under that name, so its keys read as
 * `<table>.<key>` and the table's own name is not a constant.
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
   * fills. Keys and each method list are sorted. */
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
  strings: Map<string, string>;
  calls: RegisterCall[];
}

export function parseNativeRegistration(source: string, file: string): NativeRegistration {
  const scanned = scanSource(source, file);
  const named = scanned.calls.filter((call) => !isMethodTable(call));
  if (named.length === 0) {
    throw new Error(
      `native registration: ${file} makes only nameless luaL_register calls, which fill userdata metatables; with no named call its module cannot be read.`,
    );
  }
  if (named.length > 1) {
    throw new Error(
      `native registration: ${file} makes ${named.length} named luaL_register calls; this reader measures one module per file.`,
    );
  }
  const call = named[0] as RegisterCall;

  return {
    moduleName: resolveName(call.nameArgument, scanned.strings, "module", file),
    functions: readRegisteredFunctions(scanned.code, scanned.structure, call.tableName, file),
    methods: readMethodTables(scanned, file),
    constants: readConstants(scanned.structure, call.index, file),
  };
}

/** The metatables a file fills and nothing else: the userdata methods of an extension
 * whose module is registered in another file. */
export function parseNativeMethodTables(source: string, file: string): Record<string, string[]> {
  const scanned = scanSource(source, file);
  if (scanned.calls.some((call) => !isMethodTable(call))) {
    throw new Error(
      `native registration: ${file} makes a named luaL_register call, so it registers a module; it belongs in the target's upstreamSource, not among its method sources.`,
    );
  }
  return readMethodTables(scanned, file);
}

function scanSource(source: string, file: string): ScannedSource {
  const live = stripComments(source);
  const strings = readStringNames(live);
  const code = blankPreprocessorLines(live);
  const structure = maskStringContents(code);

  const calls: RegisterCall[] = [
    ...structure.matchAll(/\bluaL_register\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*,\s*(\w+)\s*\)/g),
  ].map((call) => {
    const index = call.index ?? 0;
    const name = call[1] as string;
    const nameStart = index + call[0].indexOf(name);
    return {
      index,
      nameArgument: code.slice(nameStart, nameStart + name.length),
      tableName: call[2] as string,
    };
  });
  if (calls.length === 0) {
    throw new Error(
      `native registration: ${file} has no luaL_register call, so its registered surface cannot be read.`,
    );
  }
  return { code, structure, strings, calls };
}

function isMethodTable(call: RegisterCall): boolean {
  return call.nameArgument === "0" || call.nameArgument === "NULL";
}

function readMethodTables(scanned: ScannedSource, file: string): Record<string, string[]> {
  const { code, structure, strings } = scanned;
  const byMetatable = new Map<string, Set<string>>();
  for (const call of scanned.calls.filter(isMethodTable)) {
    const metatable = resolveName(
      nearestMetatableArgument(code, structure, call, file),
      strings,
      "metatable",
      file,
    );
    const names = byMetatable.get(metatable) ?? new Set<string>();
    for (const name of readRegisteredFunctions(code, structure, call.tableName, file)) {
      if (!name.startsWith("__")) names.add(name);
    }
    byMetatable.set(metatable, names);
  }
  return Object.fromEntries(
    [...byMetatable.keys()]
      .sort()
      .map((metatable) => [metatable, [...(byMetatable.get(metatable) as Set<string>)].sort()]),
  );
}

function nearestMetatableArgument(
  code: string,
  structure: string,
  call: RegisterCall,
  file: string,
): string {
  const open = enclosingOpenBrace(structure, call.index);
  const before =
    open === -1
      ? undefined
      : [
          ...structure
            .slice(open, call.index)
            .matchAll(/\bluaL_newmetatable\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*\)/g),
        ].at(-1);
  if (before === undefined) {
    throw new Error(
      `native registration: ${file} fills the table \`${call.tableName}\` with a nameless luaL_register call, but no luaL_newmetatable before it in the same function names the metatable it fills.`,
    );
  }
  const name = before[1] as string;
  const nameStart = open + (before.index ?? 0) + before[0].indexOf(name);
  return code.slice(nameStart, nameStart + name.length);
}

function resolveName(
  argument: string,
  strings: Map<string, string>,
  role: "module" | "metatable",
  file: string,
): string {
  if (argument.startsWith('"')) {
    return argument.slice(1, -1);
  }
  const defined = strings.get(argument);
  if (defined === undefined) {
    throw new Error(
      `native registration: ${file} passes \`${argument}\` as the ${role} name, but defines no string for it with #define or a const char*.`,
    );
  }
  return defined;
}

function readRegisteredFunctions(
  code: string,
  structure: string,
  tableName: string,
  file: string,
): string[] {
  const declaration = new RegExp(`\\bluaL_[Rr]eg\\s+${tableName}\\s*\\[\\s*\\]\\s*=\\s*\\{`).exec(
    structure,
  );
  if (declaration === null) {
    throw new Error(
      `native registration: ${file} registers the table \`${tableName}\`, but no \`luaL_reg ${tableName}[] = { ... }\` definition was found.`,
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
  const tables: string[][] = [];
  let pushed = false;
  const store = (key: string) => {
    const table = tables.at(-1);
    if (table === undefined) constants.add(key);
    else table.push(key);
  };
  for (const [, opened, setConstant, field] of body.matchAll(CONSTANT_EVENTS)) {
    if (opened !== undefined) {
      tables.push([]);
    } else if (setConstant !== undefined) {
      store(setConstant);
    } else if (field === undefined) {
      pushed = true;
      continue;
    } else if (pushed || tables.length === 0) {
      store(field);
    } else {
      for (const key of tables.pop() as string[]) store(`${field}.${key}`);
    }
    pushed = false;
  }
  if (tables.length > 0) {
    throw new Error(
      `native registration: ${file} opens ${tables.length} table(s) after its luaL_register call that no lua_setfield closes, so their keys cannot be named.`,
    );
  }
  return [...constants].sort();
}

/** Everything that moves the constant walk: a table opening, a `SETCONSTANT` (which
 * pushes and sets at once), a `lua_setfield` into the table below the top, or any
 * push. */
const CONSTANT_EVENTS =
  /\b(?:(lua_newtable|lua_createtable)\s*\(|SETCONSTANT\s*\(\s*(\w+)\s*\)|lua_setfield\s*\(\s*\w+\s*,\s*-2\s*,\s*"(\w+)"\s*\)|(?:lua_push\w+|dmScript::Push\w+)\s*\()/g;

/** String names a call can pass by identifier: `#define NAME "..."` and
 * `const char* NAME = "...";`. */
function readStringNames(source: string): Map<string, string> {
  const strings = new Map<string, string>();
  for (const match of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+"([^"]*)"/gm)) {
    strings.set(match[1] as string, match[2] as string);
  }
  for (const match of source.matchAll(
    /\bconst\s+char\s*\*\s*(?:const\s+)?(\w+)\s*=\s*"([^"]*)"\s*;/g,
  )) {
    strings.set(match[1] as string, match[2] as string);
  }
  return strings;
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
