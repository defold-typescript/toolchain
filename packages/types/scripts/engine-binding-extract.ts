import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { type ApiTarget, loadApiTargets } from "./regen";
import { bindingsDir } from "./sync-engine-bindings";

export type LuaKind =
  | "number"
  | "string"
  | "boolean"
  | "hash"
  | "url"
  | "vector3"
  | "vector4"
  | "quat"
  | "matrix4"
  | "vector"
  | "table"
  | "function"
  | "buffer"
  | "userdata"
  | "nil";

export interface BindingSlot {
  readonly index: number;
  readonly kinds: LuaKind[];
  readonly optional: boolean;
  readonly fields: string[];
  readonly manual?: string;
  // The binding subtracts 1 from the checked number before using it: the slot
  // is a 1-based position whatever its name or prose says.
  readonly minusOne?: true;
  // Every read returns a value for any argument (`lua_toboolean`,
  // `lua_tonumber`, `dmScript::ToVector3`) instead of raising: no kind is wrong.
  readonly unchecked?: true;
}

export interface BindingReturns {
  readonly count: number | "dynamic";
  readonly kinds: LuaKind[][];
  // Why a position with no kinds could not be resolved, 1-based like
  // `BindingSlot.index`; absent when every position has kinds.
  readonly manual?: { readonly position: number; readonly reason: string }[];
}

export interface BindingFunction {
  readonly namespace: string;
  readonly name: string;
  readonly cFunction: string;
  readonly file: string;
  readonly minArgs: number;
  readonly maxArgs: number | "variadic";
  // The exact argument counts the body branches on (`lua_gettop(L) == n`),
  // or absent when it does not branch on the count.
  readonly arities?: number[];
  readonly slots: BindingSlot[];
  readonly returns: BindingReturns;
  readonly manual: string[];
}

export interface BindingExtraction {
  readonly functions: BindingFunction[];
  readonly constants: Map<string, string[]>;
  // The binding files whose `lua_setfield` registers each constant, keyed
  // `<namespace>.<NAME>`.
  readonly constantFiles: Map<string, string[]>;
  readonly unresolved: string[];
}

// Engine namespaces with no C++ binding in the vendored set.
export const UNBOUND_NAMESPACES: ReadonlyMap<string, string> = new Map([
  ["socket", "LuaSocket is a vendored C library outside engine/*/src, not a C++ binding file"],
]);

// ---------------------------------------------------------------------------
// Lexing and preprocessing

type TokenKind = "ident" | "number" | "string" | "char" | "punct";

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  // Decoded contents for string tokens.
  readonly value?: string;
}

function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        if (source[i] === "\\" && source[i + 1] === "\n") i++;
        i++;
      }
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") j++;
        j++;
      }
      out += source.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const PUNCTUATORS = [
  "...",
  "<<=",
  ">>=",
  "->",
  "::",
  "##",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "|=",
  "&=",
  "^=",
];

function decodeString(body: string): string {
  return body.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch === "t" ? "\t" : ch));
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(line.slice(i)) as RegExpExecArray;
      tokens.push({ kind: "ident", text: m[0] });
      i += m[0].length;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(line[i + 1] ?? ""))) {
      const m = /^(0[xX][0-9a-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)[uUlLfF]*/.exec(
        line.slice(i),
      ) as RegExpExecArray;
      tokens.push({ kind: "number", text: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) {
        if (line[j] === "\\") j++;
        j++;
      }
      const text = line.slice(i, j + 1);
      tokens.push(
        c === '"'
          ? { kind: "string", text, value: decodeString(line.slice(i + 1, j)) }
          : { kind: "char", text },
      );
      i = j + 1;
      continue;
    }
    const punct = PUNCTUATORS.find((p) => line.startsWith(p, i)) ?? c;
    tokens.push({ kind: "punct", text: punct });
    i += punct.length;
  }
  return tokens;
}

interface Macro {
  readonly params: string[] | null;
  readonly body: Token[];
}

interface DirectiveToken {
  readonly directive: string;
}

// Collects `#define`/`#undef` in source order and keeps only the first branch of
// every `#if` group (the `#else` branch of `#if 0`), so both arms of a platform
// switch never land in one brace-matched body.
function readLines(source: string): Array<Token[] | DirectiveToken> {
  const joined = stripComments(source).replace(/\\\r?\n/g, " ");
  const out: Array<Token[] | DirectiveToken> = [];
  const stack: Array<{ active: boolean; taken: boolean }> = [];
  const active = () => stack.every((frame) => frame.active);
  for (const raw of joined.split("\n")) {
    const line = raw.trim();
    const directive = /^#\s*(\w+)\s*(.*)$/.exec(line);
    if (directive) {
      const [, name, rest] = directive as unknown as [string, string, string];
      if (name === "if" || name === "ifdef" || name === "ifndef") {
        const zero = name === "if" && rest.trim() === "0";
        stack.push({ active: !zero, taken: !zero });
      } else if (name === "elif" || name === "else") {
        const frame = stack[stack.length - 1];
        if (frame) {
          frame.active = !frame.taken;
          frame.taken = true;
        }
      } else if (name === "endif") {
        stack.pop();
      } else if (active() && (name === "define" || name === "undef")) {
        out.push({ directive: `${name} ${rest}` });
      }
      continue;
    }
    if (active() && line.length > 0) out.push(tokenize(line));
  }
  return out;
}

function parseDefine(text: string): [string, Macro] | null {
  const m = /^(\w+)(\(([^)]*)\))?\s*(.*)$/.exec(text);
  if (!m) return null;
  const [, name, hasParams, params, body] = m as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  return [
    name,
    {
      params: hasParams
        ? params
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
        : null,
      body: tokenize(body),
    },
  ];
}

function collectArgs(tokens: Token[], open: number): { args: Token[][]; end: number } | null {
  if (tokens[open]?.text !== "(") return null;
  const args: Token[][] = [[]];
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.text === "(") {
      depth++;
      if (depth === 1) continue;
    } else if (t.text === ")") {
      depth--;
      if (depth === 0)
        return { args: args.length === 1 && args[0]?.length === 0 ? [] : args, end: i };
    } else if (t.text === "," && depth === 1) {
      args.push([]);
      continue;
    }
    (args[args.length - 1] as Token[]).push(t);
  }
  return null;
}

function paste(left: Token, right: Token): Token {
  const text = left.text + right.text;
  return tokenize(text)[0] ?? { kind: "ident", text };
}

function expand(tokens: Token[], macros: Map<string, Macro>, hide: ReadonlySet<string>): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    const macro = t.kind === "ident" && !hide.has(t.text) ? macros.get(t.text) : undefined;
    if (!macro) {
      out.push(t);
      continue;
    }
    const inner = new Set(hide).add(t.text);
    if (macro.params === null) {
      out.push(...expand(macro.body, macros, inner));
      continue;
    }
    const call = collectArgs(tokens, i + 1);
    if (!call) {
      out.push(t);
      continue;
    }
    const params = macro.params;
    const argOf = (name: string): Token[] | undefined => {
      const index = params.indexOf(name);
      return index === -1 ? undefined : (call.args[index] ?? []);
    };
    const substituted: Token[] = [];
    const body = macro.body;
    for (let j = 0; j < body.length; j++) {
      const b = body[j] as Token;
      if (b.text === "#" && body[j + 1]?.kind === "ident" && argOf((body[j + 1] as Token).text)) {
        const arg = argOf((body[j + 1] as Token).text) as Token[];
        const value = arg.map((a) => a.text).join("");
        substituted.push({ kind: "string", text: JSON.stringify(value), value });
        j++;
        continue;
      }
      if (b.text === "##") {
        const left = substituted.pop();
        const nextToken = body[j + 1];
        j++;
        if (!left || !nextToken) continue;
        const right = argOf(nextToken.text) ?? [nextToken];
        const [head, ...rest] = right;
        substituted.push(head ? paste(left, head) : left, ...rest);
        continue;
      }
      const arg = b.kind === "ident" ? argOf(b.text) : undefined;
      if (arg) {
        substituted.push(...(body[j + 1]?.text === "##" ? arg : expand(arg, macros, hide)));
      } else {
        substituted.push(b);
      }
    }
    out.push(...expand(substituted, macros, inner));
    i = call.end;
  }
  return out;
}

function mergeStrings(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (t.kind === "string" && last?.kind === "string") {
      const value = (last.value ?? "") + (t.value ?? "");
      out[out.length - 1] = { kind: "string", text: JSON.stringify(value), value };
    } else {
      out.push(t);
    }
  }
  return out;
}

