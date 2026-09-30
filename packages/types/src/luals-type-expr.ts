/**
 * The structural half of the LuaLS type-expression grammar (unions, `?`, `T[]`,
 * grouping parentheses, `fun(...)`, `table<K, V>`, inline records, string, numeric
 * and boolean literals), shared by the engine lane (`emit-dts.ts`
 * `defaultMapType`) and the library lane
 * (`packages/library-types/scripts/map-luals-types.ts`). Pure and deterministic.
 *
 * Every name that is not structure — `integer`, `table`, `function`, `...`,
 * `vmath.vector3`, `druid.component` — is a leaf handed to the caller's
 * `resolveLeaf`, so each lane keeps its own vocabulary and precedence. A leaf the
 * resolver answers `undefined` for lowers to `unknown` and is reported in
 * `unknowns`.
 */

import { luaMultiReturn } from "./library-signature";

export type LualsLeafResolver = (leaf: string) => string | undefined;

/**
 * Who supplies the value a type describes: `"input"` for a slot the caller fills
 * (a parameter, a field of a table passed as one, a callback's return), `"output"`
 * for one the engine or library hands back (a return, a property read back, a
 * callback's parameters). Only `"input"` widens a string-keyed `table<K, V>` to also
 * accept an object literal, so `"output"` renders exactly what an unpositioned
 * mapping does.
 */
export type LualsPosition = "input" | "output";

export interface LualsMapResult {
  ts: string;
  unknowns: string[];
}

/**
 * LuaLS's throwaway param name `_` declares no type at all, so lowering it to
 * `unknown` loses nothing an author wrote. An untyped `self` or `ctx` *is* an
 * upstream omission and stays recorded.
 */
const LUALS_THROWAWAY_PARAM = "_";
export const LUALS_VARARG_TOKEN = "...";

const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;
const TUPLE_KEY = /^\[(\d+)\](\??)$/;
const INDEX_KEY = /^\[(.+)\]\??$/;

/**
 * Split `s` on every top-level occurrence of the single-character `sep`, honoring
 * bracket depth and double-quoted string literals so a separator nested inside
 * `<...>`, `(...)`, `[...]`, `{...}`, or a `"..."` literal does not split.
 */
