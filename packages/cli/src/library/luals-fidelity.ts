/**
 * Runs the LuaLS-to-TS mapper (`map-luals-types.ts`) over a whole parsed
 * `LibraryModel` and tallies how well the library's types survive the trip. It
 * writes nothing and reads nothing — a pure function over the model — so a
 * committed per-library report is a byte-stable regression guard.
 *
 * The mapper's loud-fail on an unmapped `vmath.*` token propagates: a core-type
 * gap reds the report rather than hiding behind a coverage number. Every other
 * unresolved reference is a recorded `unknown`, surfaced here as a count and a
 * sorted-unique token list so the gap is visible instead of silent.
 */

import {
  buildModelContext,
  type EmitLibraryOptions,
  type ExternalTypeRef,
  emitLibraryDeclarations,
  isPublicField,
  isPublicMethod,
  scopeAliasBody,
} from "./emit-library-dts";
import {
  countInputBareTables,
  type MapContext,
  mapLualsType,
  scopeGenerics,
} from "./map-luals-types";
import type { LibraryGeneric, LibraryModel, LibraryParam } from "./parse-luals";

export interface FidelityReport {
  namespace: string;
  totalMembers: number;
  totalTypeTokens: number;
  unknownFallbacks: number;
  unknownTokens: string[];
  undocumentedMembers: number;
  coverage: number;
}

/**
 * The LuaLS lane's report, which also counts what the emitted module loses: a
 * parameter typed by a bare `table` (it takes `LuaTable | PlainTable`, not the
 * caller's own table shape), an interface or alias declared without `export` (a
 * consumer cannot name it), and a literal module assignment the module exports
 * nothing for.
 */