function preprocess(source: string): Token[] {
  const macros = new Map<string, Macro>();
  const lines = readLines(source);
  const out: Token[] = [];
  let pending: Token[] = [];
  const flush = () => {
    out.push(...expand(pending, macros, new Set()));
    pending = [];
  };
  for (const line of lines) {
    if ("directive" in line) {
      flush();
      const [kind, rest] = [line.directive.slice(0, 6), line.directive.slice(7)];
      if (kind === "define") {
        const parsed = parseDefine(rest);
        if (parsed) macros.set(parsed[0], parsed[1]);
      } else {
        macros.delete(rest.trim());
      }
      continue;
    }
    pending.push(...line);
  }
  flush();
  return mergeStrings(out);
}

// ---------------------------------------------------------------------------
// Source model

interface CFunction {
  readonly name: string;
  readonly file: string;
  readonly takesLuaState: boolean;
  readonly params: string[];
  readonly body: Token[];
}

interface RegTable {
  readonly name: string;
  readonly file: string;
  readonly entries: Array<{ lua: string; cFunction: string }>;
}

interface SourceFile {
  readonly file: string;
  readonly tokens: Token[];
  readonly functions: CFunction[];
  readonly tables: RegTable[];
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "return", "sizeof", "catch"]);

function matchClose(tokens: readonly Token[], open: number): number {
  const opener = tokens[open]?.text;
  const closer = opener === "(" ? ")" : opener === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const text = (tokens[i] as Token).text;
    if (text === opener) depth++;
    else if (text === closer && --depth === 0) return i;
  }
  return tokens.length - 1;
}

function splitTopLevel(tokens: readonly Token[], separator: string): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.text === "(" || t.text === "{" || t.text === "[") depth++;
    else if (t.text === ")" || t.text === "}" || t.text === "]") depth--;
    if (t.text === separator && depth === 0) parts.push([]);
    else (parts[parts.length - 1] as Token[]).push(t);
  }
  return parts;
}

function findFunctions(file: string, tokens: readonly Token[]): CFunction[] {
  const functions: CFunction[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i] as Token;
    if (t.kind !== "ident" || KEYWORDS.has(t.text) || tokens[i + 1]?.text !== "(") continue;
    const close = matchClose(tokens, i + 1);
    let brace = close + 1;
    while (tokens[brace]?.text === "const") brace++;
    if (tokens[brace]?.text !== "{") continue;
    const paramTokens = tokens.slice(i + 2, close);
    const params = splitTopLevel(paramTokens, ",");
    const first = params[0] ?? [];
    const end = matchClose(tokens, brace);
    functions.push({
      name: t.text,
      file,
      takesLuaState: first.some((p) => p.text === "lua_State") && first.some((p) => p.text === "*"),
      params: params.map((p) => [...p].reverse().find((x) => x.kind === "ident")?.text ?? ""),
      body: tokens.slice(brace + 1, end),
    });
    i = end;
  }
  return functions;
}

function lastIdent(tokens: readonly Token[]): string | undefined {
  return [...tokens].reverse().find((t) => t.kind === "ident")?.text;
}

function findTables(file: string, tokens: readonly Token[]): RegTable[] {
  const tables: RegTable[] = [];
  for (let i = 0; i < tokens.length - 4; i++) {
    const t = tokens[i] as Token;
    if (t.text !== "luaL_reg" && t.text !== "luaL_Reg") continue;
    const name = tokens[i + 1] as Token;
    if (name.kind !== "ident" || tokens[i + 2]?.text !== "[") continue;
    let open = i + 3;
    while (open < tokens.length && tokens[open]?.text !== "{" && tokens[open]?.text !== ";") open++;
    if (tokens[open]?.text !== "{") continue;
    const end = matchClose(tokens, open);
    const entries: RegTable["entries"] = [];
    for (const entry of splitTopLevel(tokens.slice(open + 1, end), ",")) {
      if (entry[0]?.text !== "{") continue;
      const [key, value] = splitTopLevel(entry.slice(1, -1), ",");
      const lua = key?.[0];
      const cFunction = value ? lastIdent(value) : undefined;
      if (lua?.kind === "string" && cFunction) entries.push({ lua: lua.value ?? "", cFunction });
    }
    tables.push({ name: name.text, file, entries });
    i = end;
  }
  return tables;
}

function listCpp(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".cpp"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

function loadSources(dir: string): SourceFile[] {
  return listCpp(dir).map((file) => {
    const tokens = preprocess(readFileSync(join(dir, file), "utf8"));
    return {
      file,
      tokens,
      functions: findFunctions(file, tokens),
      tables: findTables(file, tokens),
    };
  });
}

class Index {
  private readonly functionsByName = new Map<string, CFunction[]>();
  private readonly tablesByName = new Map<string, RegTable[]>();

  constructor(readonly files: readonly SourceFile[]) {
    for (const file of files) {
      for (const fn of file.functions) push(this.functionsByName, fn.name, fn);
      for (const table of file.tables) push(this.tablesByName, table.name, table);
    }
  }

  // The caller's own file first, then its directory, so a Box2D v2 source
  // resolves the v2 helper and never its v3 namesake.
  functionsNamed(name: string, fromFile: string): CFunction[] {
    const all = this.functionsByName.get(name) ?? [];
    const local = all.filter((fn) => fn.file === fromFile);
    if (local.length > 0) return local;
    const dir = fromFile.slice(0, fromFile.lastIndexOf("/") + 1);
    const sibling = all.filter(
      (fn) => fn.file.startsWith(dir) && !fn.file.slice(dir.length).includes("/"),
    );
    return sibling.length > 0 ? sibling : all;
  }

  table(name: string, fromFile: string): RegTable | undefined {
    const all = this.tablesByName.get(name) ?? [];
    return all.find((t) => t.file === fromFile) ?? (all.length === 1 ? all[0] : undefined);
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------
// Calls and guards

interface Call {
  readonly callee: string;
  readonly args: Token[][];
  readonly guards: readonly Guard[];
  // Evaluated as a branch condition rather than for its value.
  readonly branches?: true;
}

interface Guard {
  readonly condition: Token[];
  readonly positive: boolean;
}

type Event =
  | { readonly type: "call"; readonly call: Call }
  | { readonly type: "return"; readonly value: Token[]; readonly guards: readonly Guard[] };

function scanExpression(
  tokens: Token[],
  guards: readonly Guard[],
  events: Event[],
  branches = false,
): void {
  // `bool recursive = top >= 2 && lua_toboolean(L, 2)`: the target takes no
  // part in the conditions the value is built from.
  const assign = topLevelIndex(tokens, "=");
  if (assign !== -1) {
    scanExpression(tokens.slice(0, assign), guards, events, branches);
    scanExpression(tokens.slice(assign + 1), guards, events, branches);
    return;
  }
  const question = topLevelIndex(tokens, "?");
  if (question !== -1) {
    const colon = matchingColon(tokens, question);
    const condition = tokens.slice(0, question);
    scanExpression(condition, guards, events, true);
    scanExpression(
      tokens.slice(question + 1, colon),
      [...guards, { condition, positive: true }],
      events,
    );
    scanExpression(tokens.slice(colon + 1), [...guards, { condition, positive: false }], events);
    return;
  }
  // `a && b` evaluates b only once a holds, and `a || b` only once a fails.
  for (const [joiner, positive] of [
    ["||", false],
    ["&&", true],
  ] as const) {
    const parts = splitTopLevel(tokens, joiner);
    if (parts.length < 2) continue;
    let scoped = guards;
    for (const part of parts) {
      scanExpression(part, scoped, events, branches);
      scoped = [...scoped, { condition: part, positive }];
    }
    return;
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.kind !== "ident" || KEYWORDS.has(t.text)) continue;
    const open = i + 1 + templateArgumentsLength(tokens, i + 1);
    if (tokens[open]?.text !== "(") continue;
    const close = matchClose(tokens, open);
    const args = splitTopLevel(tokens.slice(open + 1, close), ",");
    let qualified = t.text;
    for (
      let q = i - 1;
      q > 0 && tokens[q]?.text === "::" && tokens[q - 1]?.kind === "ident";
      q -= 2
    ) {
      qualified = `${(tokens[q - 1] as Token).text}::${qualified}`;
    }
    // An error message's arguments describe the failure; they read nothing the
    // call accepts. The arguments run before the call, so their pushes land
    // beneath whatever the call pushes.
    if (!ERROR_CALLS.has(t.text)) for (const arg of args) scanExpression(arg, guards, events);
    events.push({
      type: "call",
      call: { callee: qualified, args, guards, ...(branches ? { branches: true as const } : {}) },
    });
    i = close;
  }
}

// The length of `<bool>` in `CheckFieldValue<bool>(...)`: type names only, so a
// comparison such as `a < b` is never read as one.
function templateArgumentsLength(tokens: readonly Token[], at: number): number {
  if (tokens[at]?.text !== "<") return 0;
  for (let j = at + 1; j < tokens.length; j++) {
    const text = (tokens[j] as Token).text;
    if (text === ">") return j - at + 1;
    if (tokens[j]?.kind !== "ident" && text !== "::" && text !== "*" && text !== ",") return 0;
  }
  return 0;
}

function topLevelIndex(tokens: readonly Token[], text: string): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = (tokens[i] as Token).text;
    if (t === "(" || t === "[" || t === "{") depth++;
    else if (t === ")" || t === "]" || t === "}") depth--;
    else if (t === text && depth === 0) return i;
  }
  return -1;
}