export function splitTopLevel(s: string, sep: string): string[] {
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

/** Index of the matching close bracket for the opener at `open`, or -1 if unbalanced. */
export function matchBracket(s: string, open: number): number {
  const closers: Record<string, string> = { "<": ">", "(": ")", "[": "]", "{": "}" };
  const want = closers[s[open] as string];
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

function isWrappedInParens(s: string): boolean {
  return s.startsWith("(") && matchBracket(s, 0) === s.length - 1;
}

/** True when a top-level `=>` (an arrow function type) appears in a mapped result. */
function hasTopLevelArrow(tsExpr: string): boolean {
  let depth = 0;
  for (let i = 0; i + 1 < tsExpr.length; i++) {
    const c = tsExpr[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === "=" && tsExpr[i + 1] === ">") return true;
  }
  return false;
}

/** A union member needs parentheses when it is itself a function type. */
function wrapForUnion(tsExpr: string): string {
  return hasTopLevelArrow(tsExpr) ? `(${tsExpr})` : tsExpr;
}

/** An array element needs parentheses when it is a union, a function, or an object. */
function needsArrayParens(tsExpr: string): boolean {
  return (
    splitTopLevel(tsExpr, "|").length > 1 || hasTopLevelArrow(tsExpr) || tsExpr.startsWith("{")
  );
}

/**
 * `LuaTable<K, V>` constrains `K` to `AnyNotNil`, so a mapped key that admits nil is
 * not a compilable key however faithfully it renders the annotation. LuaLS `any` maps
 * to `unknown` everywhere else, and `nil` to `undefined`; in key position both fail the
 * constraint and `tsc` rejects the emitted declaration. `AnyNotNil` is the faithful
 * target — "any non-nil Lua value" is exactly what a table key may be — so drop a nil
 * arm from a key union and fall back to `AnyNotNil` when nothing survives.
 */
function luaTableKey(mapped: string): string {
  const arms = splitTopLevel(mapped, "|")
    .map((arm) => arm.trim())
    .filter((arm) => arm !== "undefined" && arm !== "unknown");
  return arms.length === 0 ? "AnyNotNil" : arms.join(" | ");
}

/**
 * TSTL's `LuaTable` is built with `new LuaTable()`, so an object literal is not
 * assignable to it although both compile to the same Lua table. A caller-supplied
 * table whose key admits `string` also takes `Record<string, V>`; a `Hash` or
 * numeric key cannot be spelled as an object literal's key, so it stays `LuaTable`.
 */
function acceptsObjectLiteral(key: string): boolean {
  return splitTopLevel(key, "|").some((arm) => arm.trim() === "string");
}

interface Walk {
  resolveLeaf: LualsLeafResolver;
  unknowns: string[];
  position: LualsPosition;
}

/**
 * The mapped `(params)` list and `ret` type of a `fun(...)` token, shared by the
 * arrow form and the colon-return call signature. A return list wrapped in one pair
 * of parentheses (`fun(): (a, b)`) is the same multi-return as the bare `fun(): a, b`.
 */
function functionParts(token: string, walk: Walk): { paramList: string; ret: string } {
  const open = token.indexOf("(");
  const close = matchBracket(token, open);
  const paramsStr = token.slice(open + 1, close).trim();
  const afterClose = token.slice(close + 1).trim();

  const params = paramsStr === "" ? [] : splitTopLevel(paramsStr, ",");
  // A callback's params are values the engine hands over. A returned or stored
  // function's params keep `"output"` too: widening them would reject a callback
  // with the narrower `LuaTable` param a caller assigns to a writable field.
  const paramWalk: Walk = { ...walk, position: "output" };
  const paramList = params
    .map((raw) => raw.trim())
    .map((part) => {
      if (part.startsWith(LUALS_VARARG_TOKEN)) {
        const after = part.slice(3).trim();
        const element = after.startsWith(":")
          ? mapToken(after.slice(1).trim(), paramWalk)
          : "unknown";
        return `...args: ${needsArrayParens(element) ? `(${element})[]` : `${element}[]`}`;
      }
      const colon = splitTopLevel(part, ":");
      if (colon.length < 2) {
        if (part !== LUALS_THROWAWAY_PARAM) walk.unknowns.push(part);
        return `${part}: unknown`;
      }
      const name = colon[0]?.trim() ?? "";
      const typeExpr = colon.slice(1).join(":").trim();
      return `${name}: ${mapToken(typeExpr, paramWalk)}`;
    })
    .join(", ");

  let ret = "void";
  if (afterClose.startsWith(":")) {
    const retStr = afterClose.slice(1).trim();
    let retTokens = retStr === "" ? [] : splitTopLevel(retStr, ",").map((r) => r.trim());
    if (retTokens.length === 1 && isWrappedInParens(retStr)) {
      const grouped = splitTopLevel(retStr.slice(1, -1), ",").map((r) => r.trim());
      if (grouped.length > 1) retTokens = grouped;
    }
    if (retTokens.length === 1) {
      ret = mapToken(retTokens[0] as string, walk);
    } else if (retTokens.length > 1) {
      const restTail = retTokens.at(-1) === LUALS_VARARG_TOKEN;
      ret = luaMultiReturn(
        retTokens.map((r) => mapToken(r, walk)),
        restTail,
      );
    }
  }
  return { paramList, ret };
}

/**
 * An inline record. A numeric `[N]` key is a tuple slot and renders as the property
 * key `N`. Any other `[K]` key is an index signature; TypeScript accepts only
 * `string`/`number` there, so it renders as a `string` index when `K` maps to
 * `string` and a `number` index otherwise (the upstream instance keys a numeric
 * enum), intersected with the named entries. The key's own leaves never reach the
 * output, so they are not reported.
 */
function mapObject(token: string, walk: Walk): string {
  const inner = token.slice(1, -1).trim();
  if (inner === "") return "{}";
  const entries: string[] = [];
  const indexes: string[] = [];
  for (const part of splitTopLevel(inner, ",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const colon = splitTopLevel(trimmed, ":");
    const key = colon[0]?.trim() ?? "";
    const value = mapToken(colon.slice(1).join(":").trim(), walk);
    const tuple = TUPLE_KEY.exec(key);
    if (tuple !== null) {
      entries.push(`${tuple[1]}${tuple[2]}: ${value}`);
      continue;
    }
    const index = INDEX_KEY.exec(key);
    if (index !== null) {
      const keyType = mapToken(index[1] as string, { ...walk, unknowns: [] });
      indexes.push(`{ [key: ${keyType === "string" ? "string" : "number"}]: ${value} }`);
      continue;
    }
    entries.push(`${key}: ${value}`);
  }
  const parts = entries.length > 0 || indexes.length === 0 ? [`{ ${entries.join("; ")} }`] : [];
  return [...parts, ...indexes].join(" & ");
}

function mapToken(raw: string, walk: Walk): string {
  let token = raw.trim();

  // Strip a redundant pair of outer parentheses (LuaLS grouping) so `(a | b)[]`
  // reaches the union handler rather than falling through to a leaf lookup.
  while (isWrappedInParens(token)) {
    token = token.slice(1, -1).trim();
  }

  if (token === "") return "unknown";

  // A `fun(...)` whose return follows the `)` keeps its return-type `|` and `?` inside
  // the function; splitting the union first would cut `fun(): a|b` into `(fun) | b`, and
  // peeling the optional suffix first would turn `fun(): number?` — a function with an
  // optional *return* — into an optional function. The whole-function optional is spelled
  // with explicit parentheses, `(fun(): number)?`, which does not match here.
  // `fun()|nil` (a `|` right after the `)`) falls through to the union split.
  if (/^fun\s*\(/.test(token)) {
    const close = matchBracket(token, token.indexOf("("));
    const afterClose = close === -1 ? "" : token.slice(close + 1).trim();
    if (close !== -1 && afterClose.startsWith(":")) {
      return mapFunction(token, walk);
    }
  }

  // Optional suffix.
  if (token.length > 1 && token.endsWith("?")) {
    const base = mapToken(token.slice(0, -1), walk);
    const members = splitTopLevel(base, "|").map((m) => m.trim());
    return members.includes("undefined") ? base : `${wrapForUnion(base)} | undefined`;
  }

  // Top-level union.
  const unionParts = splitTopLevel(token, "|");
  if (unionParts.length > 1) {
    return unionParts.map((p) => wrapForUnion(mapToken(p.trim(), walk))).join(" | ");
  }

  // Trailing array.
  if (token.endsWith("[]")) {
    const element = mapToken(token.slice(0, -2), walk);
    return needsArrayParens(element) ? `(${element})[]` : `${element}[]`;
  }

  if (/^fun\s*\(/.test(token)) return mapFunction(token, walk);

  if (token.startsWith("table<") && token.endsWith(">")) {
    const args = splitTopLevel(token.slice(6, -1), ",").map((a) => mapToken(a.trim(), walk));
    if (args.length > 0) args[0] = luaTableKey(args[0] as string);
    const table = `LuaTable<${args.join(", ")}>`;
    const [key, value] = args;
    if (walk.position === "input" && args.length === 2 && acceptsObjectLiteral(key as string)) {
      return `${table} | Record<string, ${value}>`;
    }
    return table;
  }

  if (token.startsWith("{") && token.endsWith("}")) return mapObject(token, walk);

  if (token.startsWith('"') && token.endsWith('"')) return token;
  if (NUMERIC_LITERAL.test(token) || token === "true" || token === "false") return token;

  const leaf = walk.resolveLeaf(token);
  if (leaf !== undefined) return leaf;
  walk.unknowns.push(token);
  return "unknown";
}

function mapFunction(token: string, walk: Walk): string {
  const { paramList, ret } = functionParts(token, walk);
  return `(${paramList}) => ${ret}`;
}

/** Map one raw LuaLS type expression to a TypeScript type string. */
export function mapLualsExpression(
  token: string,
  resolveLeaf: LualsLeafResolver,
  position: LualsPosition = "output",
): LualsMapResult {
  const walk: Walk = { resolveLeaf, unknowns: [], position };
  return { ts: mapToken(token, walk), unknowns: walk.unknowns };
}

/**
 * Map a `fun(...)` expression to a TypeScript **call signature** — the colon-return
 * form `(params): ret` an interface uses to become callable, not the `=>` arrow a
 * field or param function type takes. Throws on a non-`fun` token.
 */
export function mapLualsCallSignatureExpression(
  token: string,
  resolveLeaf: LualsLeafResolver,
  position: LualsPosition = "output",
): LualsMapResult {
  const trimmed = token.trim();
  if (!/^fun\s*\(/.test(trimmed)) {
    throw new Error(`mapLualsCallSignature: expected a "fun(...)" token, got "${token}".`);
  }
  const walk: Walk = { resolveLeaf, unknowns: [], position };
  const { paramList, ret } = functionParts(trimmed, walk);
  return { ts: `(${paramList}): ${ret}`, unknowns: walk.unknowns };
}
