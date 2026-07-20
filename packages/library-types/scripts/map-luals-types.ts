/**
 * Turns the raw LuaLS type-expression tokens `parse-luals.ts` preserves verbatim
 * (`integer`, `string?`, `fun(self):number`, `table<K,V>`, `druid.component`,
 * `vmath.vector3`) into TypeScript type strings. Pure and deterministic: mapping a
 * token has no I/O and depends only on the token and the supplied `MapContext`.
 *
 * It mirrors two disciplines from the ts-defold front-end
 * (`sync-library-types.ts`): a `vmath.*`-namespaced token with no rename is a hard
 * error (a missing core mapping must surface, never lower to a silent `any`); any
 * other unresolved reference lowers to `unknown` and is recorded so a fidelity
 * report can show the gap. Scope is mapping only — no declaration text, no
 * identifier sanitization; a known class reference resolves to its model name
 * verbatim and the emitter sanitizes it later.
 */

import { CORE_TYPE_RENAMES } from "./sync-library-types";

export interface MapContext {
  knownNames: ReadonlySet<string>;
  typeRenames: Readonly<Record<string, string>>;
}

export interface MapResult {
  ts: string;
  unknowns: string[];
}

/**
 * A child `MapContext` with each generic parameter `name` added as an identity
 * rename and a known name, so a bare `T` maps to `T` instead of lowering to
 * `unknown`. Returns the same ctx when there are no generics. Shared by the emitter
 * (declaration text) and the fidelity report (coverage) so both scope generics
 * identically.
 */
export function scopeGenerics(ctx: MapContext, generics: readonly { name: string }[]): MapContext {
  if (generics.length === 0) return ctx;
  const knownNames = new Set(ctx.knownNames);
  const typeRenames = { ...ctx.typeRenames };
  for (const generic of generics) {
    knownNames.add(generic.name);
    typeRenames[generic.name] = generic.name;
  }
  return { knownNames, typeRenames };
}

const SCALARS: Readonly<Record<string, string>> = {
  integer: "number",
  number: "number",
  string: "string",
  boolean: "boolean",
  nil: "undefined",
  any: "unknown",
};

/**
 * Split `s` on every top-level occurrence of the single-character `sep`, honoring
 * bracket depth and double-quoted string literals so a separator nested inside
 * `<...>`, `(...)`, `[...]`, `{...}`, or a `"..."` literal does not split.
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

/** Index of the matching close bracket for the opener at `open`, or -1 if unbalanced. */
function matchBracket(s: string, open: number): number {
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

function mapFunction(token: string, ctx: MapContext, unknowns: string[]): string {
  const open = token.indexOf("(");
  const close = matchBracket(token, open);
  const paramsStr = token.slice(open + 1, close).trim();
  const afterClose = token.slice(close + 1).trim();

  const params = paramsStr === "" ? [] : splitTopLevel(paramsStr, ",");
  const paramList = params
    .map((raw) => raw.trim())
    .map((part) => {
      if (part.startsWith("...")) {
        const after = part.slice(3).trim();
        let element: string;
        if (after.startsWith(":")) {
          element = mapToken(after.slice(1).trim(), ctx, unknowns);
        } else {
          element = "unknown";
          unknowns.push("...");
        }
        return `...args: ${needsArrayParens(element) ? `(${element})[]` : `${element}[]`}`;
      }
      const colon = splitTopLevel(part, ":");
      if (colon.length < 2) {
        // Untyped param (`self`, `_`, `ctx`): a recorded gap, not a silent `any`.
        unknowns.push(part);
        return `${part}: unknown`;
      }
      const name = colon[0]?.trim() ?? "";
      const typeExpr = colon.slice(1).join(":").trim();
      const mapped = mapToken(typeExpr, ctx, unknowns);
      return `${name}: ${mapped}`;
    })
    .join(", ");

  let ret = "void";
  if (afterClose.startsWith(":")) {
    const retStr = afterClose.slice(1).trim();
    const retTokens = retStr === "" ? [] : splitTopLevel(retStr, ",").map((r) => r.trim());
    if (retTokens.length === 1) {
      ret = mapToken(retTokens[0] as string, ctx, unknowns);
    } else if (retTokens.length > 1) {
      const inner = retTokens.map((r) => mapToken(r, ctx, unknowns)).join(", ");
      ret = `LuaMultiReturn<[${inner}]>`;
    }
  }
  return `(${paramList}) => ${ret}`;
}

function mapObject(token: string, ctx: MapContext, unknowns: string[]): string {
  const inner = token.slice(1, -1).trim();
  if (inner === "") return "{}";
  const entries = splitTopLevel(inner, ",")
    .map((raw) => raw.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const colon = splitTopLevel(part, ":");
      const key = colon[0]?.trim() ?? "";
      const typeExpr = colon.slice(1).join(":").trim();
      return `${key}: ${mapToken(typeExpr, ctx, unknowns)}`;
    });
  return `{ ${entries.join("; ")} }`;
}