function matchingColon(tokens: readonly Token[], question: number): number {
  let depth = 0;
  let nested = 0;
  for (let i = question + 1; i < tokens.length; i++) {
    const t = (tokens[i] as Token).text;
    if (t === "(" || t === "[" || t === "{") depth++;
    else if (t === ")" || t === "]" || t === "}") depth--;
    else if (depth === 0 && t === "?") nested++;
    else if (depth === 0 && t === ":") {
      if (nested === 0) return i;
      nested--;
    }
  }
  return tokens.length;
}

// Walks statements in order, recording every call with the conditions that
// must hold for it to run.
function walkStatements(tokens: Token[], guards: readonly Guard[], events: Event[]): void {
  let i = 0;
  let scoped = guards;
  while (i < tokens.length) {
    const early = earlyReturnCondition(tokens, i);
    i = walkStatement(tokens, i, scoped, events);
    if (early) scoped = [...scoped, { condition: early, positive: false }];
  }
}

// The condition of an `if` with no `else` whose branch ends in a plain return,
// as in `if (lua_isnoneornil(L, i)) return fallback;`: the statements after it
// run only when the condition failed. An error return is left out, because it
// refuses the call rather than skipping the rest.
function earlyReturnCondition(tokens: Token[], i: number): Token[] | undefined {
  if (tokens[i]?.text !== "if" || tokens[i + 1]?.text !== "(") return undefined;
  const close = matchClose(tokens, i + 1);
  let branch: Token[];
  let after: number;
  if (tokens[close + 1]?.text === "{") {
    const end = matchClose(tokens, close + 1);
    branch = tokens.slice(close + 2, end);
    after = end + 1;
  } else {
    let end = close + 1;
    while (end < tokens.length && tokens[end]?.text !== ";") end++;
    branch = tokens.slice(close + 1, end + 1);
    after = end + 1;
  }
  if (tokens[after]?.text === "else") return undefined;
  const statements = splitTopLevel(branch, ";");
  let last = statements[statements.length - 2] ?? [];
  const brace = last.map((t) => t.text).lastIndexOf("}");
  if (brace !== -1) last = last.slice(brace + 1);
  if (last[0]?.text !== "return") return undefined;
  const value = last.slice(1);
  const head = value[0]?.kind === "ident" ? guardedCall({ tokens: value, positive: true }) : null;
  if (head && ERROR_CALLS.has(baseName(head.name))) return undefined;
  return tokens.slice(i + 2, close);
}

function walkStatement(
  tokens: Token[],
  i: number,
  guards: readonly Guard[],
  events: Event[],
): number {
  const t = tokens[i] as Token;
  if (t.text === "{") {
    const end = matchClose(tokens, i);
    walkStatements(tokens.slice(i + 1, end), guards, events);
    return end + 1;
  }
  if (t.text === "if" && tokens[i + 1]?.text === "(") {
    const close = matchClose(tokens, i + 1);
    const condition = tokens.slice(i + 2, close);
    scanExpression(condition, guards, events, true);
    const thenEnd = walkStatement(
      tokens,
      close + 1,
      [...guards, { condition, positive: true }],
      events,
    );
    if (tokens[thenEnd]?.text === "else") {
      return walkStatement(
        tokens,
        thenEnd + 1,
        [...guards, { condition, positive: false }],
        events,
      );
    }
    return thenEnd;
  }
  if (
    (t.text === "for" || t.text === "while" || t.text === "switch") &&
    tokens[i + 1]?.text === "("
  ) {
    const close = matchClose(tokens, i + 1);
    const head = tokens.slice(i + 2, close);
    scanExpression(head, guards, events, t.text !== "for");
    const inner = t.text === "switch" ? [...guards, { condition: head, positive: true }] : guards;
    return walkStatement(tokens, close + 1, inner, events);
  }
  if (t.text === "do") {
    const end = walkStatement(tokens, i + 1, guards, events);
    return walkStatement(tokens, end + 1, guards, events);
  }
  if ((t.text === "case" || t.text === "default") && tokens[i + 1]) {
    let j = i + 1;
    while (j < tokens.length && tokens[j]?.text !== ":") j++;
    return j + 1;
  }
  if (t.text === ";") return i + 1;
  let end = i;
  let depth = 0;
  while (end < tokens.length) {
    const text = (tokens[end] as Token).text;
    if (text === "(" || text === "[" || text === "{") depth++;
    else if (text === ")" || text === "]" || text === "}") depth--;
    else if (text === ";" && depth === 0) break;
    end++;
  }
  const statement = tokens.slice(i, end);
  if (t.text === "return") {
    events.push({ type: "return", value: statement.slice(1), guards });
  }
  scanExpression(t.text === "return" ? statement.slice(1) : statement, guards, events);
  return end + 1;
}

// ---------------------------------------------------------------------------
// Slot analysis

const CHECK_KINDS: ReadonlyMap<string, readonly LuaKind[]> = new Map<string, LuaKind[]>([
  ["luaL_checknumber", ["number"]],
  ["luaL_checkinteger", ["number"]],
  ["luaL_checkint", ["number"]],
  ["luaL_checklong", ["number"]],
  ["luaL_optnumber", ["number"]],
  ["luaL_optinteger", ["number"]],
  ["luaL_optint", ["number"]],
  ["lua_tonumber", ["number"]],
  ["lua_tointeger", ["number"]],
  ["luaL_checkstring", ["string"]],
  ["luaL_checklstring", ["string"]],
  ["luaL_optstring", ["string"]],
  ["luaL_optlstring", ["string"]],
  ["lua_tostring", ["string"]],
  ["lua_tolstring", ["string"]],
  ["lua_toboolean", ["boolean"]],
  ["CheckBoolean", ["boolean"]],
  ["CheckHash", ["hash"]],
  ["CheckHashOrString", ["hash", "string"]],
  ["CheckURL", ["url"]],
  ["ResolveURL", ["url", "string", "hash"]],
  ["CheckVector3", ["vector3"]],
  ["ToVector3", ["vector3"]],
  ["ToVector4", ["vector4"]],
  ["ToQuat", ["quat"]],
  ["ToMatrix4", ["matrix4"]],
  ["ToVector", ["vector"]],
  ["ToURL", ["url"]],
  ["CheckVector4", ["vector4"]],
  ["CheckQuat", ["quat"]],
  ["CheckMatrix4", ["matrix4"]],
  ["CheckVector", ["vector"]],
  ["CheckBuffer", ["buffer"]],
  ["CheckBufferUnpack", ["buffer"]],
  ["CheckBufferNoError", ["buffer"]],
  ["CheckUserType", ["userdata"]],
  ["lua_touserdata", ["userdata"]],
  ["CreateCallback", ["function"]],
]);

// Readers that convert or return null for an argument of the wrong kind rather
// than raise on it.
const UNCHECKED_READS = new Set([
  "lua_toboolean",
  "lua_tonumber",
  "lua_tointeger",
  "lua_tostring",
  "lua_tolstring",
  "lua_touserdata",
  "ToVector3",
  "ToVector4",
  "ToQuat",
  "ToMatrix4",
  "ToVector",
  "ToURL",
]);

// `dmScript::ResolveURL` reads an absent or nil slot as the calling script's own
// URL, so a slot it alone reads can be omitted.
const OPTIONAL_CHECKS = new Set([
  "ResolveURL",
  "luaL_optnumber",
  "luaL_optinteger",
  "luaL_optint",
  "luaL_optstring",
  "luaL_optlstring",
]);

const TYPE_CONSTANTS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["LUA_TNUMBER", "number"],
  ["LUA_TSTRING", "string"],
  ["LUA_TBOOLEAN", "boolean"],
  ["LUA_TTABLE", "table"],
  ["LUA_TFUNCTION", "function"],
  ["LUA_TUSERDATA", "userdata"],
  ["LUA_TLIGHTUSERDATA", "userdata"],
  ["LUA_TNIL", "nil"],
]);

const IS_GUARDS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["lua_isnumber", "number"],
  ["lua_isstring", "string"],
  ["lua_istable", "table"],
  ["lua_isfunction", "function"],
  ["lua_isboolean", "boolean"],
  ["lua_isuserdata", "userdata"],
  ["IsURL", "url"],
  ["IsHash", "hash"],
  ["IsVector3", "vector3"],
  ["IsVector4", "vector4"],
  ["IsQuat", "quat"],
  ["IsMatrix4", "matrix4"],
  ["IsVector", "vector"],
  ["IsBuffer", "buffer"],
]);

const NIL_GUARDS = new Set(["lua_isnil", "lua_isnoneornil", "lua_isnone"]);

