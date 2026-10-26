/**
 * Per-target corrections applied to a parsed `LibraryModel` after the merge, for the
 * cases where upstream LuaLS annotations diverge from the library's runtime and the
 * fixtures freeze the annotation verbatim (so it is not hand-patchable in the fixture
 * or the emitted `.d.ts`). The eight shapes covered are a module function whose trailing
 * parameter is runtime-optional despite a non-`|nil` `@param`, an interface method
 * whose `@return` omits an alternative arm, an interface field whose type token is
 * wrong or underspecified (a stray character, or an untyped `fun(...)` callback), an
 * interface method parameter with the same underspecification, an interface field
 * that only restates a member inherited from a parent, incompatibly enough that the
 * emitted redeclaration would not type-check (`drop`), a class-level `@overload`
 * that describes the module table rather than the instance the emitted call signature
 * lands on (`callSignature`), a `---@class` bound to a module-table field assignment
 * (`M.x = event.create()`), which the parser does not model as a module value
 * (`moduleObject`), and an unannotated column-0 constant (`M.RES_BOTH = 3`) on the table
 * the module file returns, typed by a LuaLS token and emitted as an `export const`
 * (`moduleConstants`). Every named target must exist — a missing function, param,
 * interface, field, method, call signature, or constant assigned on the returned table
 * throws naming the absent key, mirroring `buildTargetModel`'s loud-fail on an absent `ownFile`, so a
 * stale override never degrades into a silent no-op.
 */

import type { LibraryModel } from "./parse-luals";

export interface AnnotationOverrides {
  moduleFunctions?: Record<string, { params?: Record<string, { optional?: boolean }> }>;
  interfaces?: Record<
    string,
    {
      callSignature?: { drop?: boolean };
      fields?: Record<string, { type?: string; drop?: boolean }>;
      methods?: Record<string, { return?: string; params?: Record<string, { type?: string }> }>;
    }
  >;
  moduleObject?: { interface: string; fields: Record<string, { type: string }> };
  moduleConstants?: Record<string, { type: string; doc?: string }>;
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
    if (ifaceOverride.callSignature !== undefined) {
      if (!iface.overloads || iface.overloads.length === 0) {
        throw new Error(
          `applyAnnotationOverrides: the call signature of interface "${ifaceName}" is absent from the model.`,
        );
      }
      if (ifaceOverride.callSignature.drop) delete iface.overloads;
    }
    for (const [fieldName, fieldOverride] of Object.entries(ifaceOverride.fields ?? {})) {
      const field = iface.fields.find((f) => f.name === fieldName);
      if (!field) {
        throw new Error(
          `applyAnnotationOverrides: field "${fieldName}" of interface "${ifaceName}" is absent from the model.`,
        );
      }
      if (fieldOverride.drop) {
        iface.fields.splice(iface.fields.indexOf(field), 1);
        continue;
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
  if (overrides.moduleObject !== undefined) {
    const { interface: objectName, fields } = overrides.moduleObject;
    const object = model.interfaces.find((i) => i.name === objectName);
    if (!object) {
      throw new Error(
        `applyAnnotationOverrides: module object interface "${objectName}" is absent from the model.`,
      );
    }
    if (model.moduleObject !== undefined && model.moduleObject !== objectName) {
      throw new Error(
        `applyAnnotationOverrides: module object "${objectName}" conflicts with the parsed module object "${model.moduleObject}".`,
      );
    }
    for (const [fieldName, fieldOverride] of Object.entries(fields)) {
      if (object.fields.some((f) => f.name === fieldName)) {
        throw new Error(
          `applyAnnotationOverrides: field "${fieldName}" of module object "${objectName}" is already declared upstream.`,
        );
      }
      if (model.moduleFunctions.some((f) => f.name === fieldName)) {
        throw new Error(
          `applyAnnotationOverrides: field "${fieldName}" of module object "${objectName}" collides with a module function.`,
        );
      }
      const typeClass = model.interfaces.find((i) => i.name === fieldOverride.type);
      if (!typeClass) {
        throw new Error(
          `applyAnnotationOverrides: type "${fieldOverride.type}" of module object field "${fieldName}" is absent from the model.`,
        );
      }
      object.fields.push({
        name: fieldName,
        types: [fieldOverride.type],
        doc: typeClass.brief,
        isOptional: false,
      });
    }
    model.moduleObject = objectName;
  }
  const constants = Object.entries(overrides.moduleConstants ?? {});
  if (constants.length > 0) {
    const objectFields = model.interfaces.find((i) => i.name === model.moduleObject)?.fields ?? [];
    const moduleConstants = model.moduleConstants ?? [];
    for (const [name, constant] of constants) {
      const assigned =
        model.moduleReturn !== undefined &&
        (model.moduleAssignments ?? []).some(
          (a) => a.table === model.moduleReturn && a.name === name,
        );
      if (!assigned) {
        const returned = model.moduleReturn ? ` ("${model.moduleReturn}")` : "";
        throw new Error(
          `applyAnnotationOverrides: module constant "${name}" is not assigned at column 0 on the table the module file returns${returned}.`,
        );
      }
      if (model.moduleFunctions.some((f) => f.name === name)) {
        throw new Error(
          `applyAnnotationOverrides: module constant "${name}" collides with a module function.`,
        );
      }
      if (objectFields.some((f) => f.name === name)) {
        throw new Error(
          `applyAnnotationOverrides: module constant "${name}" is already declared by module object "${model.moduleObject}".`,
        );
      }
      moduleConstants.push({
        name,
        types: [constant.type],
        doc: constant.doc ?? "",
        isOptional: false,
      });
    }
    model.moduleConstants = moduleConstants;
  }
  return model;
}
