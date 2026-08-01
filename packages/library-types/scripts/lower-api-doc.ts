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
  type ExternalTypeRef,
  isPublicField,
  isPublicMethod,
  mapTypes,
  paramOptionalFlags,
  renderGenericParams,
  sanitizeTypeName,
} from "./emit-library-dts";
import { type MapContext, scopeGenerics } from "./map-luals-types";
import type { LibraryField, LibraryMethod, LibraryModel, LibraryParam } from "./parse-luals";

// Each type token is mapped independently (one mapped TS string per token) so the
// ref-doc `types` array stays token-per-slot the way engine ref-docs are shaped.
function mapTokens(tokens: readonly string[], ctx: MapContext): string[] {
  return tokens.map((token) => mapTypes([token], ctx));
}

function parameterElement(
  param: LibraryParam,
  isOptional: boolean,
  ctx: MapContext,
): Record<string, unknown> {
  // A vararg's element type stays a plain mapped token here; the renderer arrayifies
  // it (`...args: T[]`) from the `is_vararg` flag, keeping the JSON structurally honest.
  // `isOptional` comes from the emitter's trailing-run rule (paramOptionalFlags), not
  // `param.isOptional` alone, so the `/api` signature matches the emitted `.d.ts`.
  return {
    name: param.isVararg ? "...args" : param.name,
    doc: param.doc,
    types: mapTokens(param.types, ctx),
    is_optional: isOptional ? "True" : "False",
    is_vararg: param.isVararg ? "True" : "False",
  };
}

function returnElement(ret: LibraryParam, ctx: MapContext): Record<string, unknown> {
  return { name: "", doc: ret.doc, types: mapTokens(ret.types, ctx) };
}

function functionElement(method: LibraryMethod, ctx: MapContext): Record<string, unknown> {
  const fnCtx = scopeGenerics(ctx, method.generics);
  const generics = renderGenericParams(method.generics, fnCtx);
  const optionalFlags = paramOptionalFlags(method.params);
  return {
    type: "FUNCTION",
    name: method.name,
    brief: method.brief,
    description: method.brief,
    ...(generics !== "" ? { generics } : {}),
    parameters: method.params.map((param, index) =>
      parameterElement(param, optionalFlags[index] ?? false, fnCtx),
    ),
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

// A module object's field lowered as a top-level `VARIABLE` — the ref-doc shape for a
// module constant (`squid.TRACE`), matching the emitter's module-level `export const`.
function variableElement(field: LibraryField, ctx: MapContext): Record<string, unknown> {
  return {
    type: "VARIABLE",
    name: field.name,
    brief: field.doc,
    description: field.doc,
    types: mapTokens(field.types, ctx),
  };
}

export function lowerLibraryModel(
  model: LibraryModel,
  {
    namespace,
    typeRenames,
    externalTypes,
  }: {
    namespace: string;
    typeRenames?: Record<string, string>;
    externalTypes?: Record<string, ExternalTypeRef> | undefined;
  },
): unknown {
  const ctx = buildModelContext(model, typeRenames, externalTypes);
  const elements: Record<string, unknown>[] = [];

  for (const fn of model.moduleFunctions) {
    if (!isPublicMethod(fn)) continue;
    elements.push(functionElement(fn, ctx));
  }

  for (const iface of model.interfaces) {
    const ifaceCtx = scopeGenerics(ctx, iface.generics);
    // The module object's public fields are module-level constants, lowered as top-level
    // VARIABLE elements rather than a TYPEDEF named after the class.
    if (iface.name === model.moduleObject) {
      for (const field of iface.fields) {
        if (!isPublicField(field)) continue;
        elements.push(variableElement(field, ifaceCtx));
      }
      continue;
    }
    const functions = iface.methods
      .filter(isPublicMethod)
      .map((method) => functionElement(method, ifaceCtx));
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

  // The module's own `@class` carries the library's summary; use it as the page
  // description so a LuaLS-sourced library reads with an intro like every other `/api`
  // page, rather than opening on a bare provenance block. `brief` is its first line.
  // A tracked `moduleObject` names it directly (squid's `Squid` != namespace `squid`);
  // otherwise fall back to the class named for the namespace (`@class druid`).
  const moduleClass = model.interfaces.find(
    (iface) => iface.name === (model.moduleObject ?? namespace),
  );
  const description = moduleClass?.brief ?? "";
  const brief = description.split("\n")[0] ?? "";

  return { info: { namespace, brief, description }, elements };
}