const PUSH_KINDS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["lua_pushnumber", "number"],
  ["lua_pushinteger", "number"],
  ["lua_pushstring", "string"],
  ["lua_pushlstring", "string"],
  ["lua_pushliteral", "string"],
  ["lua_pushfstring", "string"],
  ["lua_pushboolean", "boolean"],
  ["lua_pushnil", "nil"],
  ["lua_newtable", "table"],
  ["lua_createtable", "table"],
  ["lua_pushcfunction", "function"],
  ["lua_pushcclosure", "function"],
  ["lua_pushlightuserdata", "userdata"],
  ["lua_newuserdata", "userdata"],
  ["luaL_getmetatable", "table"],
  ["PushHash", "hash"],
  ["PushURL", "url"],
  ["PushVector3", "vector3"],
  ["PushVector4", "vector4"],
  ["PushQuat", "quat"],
  ["PushMatrix4", "matrix4"],
  ["PushVector", "vector"],
  ["PushBuffer", "buffer"],
]);

const POPS: ReadonlyMap<string, number> = new Map([
  ["lua_setfield", 1],
  ["lua_rawseti", 1],
  ["lua_setmetatable", 1],
  ["lua_settable", 2],
  ["lua_rawset", 2],
  // `dmScript::Ref` stores the top value in a registry table and pops it.
  ["Ref", 1],
]);

const ERROR_CALLS = new Set([
  "luaL_error",
  "luaL_argerror",
  "luaL_typerror",
  "DM_LUA_ERROR",
  "ReportPathError",
]);

const MAX_HELPER_DEPTH = 3;

function baseName(callee: string): string {
  return callee.slice(callee.lastIndexOf(":") + 1);
}

type Env = ReadonlyMap<string, number>;

// Env key carrying the caller's stack-top copy into a helper; not a C identifier.
const TOP_COPY = "#top";

// How a call moves the stack top; a helper is assumed to leave it balanced.
function stackDelta(name: string, args: readonly Token[][]): number {
  if (PUSH_KINDS.has(name)) return 1;
  if (name === "lua_getfield" || name === "lua_rawgeti" || name === "lua_next") return 1;
  if (name === "lua_gettable" || name === "lua_rawget") return 0;
  if (name === "lua_pop") return -(intLiteral(args[1] ?? []) ?? 0);
  return -(POPS.get(name) ?? 0);
}

function intLiteral(tokens: readonly Token[]): number | undefined {
  if (tokens.length === 1 && tokens[0]?.kind === "number")
    return Number.parseInt(tokens[0].text, 10);
  if (tokens.length === 2 && tokens[0]?.text === "-" && tokens[1]?.kind === "number") {
    return -Number.parseInt(tokens[1].text, 10);
  }
  return undefined;
}

// The absolute stack slot an index argument names, `undefined` for a
// non-literal index, and `null` for a relative (negative) one.
function slotOf(tokens: readonly Token[], env: Env): number | null | undefined {
  const literal = intLiteral(tokens);
  if (literal !== undefined) return literal > 0 ? literal : null;
  if (tokens.length === 1 && tokens[0]?.kind === "ident") return env.get(tokens[0].text);
  return undefined;
}

interface SlotRead {
  readonly slot: number;
  readonly kinds: readonly LuaKind[];
  readonly optional: boolean;
  readonly field?: string;
  readonly manual?: string;
  readonly minusOne?: true;
  readonly unchecked?: true;
  // A type probe such as `lua_isnumber` answers false for nil and branches,
  // so it never decides whether the slot may be omitted.
  readonly probe?: true;
  // Accepts nil but not an absent argument: `lua_isnil` is false past the top.
  readonly nilable?: true;
}

const NUMERIC_CHECKS = new Set([
  "luaL_checknumber",
  "luaL_checkinteger",
  "luaL_checkint",
  "luaL_checklong",
  "luaL_optnumber",
  "luaL_optinteger",
  "luaL_optint",
  "lua_tonumber",
  "lua_tointeger",
]);

function isMinusOne(body: readonly Token[], i: number): boolean {
  return (
    body[i]?.text === "-" &&
    body[i + 1]?.kind === "number" &&
    body[i + 1]?.text === "1" &&
    !["*", "/", "."].includes(body[i + 2]?.text ?? "")
  );
}

function matchOpen(tokens: readonly Token[], close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    const text = (tokens[i] as Token).text;
    if (text === ")") depth++;
    else if (text === "(" && --depth === 0) return i;
  }
  return -1;
}

// `check(L, n) - 1`, or `v = check(L, n)` with a later `v - 1`. Call arguments
// share their token objects with the body, which is how the call is located.
function subtractsOne(body: readonly Token[], positions: ReadonlyMap<Token, number>, call: Call) {
  const first = call.args[0]?.[0];
  const lastArg = call.args[call.args.length - 1];
  const last = lastArg?.[lastArg.length - 1];
  if (!first || !last) return false;
  const open = (positions.get(first) ?? 0) - 1;
  const close = (positions.get(last) ?? -2) + 1;
  if (body[open]?.text !== "(" || body[close]?.text !== ")") return false;
  if (isMinusOne(body, close + 1)) return true;
  let j = open - 2;
  while (body[j]?.text === "::") j -= 2;
  if (body[j]?.text === ")") j = matchOpen(body, j) - 1;
  const variable = body[j - 1];
  if (body[j]?.text !== "=" || variable?.kind !== "ident") return false;
  for (let k = close + 1; k < body.length; k++) {
    if (body[k]?.text === variable.text && isMinusOne(body, k + 1)) return true;
  }
  return false;
}

interface Analysis {
  readonly reads: SlotRead[];
  readonly variadic: string[];
  readonly arities: Set<number>;
  unguardedMax: number;
  // Slots an error branch refuses when nil, and the argument count below
  // which one refuses the call.
  readonly nilRejected: Set<number>;
  errorMinArgs: number;
}

// A conjunct of a guard condition with its polarity applied.
interface Atom {
  readonly tokens: Token[];
  readonly positive: boolean;
}

function atomsOf(guard: Guard): Atom[] {
  let tokens = guard.condition;
  let positive = guard.positive;
  while (tokens[0]?.text === "(" && matchClose(tokens, 0) === tokens.length - 1) {
    tokens = tokens.slice(1, -1);
  }
  if (
    tokens[0]?.text === "!" &&
    tokens[1]?.text === "(" &&
    matchClose(tokens, 1) === tokens.length - 1
  ) {
    return atomsOf({ condition: tokens.slice(2, -1), positive: !positive });
  }
  const joiner = positive ? "&&" : "||";
  const parts = splitTopLevel(tokens, joiner);
  if (parts.length > 1) return parts.flatMap((part) => atomsOf({ condition: part, positive }));
  if (tokens[0]?.text === "!") {
    tokens = tokens.slice(1);
    positive = !positive;
  }
  return [{ tokens, positive }];
}

interface CountComparison {
  readonly op: string;
  readonly value: number;
}

const FLIP: Record<string, string> = {
  ">": "<=",
  ">=": "<",
  "<": ">=",
  "<=": ">",
  "==": "!=",
  "!=": "==",
};

function countComparison(
  atom: Atom,
  topAliases: ReadonlySet<string>,
  env: Env = new Map(),
): CountComparison | null {
  const tokens = atom.tokens;
  const opIndex = tokens.findIndex((t) => t.text in FLIP);
  if (opIndex === -1) return null;
  const left = tokens.slice(0, opIndex);
  const right = tokens.slice(opIndex + 1);
  const isTop = (side: Token[]) =>
    (side.length === 4 && side[0]?.text === "lua_gettop") ||
    (side.length === 1 && topAliases.has(side[0]?.text ?? ""));
  const op = (tokens[opIndex] as Token).text;
  let value: number | undefined;
  let normalized: string;
  // A helper compares the top against the stack index it was handed.
  const bound = (side: Token[]) =>
    intLiteral(side) ?? (side.length === 1 ? env.get(side[0]?.text ?? "") : undefined);
  if (isTop(left)) {
    value = bound(right);
    normalized = op;
  } else if (isTop(right)) {
    value = bound(left);
    normalized =
      ({ ">": "<", ">=": "<=", "<": ">", "<=": ">=" } as Record<string, string>)[op] ?? op;
  } else {
    return null;
  }
  if (value === undefined) return null;
  return { op: atom.positive ? normalized : (FLIP[normalized] as string), value };
}

function guardedCall(atom: Atom): { name: string; args: Token[][] } | null {
  let tokens = atom.tokens;
  while (tokens[0]?.text === "(" && matchClose(tokens, 0) === tokens.length - 1)
    tokens = tokens.slice(1, -1);
  let start = 0;
  while (tokens[start + 1]?.text === "::") start += 2;
  const head = tokens[start];
  if (head?.kind !== "ident" || tokens[start + 1]?.text !== "(") return null;
  const close = matchClose(tokens, start + 1);
  if (close !== tokens.length - 1) return null;
  return { name: head.text, args: splitTopLevel(tokens.slice(start + 2, close), ",") };
}

