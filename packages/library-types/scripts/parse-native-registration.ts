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
 * Constants are read only inside the function that makes the `luaL_register`
 * call: the same `lua_setfield(L, -2, "id")` shape builds result tables in the
 * query functions, and counting those would invent phantom constants.
 *
 * Like `parse-lua-surface.ts`, this prefers a loud failure to a short surface: a
 * file with no `luaL_register` call, a table it cannot find, or a name it cannot
 * resolve throws naming the file, since an empty surface would read as full
 * coverage.
 */

export interface NativeRegistration {
  moduleName: string;
  functions: string[];
  constants: string[];
}

export function parseNativeRegistration(source: string, file: string): NativeRegistration {
  const live = stripComments(source);
  const defines = readStringDefines(live);
  const code = blankPreprocessorLines(live);
  const structure = maskStringContents(code);

  const calls = [
    ...structure.matchAll(/\bluaL_register\s*\(\s*\w+\s*,\s*("[^"]*"|\w+)\s*,\s*(\w+)\s*\)/g),
  ];
  if (calls.length === 0) {
    throw new Error(
      `native registration: ${file} has no luaL_register call, so its registered surface cannot be read.`,
    );
  }
  if (calls.length > 1) {
    throw new Error(
      `native registration: ${file} makes ${calls.length} luaL_register calls; this reader measures one module per file.`,
    );
  }
  const call = calls[0] as RegExpExecArray;
  const callIndex = call.index ?? 0;
  const name = call[1] as string;
  const nameStart = callIndex + call[0].indexOf(name);
  const nameArgument = code.slice(nameStart, nameStart + name.length);
  const tableName = call[2] as string;

  return {
    moduleName: resolveModuleName(nameArgument, defines, file),
    functions: readRegisteredFunctions(code, structure, tableName, file),
    constants: readConstants(code, structure, callIndex, file),
  };
}

function resolveModuleName(argument: string, defines: Map<string, string>, file: string): string {
  if (argument.startsWith('"')) {
    return argument.slice(1, -1);
  }
  const defined = defines.get(argument);
  if (defined === undefined) {
    throw new Error(
      `native registration: ${file} passes \`${argument}\` as the module name, but defines no string for it with #define.`,
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

function readConstants(code: string, structure: string, callIndex: number, file: string): string[] {
  const open = enclosingOpenBrace(structure, callIndex);
  if (open === -1) {
    throw new Error(
      `native registration: ${file} calls luaL_register outside any function body, so its constants cannot be scoped.`,
    );
  }
  const body = code.slice(open + 1, matchingBrace(structure, open, file));
  const names = [
    ...[...body.matchAll(/\bSETCONSTANT\s*\(\s*(\w+)\s*\)/g)].map((match) => match[1] as string),
    ...[...body.matchAll(/\blua_setfield\s*\(\s*\w+\s*,\s*-2\s*,\s*"(\w+)"\s*\)/g)].map(
      (match) => match[1] as string,
    ),
  ];
  return [...new Set(names)].sort();
}

function readStringDefines(source: string): Map<string, string> {
  const defines = new Map<string, string>();
  for (const match of source.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+"([^"]*)"/gm)) {
    defines.set(match[1] as string, match[2] as string);
  }
  return defines;
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
