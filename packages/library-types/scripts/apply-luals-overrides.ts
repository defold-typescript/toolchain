/**
 * Per-target corrections applied to a parsed `LibraryModel` after the merge, for the
 * cases where upstream LuaLS annotations diverge from the library's runtime and the
 * fixtures freeze the annotation verbatim (so it is not hand-patchable in the fixture
 * or the emitted `.d.ts`). The four shapes covered are a module function whose trailing
 * parameter is runtime-optional despite a non-`|nil` `@param`, an interface method
 * whose `@return` omits an alternative arm, an interface field whose type token is
 * wrong or underspecified (a stray character, or an untyped `fun(...)` callback), and
 * an interface method parameter with the same underspecification. Every named target
 * must exist — a missing function, param, interface, field, or method throws naming the
 * absent key, mirroring `buildTargetModel`'s loud-fail on an absent `ownFile`, so a
 * stale override never degrades into a silent no-op.
 */

import type { LibraryModel } from "./parse-luals";

export interface AnnotationOverrides {
  moduleFunctions?: Record<string, { params?: Record<string, { optional?: boolean }> }>;
  interfaces?: Record<
    string,
    {
      fields?: Record<string, { type?: string }>;
      methods?: Record<string, { return?: string; params?: Record<string, { type?: string }> }>;
    }
  >;
}

export function applyAnnotationOverrides(
  model: LibraryModel,
  overrides: AnnotationOverrides,
): LibraryModel {
  for (const [fnName, fnOverride] of Object.entries(overrides.moduleFunctions ?? {})) {
    const fn = model.moduleFunctions.find((f) => f.name === fnName);
    if (!fn) {
      throw new Error(
        `applyAnnotationOverrides: module function "${fnName}" is absent from the model.`,
      );
    }
    for (const [paramName, paramOverride] of Object.entries(fnOverride.params ?? {})) {
      const param = fn.params.find((p) => p.name === paramName);
      if (!param) {
        throw new Error(
          `applyAnnotationOverrides: param "${paramName}" of module function "${fnName}" is absent from the model.`,
        );
      }
      if (paramOverride.optional) param.isOptional = true;
    }
  }
  for (const [ifaceName, ifaceOverride] of Object.entries(overrides.interfaces ?? {})) {
    const iface = model.interfaces.find((i) => i.name === ifaceName);
    if (!iface) {
      throw new Error(
        `applyAnnotationOverrides: interface "${ifaceName}" is absent from the model.`,
      );
    }
    for (const [fieldName, fieldOverride] of Object.entries(ifaceOverride.fields ?? {})) {
      const field = iface.fields.find((f) => f.name === fieldName);
      if (!field) {
        throw new Error(
          `applyAnnotationOverrides: field "${fieldName}" of interface "${ifaceName}" is absent from the model.`,
        );
      }
      if (fieldOverride.type !== undefined) field.types = [fieldOverride.type];
    }
    for (const [methodName, methodOverride] of Object.entries(ifaceOverride.methods ?? {})) {
      const method = iface.methods.find((m) => m.name === methodName);
      if (!method) {
        throw new Error(
          `applyAnnotationOverrides: method "${methodName}" of interface "${ifaceName}" is absent from the model.`,
        );
      }
      if (methodOverride.return !== undefined) {
        method.returns = [
          { name: "", types: [methodOverride.return], doc: "", isOptional: false, isVararg: false },
        ];
      }
      for (const [paramName, paramOverride] of Object.entries(methodOverride.params ?? {})) {
        const param = method.params.find((p) => p.name === paramName);
        if (!param) {
          throw new Error(
            `applyAnnotationOverrides: param "${paramName}" of method "${methodName}" of interface "${ifaceName}" is absent from the model.`,
          );
        }
        if (paramOverride.type !== undefined) param.types = [paramOverride.type];
      }
    }
  }
  return model;
}