interface SlotFacts {
  readonly optional: boolean;
  readonly nilable: boolean;
  readonly kinds: LuaKind[];
}

// An error raised under a single-condition guard, such as
// `if (lua_isnil(L, 1)) return luaL_error(...)` or `if (top < 2) return
// luaL_error(...)`, makes the slot it names required whatever reads it later.
function recordErrorGuard(
  guards: readonly Guard[],
  env: Env,
  topAliases: ReadonlySet<string>,
  analysis: Analysis,
): void {
  for (const slot of rejectedByProbes(guards, env)) analysis.nilRejected.add(slot);
  if (guards.length !== 1) return;
  const atoms = atomsOf(guards[0] as Guard);
  if (atoms.length !== 1) return;
  const atom = atoms[0] as Atom;
  const cmp = countComparison(atom, topAliases, env);
  if (cmp) {
    const min =
      cmp.op === "<"
        ? cmp.value
        : cmp.op === "<=" || (cmp.op === "==" && cmp.value === 0)
          ? cmp.value + 1
          : 0;
    analysis.errorMinArgs = Math.max(analysis.errorMinArgs, min);
    return;
  }
  const call = guardedCall(atom);
  if (!call || !atom.positive || !NIL_GUARDS.has(call.name) || call.args.length < 2) return;
  const slot = slotOf(call.args[1] as Token[], env);
  if (typeof slot === "number") analysis.nilRejected.add(slot);
}

// The slots an error refuses because nil fails a type probe on the way to it,
// as in `if (lua_isstring(L, 1)) ... else return luaL_error(...)` or
// `if (lua_isboolean(L, 1) && lua_isboolean(L, 2)) ... else luaL_error(...)`.
// A slot counts only when nil there makes every condition on the error path
// hold: a negated probe of it in each conjunct of a taken branch, or a probe of
// it among the conjuncts of a branch not taken.
function rejectedByProbes(guards: readonly Guard[], env: Env): number[] {
  if (guards.length === 0) return [];
  const probes = guards.map((guard) => {
    let tokens = guard.condition;
    while (tokens[0]?.text === "(" && matchClose(tokens, 0) === tokens.length - 1) {
      tokens = tokens.slice(1, -1);
    }
    return splitTopLevel(tokens, "&&").map((part) => {
      const negated = part[0]?.text === "!";
      const call = guardedCall({ tokens: negated ? part.slice(1) : part, positive: true });
      if (!call || !IS_GUARDS.has(baseName(call.name))) return undefined;
      const slot = slotOf(call.args[1] ?? [], env);
      return typeof slot === "number" ? { slot, negated } : undefined;
    });
  });
  const candidates = new Set(
    probes.flat().flatMap((probe) => (probe === undefined ? [] : [probe.slot])),
  );
  return [...candidates].filter((slot) =>
    guards.every((guard, i) => {
      const parts = probes[i] ?? [];
      return guard.positive
        ? parts.every((p) => p?.negated && p.slot === slot)
        : parts.some((p) => p !== undefined && !p.negated && p.slot === slot);
    }),
  );
}

// What the guards on a read say about `slot`: whether the read can be skipped
// by omitting the argument, and which kinds an `is` guard admits there.
function guardFacts(
  slot: number,
  guards: readonly Guard[],
  env: Env,
  topAliases: ReadonlySet<string>,
): SlotFacts {
  let optional = false;
  let nilable = false;
  const kinds: LuaKind[] = [];
  for (const guard of guards) {
    for (const atom of atomsOf(guard)) {
      const cmp = countComparison(atom, topAliases, env);
      if (cmp) {
        if (
          (cmp.op === ">" && cmp.value < slot) ||
          (cmp.op === ">=" && cmp.value <= slot) ||
          (cmp.op === "==" && cmp.value >= slot) ||
          (cmp.op === "!=" && cmp.value === 0 && slot === 1)
        ) {
          optional = true;
        }
        continue;
      }
      const call = guardedCall(atom);
      if (!call || call.args.length < 2) continue;
      if (slotOf(call.args[1] as Token[], env) !== slot) continue;
      if (call.name === "lua_isnil") nilable = true;
      else if (NIL_GUARDS.has(call.name)) optional = true;
      const kind = IS_GUARDS.get(call.name);
      if (kind && atom.positive) kinds.push(kind);
    }
  }
  return { optional, nilable, kinds };
}

function exactCounts(
  guards: readonly Guard[],
  topAliases: ReadonlySet<string>,
): number | undefined {
  for (const guard of guards) {
    for (const atom of atomsOf(guard)) {
      const cmp = countComparison(atom, topAliases);
      if (cmp?.op === "==") return cmp.value;
    }
  }
  return undefined;
}

function topAliasesOf(body: readonly Token[]): Set<string> {
  const aliases = new Set<string>();
  for (let i = 0; i < body.length - 5; i++) {
    if (
      body[i]?.kind === "ident" &&
      body[i + 1]?.text === "=" &&
      body[i + 2]?.text === "lua_gettop" &&
      body[i + 3]?.text === "(" &&
      body[i + 5]?.text === ")"
    ) {
      aliases.add((body[i] as Token).text);
    }
  }
  return aliases;
}

function eventsOf(fn: CFunction): Event[] {
  const events: Event[] = [];
  walkStatements(fn.body, [], events);
  return events;
}

// Locals assigned an argument's stack index once, as in
// `int definition_index = AbsIndex(L, 2);` or `const int self_index = 1;`.
function indexLocalsOf(body: readonly Token[], env: Env): Map<string, number> {
  const assigned = new Map<string, number[]>();
  for (let i = 1; i < body.length - 2; i++) {
    const name = body[i - 1] as Token;
    if (name.kind !== "ident" || body[i]?.text !== "=") continue;
    let value: number | undefined;
    const call = body[i + 1]?.text;
    if ((call === "AbsIndex" || call === "lua_absindex") && body[i + 2]?.text === "(") {
      const close = matchClose(body as Token[], i + 2);
      const args = splitTopLevel(body.slice(i + 3, close), ",");
      if (args[0]?.length === 1 && args[0][0]?.text === "L") {
        value = slotOf(args[1] ?? [], env) ?? undefined;
      }
    } else if (/(^|_)index$/.test(name.text) && body[i + 2]?.text === ";") {
      value = intLiteral([body[i + 1] as Token]);
    }
    push(assigned, name.text, value ?? Number.NaN);
  }
  const locals = new Map<string, number>();
  for (const [name, values] of assigned) {
    const only = values[0] as number;
    if (values.length === 1 && only > 0 && !env.has(name)) locals.set(name, only);
  }
  return locals;
}

// Locals holding a probe's answer, as in `bool has_options = lua_istable(L, 2);`,
// mapped to the probe call so a later `if (has_options)` guards like the probe.
function probeAliasesOf(body: readonly Token[]): Map<string, Token[]> {
  const aliases = new Map<string, Token[]>();
  for (let i = 1; i < body.length - 3; i++) {
    const name = body[i - 1] as Token;
    const callee = body[i + 1] as Token;
    if (name.kind !== "ident" || body[i]?.text !== "=" || body[i + 2]?.text !== "(") continue;
    if (!IS_GUARDS.has(callee.text) && !NIL_GUARDS.has(callee.text)) continue;
    const close = matchClose(body as Token[], i + 2);
    if (body[close + 1]?.text !== ";") continue;
    aliases.set(name.text, body.slice(i + 1, close + 1));
  }
  return aliases;
}

function expandProbeAliases(guards: readonly Guard[], aliases: ReadonlyMap<string, Token[]>) {
  if (aliases.size === 0) return guards;
  return guards.map((guard) => ({
    ...guard,
    condition: guard.condition.flatMap((t) =>
      t.kind === "ident" && aliases.has(t.text) ? (aliases.get(t.text) as Token[]) : [t],
    ),
  }));
}

