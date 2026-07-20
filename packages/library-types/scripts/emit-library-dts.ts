/**
 * Renders a `LibraryModel` (from `parse-luals.ts`) into a committed `.d.ts`: a
 * single `declare module '<moduleId>' { ... }` block of plain `interface`s, `type`
 * aliases, and `export function`s, mapping every member type through the shipped
 * `mapLualsType`. Pure and deterministic — output depends only on the model and the
 * options — so the `--emit` CLI arm and its golden round-trip test agree
 * byte-for-byte.
 *
 * A sibling to `@defold-typescript/types`' `emit-dts.ts`, not an extension of it:
 * that emitter is `ApiModule`-shaped and Defold-specific, whereas `LibraryModel` is
 * a different OOP shape. Only `renderDocComment`, `TS_RESERVED_NAMES`, and
 * `TS_IDENTIFIER` are reused from the types surface.
 *
 * Renders interface/method generic parameters and `extends` clauses: each generic
 * `name` is scoped into a child `MapContext` (an identity rename) so a bare `T`
 * resolves to `T` instead of lowering to `unknown`, constraints and `extends`
 * targets map through the existing rename map, and an `extends` clause is emitted
 * only for parents that resolve to a declared interface.
 */

import {
  luaMultiReturn,
  renderDocComment,
  TS_IDENTIFIER,
  TS_RESERVED_NAMES,
  varargElementType,
} from "@defold-typescript/types";
import {
  type MapContext,
  mapLualsType,
  matchSelfHookField,
  scopeGenerics,
} from "./map-luals-types";
import type {
  LibraryAlias,
  LibraryGeneric,
  LibraryInterface,
  LibraryMethod,
  LibraryModel,
  LibraryParam,
} from "./parse-luals";

export interface EmitLibraryOptions {
  moduleId: string;
  typeRenames?: Record<string, string>;
}

const INDENT = "\t";

/** A model type name (dotted like `druid.button`) reduced to a legal TS identifier. */
export function sanitizeTypeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

/**
 * An interface/type member key: bare when it is a plain identifier that is not a
 * reserved word, otherwise a quoted string literal so a name like `default` or
 * `new` stays an ordinary member instead of becoming a syntax error (or, for
 * `new`, a construct signature).
 */
function memberKey(name: string): string {
  return TS_IDENTIFIER.test(name) && !TS_RESERVED_NAMES.has(name) ? name : JSON.stringify(name);
}

/** A parameter name coerced to a legal, non-reserved binding form. */
function safeParamName(name: string, index: number): string {
  if (!TS_IDENTIFIER.test(name)) return `arg${index}`;
  return TS_RESERVED_NAMES.has(name) ? `${name}_` : name;
}

export function mapTypes(types: readonly string[], ctx: MapContext): string {
  if (types.length === 0) return "unknown";
  return types.map((token) => mapLualsType(token, ctx).ts).join(" | ");
}

/** A generic parameter list `<A extends C, B>`, or `""` when there are none. */
export function renderGenericParams(generics: readonly LibraryGeneric[], ctx: MapContext): string {
  if (generics.length === 0) return "";
  const params = generics.map((generic) => {
    if (generic.constraint === undefined || generic.constraint === "") return generic.name;
    const mapped = mapTypes([generic.constraint], ctx);
    // An undeclared constraint lowers to `unknown`; drop it (mirror `renderExtends`'s
    // declared-only filter) rather than emit a vacuous `<T extends unknown>`.
    return mapped === "unknown" ? generic.name : `${generic.name} extends ${mapped}`;
  });
  return `<${params.join(", ")}>`;
}

/** The TS return type for a self-hook field lowered to an optional method. */
function renderHookReturn(returnTokens: readonly string[], ctx: MapContext): string {
  if (returnTokens.length === 0) return "void";
  if (returnTokens.length === 1) return mapTypes([returnTokens[0] as string], ctx);
  return luaMultiReturn(returnTokens.map((token) => mapTypes([token], ctx)));
}

/**
 * An ` extends X, Y` clause built from `iface.extends` split on commas, keeping only
 * parents that name a declared interface (so no `extends unknown` is ever emitted),
 * mapped through the rename map; `""` when none survive.
 */
function renderExtends(
  iface: LibraryInterface,
  ctx: MapContext,
  interfaceNames: ReadonlySet<string>,
): string {
  if (!iface.extends) return "";
  const parents = iface.extends
    .split(",")
    .map((name) => name.trim())
    .filter((name) => interfaceNames.has(name))
    .map((name) => mapTypes([name], ctx));
  return parents.length > 0 ? ` extends ${parents.join(", ")}` : "";
}

function renderParams(params: readonly LibraryParam[], ctx: MapContext): string {
  return params
    .map((param, index) => {
      const mapped = mapTypes(param.types, ctx);
      if (param.isVararg) {
        return `...args: ${varargElementType(mapped)}`;
      }
      const optional = param.isOptional ? "?" : "";
      return `${safeParamName(param.name, index)}${optional}: ${mapped}`;
    })
    .join(", ");
}

function renderReturn(returns: readonly LibraryParam[], ctx: MapContext): string {
  if (returns.length === 0) return "void";
  if (returns.length === 1) return mapTypes((returns[0] as LibraryParam).types, ctx);
  return luaMultiReturn(returns.map((ret) => mapTypes(ret.types, ctx)));
}