export interface LualsFidelityReport extends FidelityReport {
  tableParams: number;
  unexportedTypes: number;
  droppedAssignments: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const EXPORTED_VALUE = /^\texport (?:const|function) ([A-Za-z_$][\w$]*)/;
const RE_EXPORTED_VALUE = /^\texport \{ [\w$]+ as ([\w$]+) \};$/;
const UNEXPORTED_TYPE = /^\t(?:interface|type) /;

/** What the emitted module loses, read from the declaration text the module serves. */
function emitLosses(
  model: LibraryModel,
  options: EmitLibraryOptions,
): Pick<LualsFidelityReport, "unexportedTypes" | "droppedAssignments"> {
  const lines = emitLibraryDeclarations(model, options).split("\n");
  const exported = new Set(
    lines.flatMap((line) => {
      const name = EXPORTED_VALUE.exec(line)?.[1] ?? RE_EXPORTED_VALUE.exec(line)?.[1];
      return name === undefined ? [] : [name];
    }),
  );
  // A constant its class's `---@field` marks non-public is hidden on purpose.
  const hidden = new Set(
    (model.moduleConstants ?? []).filter((c) => !isPublicField(c)).map((c) => c.name),
  );
  const literalNames = new Set(
    (model.moduleAssignments ?? [])
      .filter((a) => a.table === model.moduleReturn && a.literalType !== undefined)
      .map((a) => a.name)
      .filter((name) => !hidden.has(name)),
  );
  return {
    unexportedTypes: lines.filter((line) => UNEXPORTED_TYPE.test(line)).length,
    droppedAssignments: [...literalNames].filter((name) => !exported.has(name)).length,
  };
}

/**
 * Build the fidelity report for one namespace. Tokens map through the same
 * `buildModelContext` the emitter and the api-doc lowering use, so all three agree
 * on what resolves — the model's own interface and alias names, plus the
 * `externalTypes` tokens reached through a cross-module import — and all three
 * reject an external alias that collides with a declared name. Every field, every
 * param and return of every method and module function, every module constant, and
 * every alias expression is mapped, and a field, param or alias with no type token
 * counts as one `(untyped)` fallback; `undocumentedMembers` counts
 * fields/methods/moduleFunctions/moduleConstants whose doc or brief is empty. The
 * loss counters read the module this model emits. Deterministic; no I/O.
 */
export function buildFidelityReport(
  namespace: string,
  model: LibraryModel,
  typeRenames: Record<string, string>,
  externalTypes?: Record<string, ExternalTypeRef>,
): LualsFidelityReport {
  const ctx = buildModelContext(model, typeRenames, externalTypes);

  let totalMembers = 0;
  let totalTypeTokens = 0;
  let unknownFallbacks = 0;
  let undocumentedMembers = 0;
  let tableParams = 0;
  const unknownTokens = new Set<string>();

  const mapParams = (params: readonly LibraryParam[], mapCtx: MapContext): void => {
    for (const param of params) {
      mapSlot(param.types, mapCtx);
      if (param.types.some((token) => countInputBareTables(token, mapCtx) > 0)) tableParams++;
    }
  };

  const mapTokens = (tokens: string[], mapCtx: MapContext): void => {
    for (const token of tokens) {
      totalTypeTokens++;
      const { unknowns } = mapLualsType(token, mapCtx);
      unknownFallbacks += unknowns.length;
      for (const u of unknowns) unknownTokens.add(u);
    }
  };

  // A slot with no type token emits `unknown`, so it is one fallback, not zero tokens.
  const mapSlot = (tokens: string[], mapCtx: MapContext): void => {
    if (tokens.length > 0) {
      mapTokens(tokens, mapCtx);
      return;
    }
    totalTypeTokens++;
    unknownFallbacks++;
    unknownTokens.add("(untyped)");
  };

  const undocumented = (doc: string): boolean => doc.trim() === "";

  const mapConstraints = (generics: readonly LibraryGeneric[], mapCtx: MapContext): void => {
    for (const generic of generics) {
      if (generic.constraint) mapTokens([generic.constraint], mapCtx);
    }
  };

  for (const iface of model.interfaces) {
    const ifaceCtx = scopeGenerics(ctx, iface.generics);
    if (iface.extends) {
      mapTokens(
        iface.extends
          .split(",")
          .map((parent) => parent.trim())
          .filter((parent) => parent !== ""),
        ifaceCtx,
      );
    }
    mapConstraints(iface.generics, ifaceCtx);
    // A class `@overload fun(...)` is emitted as a call signature, so its type token
    // counts toward coverage exactly like a field or method type.
    for (const overload of iface.overloads ?? []) mapTokens([overload.type], ifaceCtx);
    for (const field of iface.fields) {
      if (!isPublicField(field)) continue;
      totalMembers++;
      if (undocumented(field.doc)) undocumentedMembers++;
      mapSlot(field.types, ifaceCtx);
    }
    for (const method of iface.methods) {
      if (!isPublicMethod(method)) continue;
      totalMembers++;
      if (undocumented(method.brief)) undocumentedMembers++;
      const methodCtx = scopeGenerics(ifaceCtx, method.generics);
      mapConstraints(method.generics, methodCtx);
      mapParams(method.params, methodCtx);
      for (const ret of method.returns) mapTokens(ret.types, methodCtx);
    }
  }

  const tableFunctions = (model.moduleTables ?? []).flatMap((table) => table.functions);
  for (const fn of [...model.moduleFunctions, ...tableFunctions]) {
    if (!isPublicMethod(fn)) continue;
    totalMembers++;
    if (undocumented(fn.brief)) undocumentedMembers++;
    const fnCtx = scopeGenerics(ctx, fn.generics);
    mapConstraints(fn.generics, fnCtx);
    mapParams(fn.params, fnCtx);
    for (const ret of fn.returns) mapTokens(ret.types, fnCtx);
  }

  for (const constant of model.moduleConstants ?? []) {
    totalMembers++;
    if (undocumented(constant.doc)) undocumentedMembers++;
    mapTokens(constant.types, ctx);
  }

  for (const alias of model.aliases) mapSlot(alias.types, scopeAliasBody(ctx, alias));

  const coverage =
    totalTypeTokens === 0
      ? 1
      : round3(Math.max(0, Math.min(1, (totalTypeTokens - unknownFallbacks) / totalTypeTokens)));

  return {
    namespace,
    totalMembers,
    totalTypeTokens,
    unknownFallbacks,
    unknownTokens: [...unknownTokens].sort(),
    undocumentedMembers,
    coverage,
    tableParams,
    ...emitLosses(model, { moduleId: namespace, typeRenames, externalTypes }),
  };
}