function analyzeSlots(
  fn: CFunction,
  index: Index,
  outerEnv: Env,
  outerGuards: readonly Guard[],
  depth: number,
  analysis: Analysis,
  outerAliases: ReadonlySet<string>,
  // Followed without any argument index: only its reads at literal positions
  // are the caller's arguments.
  borrowed = false,
  // Helper parameters bound to a string literal, such as a field name.
  names: ReadonlyMap<string, string> = new Map(),
): void {
  const env: Env = new Map([...outerEnv, ...indexLocalsOf(fn.body, outerEnv)]);
  const aliases = new Set([...outerAliases, ...topAliasesOf(fn.body)]);
  const probeAliases = probeAliasesOf(fn.body);
  const positions = new Map(fn.body.map((token, i) => [token, i]));
  // The argument slot `lua_pushvalue(L, n)` copied, and how many values sit
  // above that copy since: `-(copyDepth + 1)` names it until it is popped.
  let topCopy: number | null = env.get(TOP_COPY) ?? null;
  let copyDepth = 0;
  for (const event of eventsOf(fn)) {
    if (event.type !== "call") continue;
    const { callee, args } = event.call;
    const guards = expandProbeAliases([...outerGuards, ...event.call.guards], probeAliases);
    const name = baseName(callee);
    const exact = depth === 0 ? exactCounts(guards, aliases) : undefined;
    if (exact !== undefined) analysis.arities.add(exact);
    const resolve = (arg: readonly Token[] | undefined): number | null | undefined => {
      if (!arg) return undefined;
      const direct = slotOf(arg, env);
      if (direct !== null) return direct;
      const relative = intLiteral(arg) as number;
      if (topCopy !== null && relative === -(copyDepth + 1)) return topCopy;
      if (exact !== undefined && exact + relative + 1 > 0) return exact + relative + 1;
      return null;
    };
    const indexArg = args[1];
    const slot = resolve(indexArg);
    // `dmScript::GetMainThread(L)` hands the same stack to the call.
    const first = args[0] ?? [];
    const takesL =
      (first.length === 1 && first[0]?.text === "L") ||
      (first.some((t) => t.text === "GetMainThread") && first.at(-2)?.text === "L");
    if (takesL && topCopy !== null && name !== "lua_pushvalue") {
      copyDepth += stackDelta(name, args);
      if (copyDepth < 0) topCopy = null;
    }
    const record = (kinds: readonly LuaKind[], extra: Partial<SlotRead> = {}) => {
      if (typeof slot !== "number") return;
      const facts = guardFacts(slot, guards, env, aliases);
      // A read behind a positive type probe of its own slot runs only when the
      // argument is present, so it says nothing about omitting it.
      const probed = facts.kinds.length > 0 ? { probe: true as const } : {};
      analysis.reads.push({
        slot,
        kinds: [...kinds, ...facts.kinds],
        ...probed,
        ...extra,
        optional: OPTIONAL_CHECKS.has(name) || facts.optional || extra.optional === true,
        ...(facts.nilable || extra.nilable ? { nilable: true as const } : {}),
      });
      if (exact === undefined && depth === 0) {
        analysis.unguardedMax = Math.max(analysis.unguardedMax, slot);
      }
    };
    if (ERROR_CALLS.has(name)) {
      recordErrorGuard(guards, env, aliases, analysis);
      continue;
    }
    if (!takesL) continue;
    if (name === "lua_pushvalue") {
      if (typeof slot === "number") {
        topCopy = slot;
        copyDepth = 0;
      } else if (topCopy !== null) {
        copyDepth += 1;
      }
      record([]);
      continue;
    }
    const checkKinds = CHECK_KINDS.get(name);
    if (checkKinds) {
      if (slot === undefined && !borrowed) {
        analysis.variadic.push(`${name} at a non-literal index`);
      }
      const shifted = NUMERIC_CHECKS.has(name) && subtractsOne(fn.body, positions, event.call);
      record(checkKinds, {
        ...(shifted ? { minusOne: true as const } : {}),
        ...(UNCHECKED_READS.has(name) ? { unchecked: true as const } : {}),
      });
      continue;
    }
    if (name === "luaL_checktype") {
      const kind = TYPE_CONSTANTS.get(args[2]?.[0]?.text ?? "");
      record(kind ? [kind] : [], kind ? {} : { manual: "luaL_checktype with a non-constant type" });
      continue;
    }
    // Resolves the URL to a component of one type and raises on any other, so
    // the calling script's own URL, which `ResolveURL` substitutes for nil, is
    // refused: the slot is required.
    if (name === "GetComponentFromLua") {
      record(["hash", "string", "url"]);
      continue;
    }
    if (name === "lua_type") {
      record([], { manual: "lua_type switch" });
      continue;
    }
    if (name === "lua_getfield") {
      const key = args[2];
      const field =
        key?.length === 1 && key[0]?.kind === "string"
          ? key[0].value
          : key?.length === 1 && key[0]?.kind === "ident"
            ? names.get(key[0].text)
            : undefined;
      if (field !== undefined) record([], { field });
      continue;
    }
    if (NIL_GUARDS.has(name)) {
      record([], name === "lua_isnil" ? { nilable: true } : { optional: true });
      continue;
    }
    // A probe that picks a branch names a kind the binding handles; one whose
    // answer is returned, as in `types.is_hash`, accepts anything.
    if (IS_GUARDS.has(name)) {
      record(event.call.branches ? [IS_GUARDS.get(name) as LuaKind] : [], { probe: true });
      continue;
    }
    if (depth >= MAX_HELPER_DEPTH) continue;
    const helper = index.functionsNamed(name, fn.file).find((f) => f.takesLuaState);
    if (!helper || helper === fn) continue;
    const helperEnv = new Map<string, number>();
    const helperNames = new Map<string, string>();
    helper.params.forEach((param, i) => {
      const arg = args[i];
      if (arg?.length === 1 && arg[0]?.kind === "string") {
        helperNames.set(param, arg[0].value ?? "");
      } else if (arg?.length === 1 && arg[0]?.kind === "ident" && names.has(arg[0].text)) {
        helperNames.set(param, names.get(arg[0].text) as string);
      }
      const value = i === 0 ? undefined : resolve(arg);
      if (typeof value === "number") helperEnv.set(param, value);
    });
    if (topCopy !== null && copyDepth === 0) helperEnv.set(TOP_COPY, topCopy);
    // A helper handed no stack index still reads the caller's arguments at the
    // absolute positions it names.
    const indexless = helperEnv.size === 0;
    analyzeSlots(
      helper,
      index,
      helperEnv,
      guards,
      depth + 1,
      analysis,
      aliases,
      indexless,
      helperNames,
    );
  }
}

function union<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

// A value on the Lua stack: the kinds it can hold, or why they are unknown.
interface StackEntry {
  readonly kinds: LuaKind[];
  readonly reason?: string;
  // Stands for however many values a helper the walk could not follow left:
  // pops that reach it are absorbed, and nothing at or below it is known.
  readonly opaque?: true;
}

// Table reads push a value of unknown kind; the keyed ones pop their key first.
// `lua_getmetatable` pushes only when it reports true, which is the branch its
// caller's pops sit under.
const READ_POPS: ReadonlyMap<string, number> = new Map([
  ["lua_getmetatable", 0],
  ["lua_getfield", 0],
  ["lua_rawgeti", 0],
  ["lua_getglobal", 0],
  ["lua_gettable", 1],
  ["lua_rawget", 1],
]);

// Calls whose effect on the stack the return walk knows, so they are never
// followed as helpers nor blamed for a missing push.
const STACK_MODELED = new Set([
  ...PUSH_KINDS.keys(),
  ...READ_POPS.keys(),
  ...POPS.keys(),
  ...CHECK_KINDS.keys(),
  ...IS_GUARDS.keys(),
  ...NIL_GUARDS,
  ...ERROR_CALLS,
  "lua_pop",
  "lua_pushvalue",
  "lua_gettop",
  "lua_type",
  "luaL_checktype",
  "DM_LUA_STACK_CHECK",
]);

// What a helper does to its caller's stack: the values it pops from beneath
// its own, then the values it leaves.
interface HelperEffect {
  readonly consumes: number;
  readonly left: StackEntry[];
}

// The net push count a body asserts with `DM_LUA_STACK_CHECK(L, n)`.
function declaredStackEffect(fn: CFunction): number | undefined {
  for (const event of eventsOf(fn)) {
    const call = event.type === "call" ? event.call : undefined;
    if (call?.callee === "DM_LUA_STACK_CHECK" && call.guards.length === 0) {
      return intLiteral(call.args[1] ?? []);
    }
  }
  return undefined;
}

// A helper the walk cannot follow leaves the values it declares, else an
// opaque entry that carries the reason to its caller's return.
function unfollowedEffect(helper: CFunction, reason: string): HelperEffect {
  const declared = declaredStackEffect(helper);
  if (declared === undefined) return { consumes: 0, left: [{ kinds: [], reason, opaque: true }] };
  return {
    consumes: Math.max(0, -declared),
    left: Array.from({ length: Math.max(0, declared) }, () => ({ kinds: [], reason })),
  };
}

type ReturnVisitor = (value: Token[], stack: readonly StackEntry[], unfollowed?: string) => void;

