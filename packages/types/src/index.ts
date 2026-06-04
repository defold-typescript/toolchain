export type { ApiFunction, ApiModule, ApiParameter, ApiVariable } from "./api-doc";
export { parseDefoldApiDoc } from "./api-doc";
export {
  DEFOLD_TYPE_MAP,
  type Hash,
  type Matrix4,
  type Quaternion,
  type Url,
  type Vector,
  type Vector3,
  type Vector4,
} from "./core-types";
export { type DocCommentParts, htmlToDocText, renderDocComment } from "./doc-comment";
export { type EmitOptions, emitDeclarations } from "./emit-dts";
export {
  defineGuiScript,
  defineRenderScript,
  defineScript,
  type GuiScriptHooks,
  type InputAction,
  type InputTouch,
  type RenderScriptHooks,
  SCRIPT_HOOK_NAMES,
  type ScriptHookName,
  type ScriptHooks,
} from "./lifecycle";
export { type WrapOptions, wrapAsAmbientGlobal } from "./publish-dts";
