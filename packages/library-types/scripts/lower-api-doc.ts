/**
 * Lower a LuaLS `LibraryModel` (`parse-luals.ts`) to the `{ info, elements }`
 * ref-doc JSON shape that `@defold-typescript/types`' `parseDefoldApiDoc`
 * accepts, so the docs-site renders a LuaLS-sourced library through the exact
 * `/api` path a ts-defold `.d.ts` takes. Mirrors `extract-api-doc.ts`: pure and
 * node-free (model in, object out) so it is unit-testable and reused by the
 * `--api-doc` orchestrator arm.
 *
 * We lower from the model rather than re-running `extractApiDoc` on the emitted
 * `generated/<ns>.d.ts`: a druid-style library's surface is almost entirely
 * `interface` declarations, and `extractApiDoc` only emits interfaces reachable
 * from an emitted function/variable or an `export =`, so the emitted `.d.ts`
 * yields near-empty elements. The model carries the interfaces explicitly.
 */

import {
  buildModelContext,
  mapTypes,
  renderGenericParams,
  sanitizeTypeName,
} from "./emit-library-dts";
import { type MapContext, scopeGenerics } from "./map-luals-types";
import type { LibraryField, LibraryMethod, LibraryModel, LibraryParam } from "./parse-luals";

// A field with an explicit non-public visibility is internal surface; keep only
// fields with no visibility or an explicit `public`, mirroring how LuaLS hides
// `private`/`protected`/`package` members from a class's public shape.
function isPublicField(field: LibraryField): boolean {
  return field.visibility === undefined || field.visibility === "public";
}

// Each type token is mapped independently (one mapped TS string per token) so the
// ref-doc `types` array stays token-per-slot the way engine ref-docs are shaped.
function mapTokens(tokens: readonly string[], ctx: MapContext): string[] {
  return tokens.map((token) => mapTypes([token], ctx));
}

function parameterElement(param: LibraryParam, ctx: MapContext): Record<string, unknown> {
  return {
    name: param.name,
    doc: param.doc,
    types: mapTokens(param.types, ctx),
    is_optional: param.isOptional ? "True" : "False",
  };
}

function returnElement(ret: LibraryParam, ctx: MapContext): Record<string, unknown> {
  return { name: "", doc: ret.doc, types: mapTokens(ret.types, ctx) };
}

function functionElement(method: LibraryMethod, ctx: MapContext): Record<string, unknown> {
  const fnCtx = scopeGenerics(ctx, method.generics);
  const generics = renderGenericParams(method.generics, fnCtx);
  return {
    type: "FUNCTION",
    name: method.name,
    brief: method.brief,
    description: method.brief,
    ...(generics !== "" ? { generics } : {}),
    parameters: method.params.map((param) => parameterElement(param, fnCtx)),
    returnvalues: method.returns.map((ret) => returnElement(ret, fnCtx)),
  };
}

function propertyElement(field: LibraryField, ctx: MapContext): Record<string, unknown> {
  return {
    name: field.name,
    brief: field.doc,
    description: field.doc,
    types: mapTokens(field.types, ctx),
  };
}

export function lowerLibraryModel(
  model: LibraryModel,
  { namespace, typeRenames }: { namespace: string; typeRenames?: Record<string, string> },
): unknown {
  const ctx = buildModelContext(model, typeRenames);
  const elements: Record<string, unknown>[] = [];

  for (const fn of model.moduleFunctions) {
    elements.push(functionElement(fn, ctx));
  }

  for (const iface of model.interfaces) {
    const ifaceCtx = scopeGenerics(ctx, iface.generics);
    const functions = iface.methods.map((method) => functionElement(method, ifaceCtx));
    const properties = iface.fields
      .filter(isPublicField)
      .map((field) => propertyElement(field, ifaceCtx));
    elements.push({
      type: "TYPEDEF",
      name: sanitizeTypeName(iface.name),
      ...(functions.length > 0 ? { functions } : {}),
      ...(properties.length > 0 ? { properties } : {}),
    });
  }

  for (const alias of model.aliases) {
    elements.push({ type: "TYPEDEF", name: sanitizeTypeName(alias.name) });
  }

  // The module's own `@class` (named for the namespace, e.g. `@class druid`)
  // carries the library's summary; use it as the page description so a
  // LuaLS-sourced library reads with an intro like every other `/api` page,
  // rather than opening on a bare provenance block. `brief` is its first line.
  const moduleClass = model.interfaces.find((iface) => iface.name === namespace);
  const description = moduleClass?.brief ?? "";
  const brief = description.split("\n")[0] ?? "";

  return { info: { namespace, brief, description }, elements };
}