// Replays the pushes and pops of a body in statement order. A helper is walked
// on a fresh stack and what it leaves is pushed onto its caller's, unless its
// stack changes depend on a branch or reach into the caller's values.
function walkStack(
  fn: CFunction,
  index: Index,
  depth: number,
  visiting: ReadonlySet<CFunction>,
  onReturn?: ReturnVisitor,
): HelperEffect {
  const stack: StackEntry[] = [];
  let underflow = false;
  let branched = false;
  let unfollowed: string | undefined;
  const changes = (call: Call) => {
    if (depth > 0 && call.guards.length > 0) branched = true;
  };
  const pop = (count: number) => {
    for (let i = 0; i < count; i++) {
      const top = stack.at(-1);
      if (top?.opaque) return;
      if (!top) {
        if (depth > 0) underflow = true;
        return;
      }
      stack.pop();
    }
  };
  for (const event of eventsOf(fn)) {
    if (event.type === "return") {
      onReturn?.(event.value, stack, unfollowed);
      continue;
    }
    const { call } = event;
    const name = baseName(call.callee);
    const first = call.args[0] ?? [];
    const takesL = first.length === 1 && first[0]?.text === "L";
    const pushed = PUSH_KINDS.get(name);
    if (pushed) {
      changes(call);
      stack.push({ kinds: [pushed] });
      continue;
    }
    if (name === "lua_pushvalue" && takesL) {
      changes(call);
      const copied = (call.args[1] ?? []).map((t) => t.text).join(" ");
      stack.push({ kinds: [], reason: `copy of stack index ${copied}` });
      continue;
    }
    const keys = READ_POPS.get(name);
    if (keys !== undefined && takesL) {
      changes(call);
      pop(keys);
      stack.push({ kinds: [], reason: `value read by ${name}` });
      continue;
    }
    const pops =
      name === "lua_pop"
        ? (intLiteral(call.args[1] ?? []) ?? 0)
        : name === "lua_setfield" && intLiteral(call.args[1] ?? []) === -1
          ? 0
          : (POPS.get(name) ?? 0);
    if (pops > 0) {
      changes(call);
      pop(pops);
      continue;
    }
    if (!takesL || STACK_MODELED.has(name)) continue;
    const helper = index.functionsNamed(name, fn.file).find((f) => f.takesLuaState);
    if (!helper || visiting.has(helper)) {
      unfollowed = name;
      continue;
    }
    const effect =
      depth + 1 > MAX_HELPER_DEPTH
        ? unfollowedEffect(helper, `helper ${name} nested too deep`)
        : walkStack(helper, index, depth + 1, new Set([...visiting, helper]));
    if (effect.consumes > 0 || effect.left.length > 0) changes(call);
    pop(effect.consumes);
    stack.push(...effect.left);
  }
  if (underflow) return unfollowedEffect(fn, `helper ${fn.name} pops the caller's stack`);
  // Pushes under a branch that its pops cancel leave every path balanced. A
  // nested helper's reason names the push that is actually unknown.
  if (branched && stack.length > 0) {
    const nested = stack.find((entry) => entry.opaque)?.reason;
    return unfollowedEffect(fn, nested ?? `helper ${fn.name} pushes under a branch`);
  }
  return { consumes: 0, left: stack };
}

function analyzeReturns(fn: CFunction, index: Index): BindingReturns {
  const counts: number[] = [];
  const positions: LuaKind[][] = [];
  const reasons: (string | undefined)[] = [];
  let dynamic = false;
  walkStack(fn, index, 0, new Set([fn]), (value, stack, unfollowed) => {
    const head = value[0]?.kind === "ident" ? guardedCall({ tokens: value, positive: true }) : null;
    if (head && ERROR_CALLS.has(head.name)) return;
    const literal = intLiteral(value);
    if (literal === undefined) {
      dynamic = true;
      return;
    }
    counts.push(literal);
    let barrier = stack.length - 1;
    while (barrier >= 0 && !stack[barrier]?.opaque) barrier--;
    const start = stack.length - literal;
    // With nothing opaque below, a missing value was pushed where the walk
    // cannot place it, so no position of this return is known.
    const short =
      barrier === -1 && start < 0
        ? unfollowed
          ? `unfollowed call ${unfollowed}`
          : `return ${literal} exceeds ${stack.length} tracked pushes`
        : undefined;
    for (let i = 0; i < literal; i++) {
      const at = start + i;
      const entry = short === undefined && at > barrier ? stack[at] : undefined;
      positions[i] = union([...(positions[i] ?? []), ...(entry?.kinds ?? [])]);
      if (!entry || entry.kinds.length === 0) {
        reasons[i] ??= entry?.reason ?? short ?? stack[barrier]?.reason;
      }
    }
  });
  const count =
    dynamic || counts.length === 0
      ? counts.length === 0 && !dynamic
        ? 0
        : ("dynamic" as const)
      : Math.max(...counts);
  if (typeof count === "number" && new Set(counts).size > 1) {
    for (let i = Math.min(...counts); i < count; i++) {
      positions[i] = union([...(positions[i] ?? []), "nil" as LuaKind]);
    }
  }
  const manual = positions.flatMap((kinds, i) =>
    kinds.length === 0 ? [{ position: i + 1, reason: reasons[i] ?? "no tracked push" }] : [],
  );
  return { count, kinds: positions, ...(manual.length > 0 ? { manual } : {}) };
}

// A binding whose whole body is `return Other(L);` reads and returns what the
// function it forwards to does.
function forwardedTarget(fn: CFunction, index: Index): CFunction | undefined {
  const events = eventsOf(fn);
  const returns = events.filter((event) => event.type === "return");
  if (returns.length !== 1 || events.length !== 2) return undefined;
  const value = (returns[0] as { value: Token[] }).value;
  const call = value[0]?.kind === "ident" ? guardedCall({ tokens: value, positive: true }) : null;
  if (call?.args.length !== 1 || call.args[0]?.[0]?.text !== "L") return undefined;
  return index.functionsNamed(baseName(call.name), fn.file).find((f) => f.takesLuaState);
}

function analyzeFunction(
  namespace: string,
  name: string,
  bound: CFunction,
  index: Index,
): BindingFunction {
  let fn = bound;
  for (let hops = 0, next = forwardedTarget(fn, index); next && hops < MAX_HELPER_DEPTH; hops++) {
    fn = next;
    next = forwardedTarget(fn, index);
  }
  const analysis: Analysis = {
    reads: [],
    variadic: [],
    arities: new Set(),
    unguardedMax: 0,
    nilRejected: new Set(),
    errorMinArgs: 0,
  };
  const env = new Map<string, number>();
  analyzeSlots(fn, index, env, [], 0, analysis, new Set());

  const bySlot = new Map<number, SlotRead[]>();
  for (const read of analysis.reads) push(bySlot, read.slot, read);
  const maxSlot = Math.max(0, ...bySlot.keys());
  const arities =
    analysis.arities.size > 0
      ? union([
          ...analysis.arities,
          ...(analysis.unguardedMax > 0 ? [analysis.unguardedMax] : []),
        ]).sort((a, b) => a - b)
      : undefined;

  const slots: BindingSlot[] = [];
  const nilOnly = new Set<number>();
  for (let slot = 1; slot <= maxSlot; slot++) {
    const reads = bySlot.get(slot) ?? [];
    const manual = reads.find((r) => r.manual)?.manual;
    const kinds = union(reads.flatMap((r) => r.kinds)).sort() as LuaKind[];
    const byArity = arities !== undefined && slot > (arities[0] as number);
    const decisive = reads.filter((r) => !r.probe);
    // A slot read only behind probes of itself is skipped when absent.
    const allows = (test: (r: SlotRead) => boolean) =>
      decisive.length > 0 ? decisive.every(test) : reads.length > 0;
    const omittable = allows((r) => r.optional);
    const nilAccepted = allows((r) => r.optional || r.nilable === true);
    const refused = analysis.nilRejected.has(slot) || slot <= analysis.errorMinArgs;
    const optional = !refused && (byArity || omittable || nilAccepted);
    if (optional && !byArity && !omittable) nilOnly.add(slot);
    const fields = union(reads.flatMap((r) => (r.field ? [r.field] : []))).sort();
    const noRead = reads.length === 0 ? "no read of this slot" : undefined;
    const settled =
      manual ?? noRead ?? (kinds.length === 0 && fields.length === 0 ? "no kind check" : undefined);
    slots.push({
      index: slot,
      kinds,
      optional,
      fields,
      ...(settled ? { manual: settled } : {}),
      ...(reads.some((r) => r.minusOne) ? { minusOne: true as const } : {}),
      ...(reads.length > 0 && reads.every((r) => r.unchecked && !r.probe)
        ? { unchecked: true as const }
        : {}),
    });
  }
  for (let slot = slots.length - 1; slot >= 0; slot--) {
    const current = slots[slot] as BindingSlot;
    const later = slots[slot + 1];
    if (later && !later.optional && current.optional) {
      slots[slot] = { ...current, optional: false };
    }
  }
  const required = slots.filter((s) => !s.optional || nilOnly.has(s.index)).map((s) => s.index);
  const minArgs = arities
    ? Math.max(arities[0] as number, analysis.errorMinArgs)
    : Math.max(0, ...required);
  const manual = [...analysis.variadic];
  return {
    namespace,
    name,
    cFunction: bound.name,
    file: bound.file,
    minArgs,
    maxArgs: analysis.variadic.length > 0 ? "variadic" : Math.max(maxSlot, minArgs),
    ...(arities ? { arities } : {}),
    slots,
    returns: analyzeReturns(fn, index),
    manual,
  };
}

