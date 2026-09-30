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

import {
  LUALS_VARARG_TOKEN,
  type LualsLeafResolver,
  mapLualsCallSignatureExpression,
  mapLualsExpression,
  matchBracket,
  splitTopLevel,
} from "@defold-typescript/types";
import { CORE_TYPE_RENAMES } from "./sync-library-types";

export { LUALS_VARARG_TOKEN };

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
 * LuaLS's bare `function` — any callable, signature unspecified. Params are `any[]`
 * because under `strictFunctionTypes` an `unknown[]` rest would reject every concrete
 * callback a consumer passes; the return stays `unknown` because return position is
 * covariant, so `any` there would only leak unchecked values into call sites.
 */
const CALLABLE_UNSPECIFIED = "(...args: any[]) => unknown";

/**
 * The library lane's leaf vocabulary, handed to the shared grammar in
 * `@defold-typescript/types`. Bare `table` and `function` are leaves there, so a
 * `function[]`, `function|nil`, or `fun(cb: function)` routes through the composite
 * branches first.
 *
 * LuaLS's bare `...` in return position is a placeholder that declares no type at all,
 * so lowering it to `unknown` loses nothing an author wrote — the same reasoning that
 * already exempts `any` from the fallback count. It is not a `SCALARS` entry, which
 * maps real Lua type names.
 */
function leafResolver(ctx: MapContext): LualsLeafResolver {
  return (token) => {
    if (token === "table") return "LuaTable";
    if (token === "function") return CALLABLE_UNSPECIFIED;
    if (token === LUALS_VARARG_TOKEN) return "unknown";
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
    return undefined;
  };
}

/** Map one raw LuaLS type token to a TypeScript type string. */
export function mapLualsType(token: string, ctx: MapContext): MapResult {
  return mapLualsExpression(token, leafResolver(ctx));
}

/**
 * Map a `fun(...)` token (a class `@overload`) to a TypeScript **call signature** —
 * the colon-return form `(params): ret` an interface uses to become callable, not
 * the `=>` arrow a field/param function type takes. Shares the exact param/return
 * computation as the arrow form, so nested callback params and multi-returns map
 * identically. Throws on a non-`fun` token; the parser only ever records `fun(...)`
 * overloads, so this guards a programming error rather than user input.
 */
export function mapLualsCallSignature(token: string, ctx: MapContext): MapResult {
  return mapLualsCallSignatureExpression(token, leafResolver(ctx));
}

/**
 * When `types` is exactly one `fun(self: <selfTypeName>, ...)` token — optionally
 * unioned with `nil` — whose first parameter is `self` typed as the enclosing
 * interface's own model name, return the function's raw return tokens (an empty
 * array for a `void`/no-return hook). Returns `null` for every other shape: a data
 * field, a non-`fun` type, an untyped `self`, or a `self` typed as a *different*
 * interface. Reuses the same bracket-aware split/match as the mapper so nested
 * commas and colons inside a param type never mis-split.
 *
 * The `fun` is isolated through its params `)` before the return is read, so a
 * return union or nullable return (which also sits at bracket depth 0, after the
 * `)`) survives instead of being mis-split as an outer `|nil` — the same
 * ordering rule as the mapper's `fun(...)` return-union handling.
 */
export function matchSelfHookField(
  types: readonly string[],
  selfTypeName: string,
): string[] | null {
  if (types.length !== 1) return null;
  const raw = (types[0] as string).trim();
  const members = splitTopLevel(raw, "|").map((member) => member.trim());
  const funIndex = members.findIndex((member) => /^fun\s*\(/.test(member));
  if (funIndex === -1) return null;
  // Anything unioned before the fun may only be a bare outer nullable.
  if (members.slice(0, funIndex).some((member) => member !== "nil")) return null;
  // Rejoin from the fun rightward so a return union or nullable stays whole.
  const fun = members.slice(funIndex).join("|");
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
  if (afterClose === "") return [];
  if (afterClose.startsWith(":")) {
    const retStr = afterClose.slice(1).trim();
    return retStr === "" ? [] : splitTopLevel(retStr, ",").map((token) => token.trim());
  }
  // Anything else after the params `)` must be an outer `| nil` (whole hook optional).
  const outer = splitTopLevel(afterClose, "|").map((member) => member.trim());
  return outer.every((member) => member === "" || member === "nil") ? [] : null;
}