function mapToken(raw: string, ctx: MapContext, unknowns: string[]): string {
  let token = raw.trim();

  // Strip a redundant pair of outer parentheses (LuaLS grouping) so `(a | b)[]`
  // reaches the union handler rather than falling through to a reference lookup.
  while (token.startsWith("(") && matchBracket(token, 0) === token.length - 1) {
    token = token.slice(1, -1).trim();
  }

  if (token === "") return "unknown";

  // Optional suffix.
  if (token.length > 1 && token.endsWith("?")) {
    const base = mapToken(token.slice(0, -1), ctx, unknowns);
    const members = splitTopLevel(base, "|").map((m) => m.trim());
    return members.includes("undefined") ? base : `${base} | undefined`;
  }

  // A `fun(...)` whose return follows the `)` keeps its return-type `|` inside the
  // function; splitting the union first would cut `fun(): a|b` into `(fun) | b`.
  // `fun()|nil` (a `|` right after the `)`) falls through to the union split.
  if (/^fun\s*\(/.test(token)) {
    const close = matchBracket(token, token.indexOf("("));
    const afterClose = close === -1 ? "" : token.slice(close + 1).trim();
    if (close !== -1 && afterClose.startsWith(":")) {
      return mapFunction(token, ctx, unknowns);
    }
  }

  // Top-level union.
  const unionParts = splitTopLevel(token, "|");
  if (unionParts.length > 1) {
    return unionParts.map((p) => wrapForUnion(mapToken(p.trim(), ctx, unknowns))).join(" | ");
  }

  // Trailing array.
  if (token.endsWith("[]")) {
    const element = mapToken(token.slice(0, -2), ctx, unknowns);
    return needsArrayParens(element) ? `(${element})[]` : `${element}[]`;
  }

  // Function.
  if (/^fun\s*\(/.test(token)) return mapFunction(token, ctx, unknowns);

  // Table.
  if (token === "table") return "LuaTable";
  if (token.startsWith("table<") && token.endsWith(">")) {
    const args = splitTopLevel(token.slice(6, -1), ",").map((a) =>
      mapToken(a.trim(), ctx, unknowns),
    );
    return `LuaTable<${args.join(", ")}>`;
  }

  // Inline object.
  if (token.startsWith("{") && token.endsWith("}")) return mapObject(token, ctx, unknowns);

  // String literal — passthrough.
  if (token.startsWith('"') && token.endsWith('"')) return token;

  // Scalars.
  const scalar = SCALARS[token];
  if (scalar !== undefined) return scalar;

  // Reference-token precedence: per-target rename, core rename, loud-fail on an
  // unmapped `vmath.*`, known model reference verbatim, else recorded `unknown`.
  const override = ctx.typeRenames[token];
  if (override !== undefined) return override;
  const core = CORE_TYPE_RENAMES[token];
  if (core !== undefined) return core;
  if (token.startsWith("vmath.")) {
    throw new Error(
      `luals type mapper: unmapped Defold core token "${token}" - extend CORE_TYPE_RENAMES or the target's typeRenames.`,
    );
  }
  if (ctx.knownNames.has(token)) return token;
  unknowns.push(token);
  return "unknown";
}

/** Map one raw LuaLS type token to a TypeScript type string. */
export function mapLualsType(token: string, ctx: MapContext): MapResult {
  const unknowns: string[] = [];
  const ts = mapToken(token, ctx, unknowns);
  return { ts, unknowns };
}

/**
 * When `types` is exactly one `fun(self: <selfTypeName>, ...)` token — optionally
 * unioned with `nil` — whose first parameter is `self` typed as the enclosing
 * interface's own model name, return the function's raw return tokens (an empty
 * array for a `void`/no-return hook). Returns `null` for every other shape: a data
 * field, a non-`fun` type, an untyped `self`, or a `self` typed as a *different*
 * interface. Reuses the same bracket-aware split/match as the mapper so nested
 * commas and colons inside a param type never mis-split.
 */
export function matchSelfHookField(
  types: readonly string[],
  selfTypeName: string,
): string[] | null {
  if (types.length !== 1) return null;
  const raw = (types[0] as string).trim();
  const members = splitTopLevel(raw, "|")
    .map((member) => member.trim())
    .filter((member) => member !== "" && member !== "nil");
  if (members.length !== 1) return null;
  const fun = members[0] as string;
  if (!/^fun\s*\(/.test(fun)) return null;
  const open = fun.indexOf("(");
  const close = matchBracket(fun, open);
  if (close === -1) return null;
  const paramsStr = fun.slice(open + 1, close).trim();
  const params = paramsStr === "" ? [] : splitTopLevel(paramsStr, ",");
  const first = (params[0]?.trim() ?? "").length > 0 ? splitTopLevel(params[0] as string, ":") : [];
  if (first.length < 2) return null;
  if ((first[0] as string).trim() !== "self") return null;
  if (first.slice(1).join(":").trim() !== selfTypeName) return null;
  const afterClose = fun.slice(close + 1).trim();
  if (!afterClose.startsWith(":")) return [];
  const retStr = afterClose.slice(1).trim();
  return retStr === "" ? [] : splitTopLevel(retStr, ",").map((token) => token.trim());
}
