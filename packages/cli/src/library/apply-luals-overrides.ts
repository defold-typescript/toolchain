/**
 * Per-target corrections applied to a parsed `LibraryModel` after the merge, for the
 * cases where upstream LuaLS annotations diverge from the library's runtime and the
 * fixtures freeze the annotation verbatim (so it is not hand-patchable in the fixture
 * or the emitted `.d.ts`). The ten shapes covered are a module function whose trailing
 * parameter is runtime-optional despite a non-`|nil` `@param` (or, with `optional:
 * false`, required although no `@param` names it), a module function
 * parameter whose type token is wrong, an interface method
 * whose `@return` omits an alternative arm, an interface method the library checks
 * for before calling it, so an implementation may omit it (`optional`), an interface
 * field whose type token is
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
 * stale override never degrades into a silent no-op. Each override also names its
 * `evidence` in the vendored Lua, which `requireOverrideEvidence` checks when the
 * library data is read, so a re-pin that moves the evidence fails before it is emitted.
 */

import { readFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import type { LibraryModel } from "./parse-luals";

/** Where the vendored Lua shows an override's fact: `file`, relative to the target's
 * `source/<namespace>/` folder, holds `contains` once each whitespace run in both is
 * collapsed to one space. */
export interface OverrideEvidence {
  file: string;
  contains: string;
}

// `evidence` sits inside an override object, never as a key of a record keyed by member
// name: older CLIs ignore an unknown key in an override object, but would read one in
// such a record as a member and throw.
export interface AnnotationOverrides {
  moduleFunctions?: Record<
    string,
    {
      params?: Record<string, { optional?: boolean; type?: string; evidence?: OverrideEvidence }>;
    }
  >;
  interfaces?: Record<
    string,
    {
      callSignature?: { drop?: boolean; evidence?: OverrideEvidence };
      fields?: Record<string, { type?: string; drop?: boolean; evidence?: OverrideEvidence }>;
      methods?: Record<
        string,
        {
          return?: string;
          optional?: boolean;
          params?: Record<string, { type?: string; evidence?: OverrideEvidence }>;
          evidence?: OverrideEvidence;
        }
      >;
    }
  >;
  moduleObject?: {
    interface: string;
    fields: Record<string, { type: string; evidence?: OverrideEvidence }>;
    evidence?: OverrideEvidence;
  };
  moduleConstants?: Record<string, { type: string; doc?: string; evidence?: OverrideEvidence }>;
}

const EFFECT_KEYS = ["type", "optional", "return", "drop"] as const;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Refuses an override that does not point into the vendored Lua: each object carrying
 * `type`, `optional`, `return` or `drop`, each `callSignature`, the `moduleObject` and each
 * `moduleConstants` entry needs `evidence` whose `file` is inside `sourceDir` and holds
 * `contains`. An object that only nests others (a function, an interface, a method with
 * only `params`) needs none of its own.
 */
export function requireOverrideEvidence(
  file: string,
  label: string,
  overrides: AnnotationOverrides,
  sourceDir: string,
): void {
  const sources = new Map<string, string>();
  const refuse = (path: string, problem: string): Error =>
    new Error(`${file}: entry ${label} annotationOverrides.${path} ${problem}`);
  const check = (path: string, override: { evidence?: OverrideEvidence }): void => {
    const evidence = override.evidence as Partial<OverrideEvidence> | undefined;
    if (evidence === undefined) {
      throw refuse(
        path,
        "names no evidence — add { file, contains }: a file in its source folder and a snippet of it that shows the fact.",
      );
    }
    const { file: source, contains } = evidence;
    if (typeof source !== "string" || source === "") {
      throw refuse(path, 'has evidence with no "file".');
    }
    if (typeof contains !== "string" || collapseWhitespace(contains) === "") {
      throw refuse(path, 'has evidence with no "contains".');
    }
    const relative = posix.normalize(source.replaceAll("\\", "/"));
    if (
      posix.isAbsolute(source) ||
      win32.isAbsolute(source) ||
      relative === ".." ||
      relative.startsWith("../")
    ) {
      throw refuse(path, `has evidence file ${source}, which is outside its source folder.`);
    }
    let text = sources.get(relative);
    if (text === undefined) {
      try {
        text = collapseWhitespace(readFileSync(join(sourceDir, relative), "utf8"));
      } catch {
        throw refuse(
          path,
          `has evidence file ${source}, which is not a file in its source folder.`,
        );
      }
      sources.set(relative, text);
    }
    if (!text.includes(collapseWhitespace(contains))) {
      throw refuse(
        path,
        `has evidence ${JSON.stringify(contains)}, which ${source} does not contain — re-check the override against the vendored source.`,
      );
    }
  };
  const checkEffect = (path: string, override: object): void => {
    if (EFFECT_KEYS.some((key) => key in override)) check(path, override);
  };
  for (const [fnName, fn] of Object.entries(overrides.moduleFunctions ?? {})) {
    for (const [paramName, param] of Object.entries(fn.params ?? {})) {
      checkEffect(`moduleFunctions.${fnName}.params.${paramName}`, param);
    }
  }
  for (const [ifaceName, iface] of Object.entries(overrides.interfaces ?? {})) {
    const at = `interfaces.${ifaceName}`;
    if (iface.callSignature !== undefined) check(`${at}.callSignature`, iface.callSignature);
    for (const [fieldName, field] of Object.entries(iface.fields ?? {})) {
      checkEffect(`${at}.fields.${fieldName}`, field);
    }
    for (const [methodName, method] of Object.entries(iface.methods ?? {})) {
      checkEffect(`${at}.methods.${methodName}`, method);
      for (const [paramName, param] of Object.entries(method.params ?? {})) {
        checkEffect(`${at}.methods.${methodName}.params.${paramName}`, param);
      }
    }
  }
  if (overrides.moduleObject !== undefined) {
    check("moduleObject", overrides.moduleObject);
    for (const [fieldName, field] of Object.entries(overrides.moduleObject.fields ?? {})) {
      check(`moduleObject.fields.${fieldName}`, field);
    }
  }
  for (const [name, constant] of Object.entries(overrides.moduleConstants ?? {})) {
    check(`moduleConstants.${name}`, constant);
  }
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
      if (paramOverride.optional !== undefined) param.isOptional = paramOverride.optional;
      if (paramOverride.type !== undefined) param.types = [paramOverride.type];
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
      if (methodOverride.optional) method.optional = true;
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
    // A module-object field is already an `export const`, so a literal the parser
    // also read for that name is not declared twice.
    if (model.moduleConstants !== undefined) {
      model.moduleConstants = model.moduleConstants.filter(
        (constant) => !object.fields.some((field) => field.name === constant.name),
      );
    }
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
      // A recipe entry retypes a literal the parser already read, in its place.
      const parsed = moduleConstants.findIndex((c) => c.name === name);
      const retyped = {
        name,
        types: [constant.type],
        doc: constant.doc ?? (parsed === -1 ? "" : (moduleConstants[parsed]?.doc ?? "")),
        isOptional: false,
      };
      if (parsed === -1) moduleConstants.push(retyped);
      else moduleConstants[parsed] = retyped;
    }
    model.moduleConstants = moduleConstants;
  }
  return model;
}