// ---------------------------------------------------------------------------
// Registration

type StackValue =
  | {
      readonly kind: "table";
      namespace: string | null;
      readonly functions: RegTable[];
      readonly constants: { readonly name: string; readonly file: string }[];
    }
  | { readonly kind: "value" }
  | { readonly kind: "unknown" };

interface Registered {
  readonly namespace: string;
  readonly table: RegTable;
}

function simulateRegistration(
  fn: CFunction,
  index: Index,
  stack: StackValue[],
  depth: number,
  out: {
    registered: Registered[];
    constants: Map<string, string[]>;
    constantFiles: Map<string, string[]>;
    unresolved: string[];
  },
  visiting: Set<CFunction>,
  // The string literal a caller passed for each of this helper's parameters, so
  // `SetIntegerConstant(L, "SHAPE_TYPE_BOX", …)` registers the name it is given.
  literals: ReadonlyMap<string, string> = new Map(),
): void {
  if (visiting.has(fn) || depth > 6) return;
  visiting.add(fn);
  const setConstant = (namespace: string, name: string, file: string) => {
    push(out.constants, namespace, name);
    push(out.constantFiles, `${namespace}.${name}`, file);
  };
  const bind = (value: StackValue & { kind: "table" }, namespace: string) => {
    value.namespace = namespace;
    for (const table of value.functions) out.registered.push({ namespace, table });
    for (const constant of value.constants) setConstant(namespace, constant.name, constant.file);
  };
  for (const event of eventsOf(fn)) {
    if (event.type !== "call") continue;
    const { callee, args } = event.call;
    const name = baseName(callee);
    if (name === "luaL_register") {
      const nsArg = args[1] ?? [];
      const tableName = lastIdent(args[2] ?? []);
      const table = tableName ? index.table(tableName, fn.file) : undefined;
      if (!table) {
        out.unresolved.push(`${fn.file}: luaL_register table ${tableName ?? "?"} not found`);
        continue;
      }
      if (nsArg.length === 1 && nsArg[0]?.kind === "string") {
        const value: StackValue = {
          kind: "table",
          namespace: null,
          functions: [table],
          constants: [],
        };
        bind(value, nsArg[0].value ?? "");
        stack.push(value);
      } else if (nsArg.length === 1 && /^(0|0x0|NULL|nullptr)$/.test(nsArg[0]?.text ?? "")) {
        const top = stack[stack.length - 1];
        if (top?.kind === "table") {
          top.functions.push(table);
          if (top.namespace) out.registered.push({ namespace: top.namespace, table });
        } else {
          out.unresolved.push(`${fn.file}: ${fn.name} registers ${table.name} into no table`);
        }
      } else {
        out.unresolved.push(
          `${fn.file}: ${fn.name} registers ${table.name} under a non-literal name`,
        );
        // The call still pushes the table it fills.
        stack.push({ kind: "table", namespace: null, functions: [table], constants: [] });
      }
      continue;
    }
    if (name === "lua_newtable" || name === "lua_createtable" || name === "luaL_newmetatable") {
      stack.push({ kind: "table", namespace: null, functions: [], constants: [] });
      continue;
    }
    // Fetching an existing sub-table of a namespaced table pushes that sub-table,
    // so functions registered into it bind under its namespace.
    if (name === "lua_getfield" && intLiteral(args[1] ?? []) === -1) {
      const key = args[2]?.[0];
      const top = stack[stack.length - 1];
      stack.push(
        key?.kind === "string" && top?.kind === "table" && top.namespace
          ? {
              kind: "table",
              namespace: `${top.namespace}.${key.value}`,
              functions: [],
              constants: [],
            }
          : { kind: "value" },
      );
      continue;
    }
    if (PUSH_KINDS.has(name)) {
      stack.push({ kind: "value" });
      continue;
    }
    if (name === "lua_setfield" && intLiteral(args[1] ?? []) === -2) {
      const token = args[2]?.[0];
      const keyName =
        token?.kind === "string"
          ? token.value
          : args[2]?.length === 1 && token?.kind === "ident"
            ? literals.get(token.text)
            : undefined;
      const value = stack.pop();
      const target = stack[stack.length - 1];
      if (keyName === undefined || target?.kind !== "table" || !value) continue;
      const key = { value: keyName };
      if (value.kind === "value") {
        if (target.namespace) setConstant(target.namespace, key.value ?? "", fn.file);
        else target.constants.push({ name: key.value ?? "", file: fn.file });
      } else if (
        value.kind === "table" &&
        (value.functions.length > 0 || value.constants.length > 0) &&
        target.namespace
      ) {
        bind(value, `${target.namespace}.${key.value}`);
      }
      continue;
    }
    if (name === "lua_pop") {
      const count = intLiteral(args[1] ?? []) ?? 0;
      stack.splice(Math.max(0, stack.length - count), count);
      continue;
    }
    if (args[0]?.length === 1 && args[0][0]?.text === "L") {
      for (const callee of index.functionsNamed(name, fn.file)) {
        if (callee === fn) continue;
        const passed = new Map<string, string>();
        callee.params.forEach((param, i) => {
          const arg = args[i];
          if (arg?.length === 1 && arg[0]?.kind === "string") passed.set(param, arg[0].value ?? "");
        });
        // A helper asserting `DM_LUA_STACK_CHECK(L, 0)` leaves its caller's stack as
        // it found it, whatever the walk makes of its body (`dmScript::RegisterUserType`).
        const neutral = declaredStackEffect(callee) === 0;
        const saved = [...stack];
        simulateRegistration(callee, index, stack, depth + 1, out, visiting, passed);
        if (neutral) stack.splice(0, stack.length, ...saved);
      }
    }
  }
  visiting.delete(fn);
}

function registersNamed(fn: CFunction): boolean {
  return eventsOf(fn).some(
    (event) =>
      event.type === "call" &&
      baseName(event.call.callee) === "luaL_register" &&
      event.call.args[1]?.length === 1 &&
      event.call.args[1][0]?.kind === "string",
  );
}

export function extractBindings(dir: string): BindingExtraction {
  const files = loadSources(dir);
  const index = new Index(files);
  const out = {
    registered: [] as Registered[],
    constants: new Map<string, string[]>(),
    constantFiles: new Map<string, string[]>(),
    unresolved: [] as string[],
  };
  for (const file of files) {
    for (const fn of file.functions) {
      if (registersNamed(fn)) simulateRegistration(fn, index, [], 0, out, new Set());
    }
  }

  const seen = new Set<string>();
  const functions: BindingFunction[] = [];
  for (const { namespace, table } of out.registered) {
    for (const entry of table.entries) {
      const key = `${namespace}.${entry.lua}@${table.file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fn = index.functionsNamed(entry.cFunction, table.file).find((f) => f.takesLuaState);
      if (!fn) {
        out.unresolved.push(
          `${table.file}: ${namespace}.${entry.lua} -> ${entry.cFunction} not defined`,
        );
        continue;
      }
      functions.push(analyzeFunction(namespace, entry.lua, fn, index));
    }
  }
  functions.sort(
    (a, b) =>
      a.namespace.localeCompare(b.namespace) ||
      a.name.localeCompare(b.name) ||
      a.file.localeCompare(b.file),
  );
  const sortedUnion = (map: Map<string, string[]>) =>
    new Map(
      [...map]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => [key, union(values).sort()]),
    );
  return {
    functions,
    constants: sortedUnion(out.constants),
    constantFiles: sortedUnion(out.constantFiles),
    unresolved: union(out.unresolved).sort(),
  };
}

export function readBindingsForTarget(targetId: string): BindingExtraction {
  const target = loadApiTargets().find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown API target ${targetId}`);
  if (target.source !== null) throw new Error(`target ${targetId} has no vendored engine bindings`);
  return extractBindings(join(bindingsDir(target), "engine"));
}

const registeredConstantCache = new Map<string, ReadonlySet<string>>();

// The `<namespace>.<NAME>` of every constant the target's vendored engine
// registers, or undefined for a target with no vendored bindings (a ref-doc
// target), which leaves the undocumented-constant back-fill ungated.
export function registeredConstantFqns(target: ApiTarget): ReadonlySet<string> | undefined {
  if ((target.source ?? null) !== null) return undefined;
  let fqns = registeredConstantCache.get(target.id);
  if (!fqns) {
    const constants = readBindingsForTarget(target.id).constants;
    fqns = new Set(
      [...constants].flatMap(([namespace, names]) => names.map((name) => `${namespace}.${name}`)),
    );
    registeredConstantCache.set(target.id, fqns);
  }
  return fqns;
}
