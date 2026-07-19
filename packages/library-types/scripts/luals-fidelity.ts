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

import { type MapContext, mapLualsType } from "./map-luals-types";
import type { LibraryModel } from "./parse-luals";

export interface FidelityReport {
  namespace: string;
  totalMembers: number;
  totalTypeTokens: number;
  unknownFallbacks: number;
  unknownTokens: string[];
  undocumentedMembers: number;
  coverage: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Build the fidelity report for one namespace. `knownNames` is drawn from the
 * model's own interface and alias names so a reference to a sibling library type
 * resolves rather than falling to `unknown`. Every field, every param and return
 * of every method and module function, and every alias expression is mapped;
 * `undocumentedMembers` counts fields/methods/moduleFunctions whose doc or brief
 * is empty. Deterministic; no I/O.
 */
export function buildFidelityReport(
  namespace: string,
  model: LibraryModel,
  typeRenames: Record<string, string>,
): FidelityReport {
  const knownNames = new Set<string>();
  for (const iface of model.interfaces) knownNames.add(iface.name);
  for (const alias of model.aliases) knownNames.add(alias.name);
  const ctx: MapContext = { knownNames, typeRenames };

  let totalMembers = 0;
  let totalTypeTokens = 0;
  let unknownFallbacks = 0;
  let undocumentedMembers = 0;
  const unknownTokens = new Set<string>();

  const mapTokens = (tokens: string[]): void => {
    for (const token of tokens) {
      totalTypeTokens++;
      const { unknowns } = mapLualsType(token, ctx);
      unknownFallbacks += unknowns.length;
      for (const u of unknowns) unknownTokens.add(u);
    }
  };

  const undocumented = (doc: string): boolean => doc.trim() === "";

  for (const iface of model.interfaces) {
    for (const field of iface.fields) {
      totalMembers++;
      if (undocumented(field.doc)) undocumentedMembers++;
      mapTokens(field.types);
    }
    for (const method of iface.methods) {
      totalMembers++;
      if (undocumented(method.brief)) undocumentedMembers++;
      for (const param of method.params) mapTokens(param.types);
      for (const ret of method.returns) mapTokens(ret.types);
    }
  }

  for (const fn of model.moduleFunctions) {
    totalMembers++;
    if (undocumented(fn.brief)) undocumentedMembers++;
    for (const param of fn.params) mapTokens(param.types);
    for (const ret of fn.returns) mapTokens(ret.types);
  }

  for (const alias of model.aliases) mapTokens(alias.types);

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
  };
}