function pushDoc(lines: string[], summary: string, indent: string): void {
  for (const line of renderDocComment({ summary })) lines.push(`${indent}${line}`);
}

function renderAlias(alias: LibraryAlias, ctx: MapContext): string[] {
  const lines: string[] = [];
  pushDoc(lines, alias.doc, INDENT);
  lines.push(`${INDENT}type ${sanitizeTypeName(alias.name)} = ${mapTypes(alias.types, ctx)};`);
  return lines;
}

function renderInterface(
  iface: LibraryInterface,
  ctx: MapContext,
  interfaceNames: ReadonlySet<string>,
): string[] {
  const lines: string[] = [];
  pushDoc(lines, iface.brief, INDENT);
  const ifaceCtx = scopeGenerics(ctx, iface.generics);
  const params = renderGenericParams(iface.generics, ifaceCtx);
  const extendsClause = renderExtends(iface, ifaceCtx, interfaceNames);
  lines.push(`${INDENT}interface ${sanitizeTypeName(iface.name)}${params}${extendsClause} {`);
  const body = INDENT + INDENT;
  for (const field of iface.fields) {
    // A base's self-receiving lifecycle hook is emitted as a permissive optional
    // method (`name?(...args: any[]): ret`) so a concrete subinterface's refined
    // override stays assignable under `extends`; strict function-field variance
    // would reject it.
    const hookReturns = matchSelfHookField(field.types, iface.name);
    if (hookReturns !== null) {
      pushDoc(lines, field.doc, body);
      lines.push(
        `${body}${memberKey(field.name)}?(...args: any[]): ${renderHookReturn(hookReturns, ifaceCtx)};`,
      );
      continue;
    }
    const optional = field.isOptional ? "?" : "";
    lines.push(`${body}${memberKey(field.name)}${optional}: ${mapTypes(field.types, ifaceCtx)};`);
  }
  for (const method of iface.methods) {
    pushDoc(lines, method.brief, body);
    const methodCtx = scopeGenerics(ifaceCtx, method.generics);
    const methodParams = renderGenericParams(method.generics, methodCtx);
    lines.push(
      `${body}${memberKey(method.name)}${methodParams}(${renderParams(
        method.params,
        methodCtx,
      )}): ${renderReturn(method.returns, methodCtx)};`,
    );
  }
  lines.push(`${INDENT}}`);
  return lines;
}

function renderModuleFunction(fn: LibraryMethod, ctx: MapContext): string[] {
  const lines: string[] = [];
  pushDoc(lines, fn.brief, INDENT);
  const fnCtx = scopeGenerics(ctx, fn.generics);
  const genericParams = renderGenericParams(fn.generics, fnCtx);
  const params = renderParams(fn.params, fnCtx);
  const signature = `${genericParams}(${params ? `this: void, ${params}` : "this: void"}): ${renderReturn(
    fn.returns,
    fnCtx,
  )}`;
  const isReserved = TS_RESERVED_NAMES.has(fn.name) || !TS_IDENTIFIER.test(fn.name);
  if (isReserved) {
    // A reserved call name (`new`, `delete`) is illegal as a `function` identifier,
    // so it is declared under an internal alias and re-exported under its real name.
    const internal = `${sanitizeTypeName(fn.name)}_`;
    lines.push(`${INDENT}export function ${internal}${signature};`);
    lines.push(`${INDENT}export { ${internal} as ${fn.name} };`);
  } else {
    lines.push(`${INDENT}export function ${fn.name}${signature};`);
  }
  return lines;
}

/**
 * The `MapContext` a library model maps every type token through: each interface
 * and alias name is a known reference plus a sanitized rename (dotted `druid.button`
 * -> `druid_button`), layered over the caller's `typeRenames`. Shared by the emitter
 * (declaration text) and the api-doc lowering so both resolve model references
 * identically — the invariant that keeps `api-doc/<ns>.json` byte-equivalent to
 * `generated/<ns>.d.ts`.
 */
export function buildModelContext(
  model: LibraryModel,
  typeRenames?: Record<string, string>,
): MapContext {
  const declaredNames = [
    ...model.interfaces.map((iface) => iface.name),
    ...model.aliases.map((alias) => alias.name),
  ];
  const nameRenames: Record<string, string> = {};
  for (const name of declaredNames) nameRenames[name] = sanitizeTypeName(name);
  return {
    knownNames: new Set(declaredNames),
    typeRenames: { ...(typeRenames ?? {}), ...nameRenames },
  };
}

/**
 * Emit the `.d.ts` text for one library model. References to the model's own
 * interfaces and aliases resolve to their sanitized declaration names via a rename
 * map layered over the caller's `typeRenames`; unresolved references lower to
 * `unknown` inside `mapLualsType` exactly as the fidelity report records them.
 */
export function emitLibraryDeclarations(model: LibraryModel, opts: EmitLibraryOptions): string {
  const ctx = buildModelContext(model, opts.typeRenames);

  const interfaceNames = new Set(model.interfaces.map((iface) => iface.name));
  const out: string[] = ["/** @noResolution */", `declare module '${opts.moduleId}' {`];
  for (const alias of model.aliases) out.push(...renderAlias(alias, ctx));
  for (const iface of model.interfaces) out.push(...renderInterface(iface, ctx, interfaceNames));
  for (const fn of model.moduleFunctions) out.push(...renderModuleFunction(fn, ctx));
  out.push("}");
  return `${out.join("\n")}\n`;
}
