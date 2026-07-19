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
 * Deferred to `luals-generics-inheritance`: interface/method generic parameters and
 * `extends` clauses. This slice ignores `interface.generics`, `interface.extends`,
 * and `method.generics`, emitting bare `interface X { ... }`.
 */

import { renderDocComment, TS_IDENTIFIER, TS_RESERVED_NAMES } from "@defold-typescript/types";
import { type MapContext, mapLualsType } from "./map-luals-types";
import type {
  LibraryAlias,
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
function sanitizeTypeName(name: string): string {
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

/** True when a top-level `|` (a union) appears in a mapped type, honoring bracket depth. */
function hasTopLevelUnion(ts: string): boolean {
  let depth = 0;
  for (let i = 0; i < ts.length; i++) {
    const c = ts[i];
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === "|") return true;
  }
  return false;
}

/** An array element needs parentheses when it is a union, a function, or an object. */
function needsArrayParens(ts: string): boolean {
  return hasTopLevelUnion(ts) || ts.includes("=>") || ts.startsWith("{");
}

function mapTypes(types: readonly string[], ctx: MapContext): string {
  if (types.length === 0) return "unknown";
  return types.map((token) => mapLualsType(token, ctx).ts).join(" | ");
}

function renderParams(params: readonly LibraryParam[], ctx: MapContext): string {
  return params
    .map((param, index) => {
      const mapped = mapTypes(param.types, ctx);
      if (param.isVararg) {
        const element = needsArrayParens(mapped) ? `(${mapped})[]` : `${mapped}[]`;
        return `...args: ${element}`;
      }
      const optional = param.isOptional ? "?" : "";
      return `${safeParamName(param.name, index)}${optional}: ${mapped}`;
    })
    .join(", ");
}

function renderReturn(returns: readonly LibraryParam[], ctx: MapContext): string {
  if (returns.length === 0) return "void";
  if (returns.length === 1) return mapTypes((returns[0] as LibraryParam).types, ctx);
  const inner = returns.map((ret) => mapTypes(ret.types, ctx)).join(", ");
  return `LuaMultiReturn<[${inner}]>`;
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

function renderInterface(iface: LibraryInterface, ctx: MapContext): string[] {
  const lines: string[] = [];
  pushDoc(lines, iface.brief, INDENT);
  lines.push(`${INDENT}interface ${sanitizeTypeName(iface.name)} {`);
  const body = INDENT + INDENT;
  for (const field of iface.fields) {
    const optional = field.isOptional ? "?" : "";
    lines.push(`${body}${memberKey(field.name)}${optional}: ${mapTypes(field.types, ctx)};`);
  }
  for (const method of iface.methods) {
    pushDoc(lines, method.brief, body);
    lines.push(
      `${body}${memberKey(method.name)}(${renderParams(method.params, ctx)}): ${renderReturn(
        method.returns,
        ctx,
      )};`,
    );
  }
  lines.push(`${INDENT}}`);
  return lines;
}

function renderModuleFunction(fn: LibraryMethod, ctx: MapContext): string[] {
  const lines: string[] = [];
  pushDoc(lines, fn.brief, INDENT);
  const params = renderParams(fn.params, ctx);
  const signature = `(${params ? `this: void, ${params}` : "this: void"}): ${renderReturn(
    fn.returns,
    ctx,
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
 * Emit the `.d.ts` text for one library model. References to the model's own
 * interfaces and aliases resolve to their sanitized declaration names via a rename
 * map layered over the caller's `typeRenames`; unresolved references lower to
 * `unknown` inside `mapLualsType` exactly as the fidelity report records them.
 */
export function emitLibraryDeclarations(model: LibraryModel, opts: EmitLibraryOptions): string {
  const declaredNames = [
    ...model.interfaces.map((iface) => iface.name),
    ...model.aliases.map((alias) => alias.name),
  ];
  const nameRenames: Record<string, string> = {};
  for (const name of declaredNames) nameRenames[name] = sanitizeTypeName(name);
  const ctx: MapContext = {
    knownNames: new Set(declaredNames),
    typeRenames: { ...(opts.typeRenames ?? {}), ...nameRenames },
  };

  const out: string[] = ["/** @noResolution */", `declare module '${opts.moduleId}' {`];
  for (const alias of model.aliases) out.push(...renderAlias(alias, ctx));
  for (const iface of model.interfaces) out.push(...renderInterface(iface, ctx));
  for (const fn of model.moduleFunctions) out.push(...renderModuleFunction(fn, ctx));
  out.push("}");
  return `${out.join("\n")}\n`;
}
