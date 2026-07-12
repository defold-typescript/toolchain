/// <reference types="lua-types/5.1" />
/// <reference types="lua-types/special/jit-only" />
import "./generated/builtin-messages";
import "./src/msg-overloads";
import "./src/message-guard";
import "./src/window-event-guard";
import "./src/message-dispatch";
import "./src/engine-globals";
import "./generated/b2d";
import "./generated/b2d_body";
import "./generated/b2d_chain";
import "./generated/b2d_fixture";
import "./generated/b2d_joint";
import "./generated/b2d_shape";
import "./generated/b2d_world";
import "./generated/buffer";
import "./generated/camera";
import "./generated/collectionfactory";
import "./generated/collectionproxy";
import "./generated/compute";
import "./generated/crash";
import "./generated/factory";
import "./generated/go";
import "./src/go-overloads";
import "./generated/graphics";
import "./generated/gui";
import "./generated/html5";
import "./generated/http";
import "./generated/iac";
import "./generated/iap";
import "./generated/image";
import "./generated/json";
import "./generated/label";
import "./generated/liveupdate";
import "./generated/material";
import "./generated/model";
import "./generated/msg";
import "./generated/particlefx";
import "./generated/physics";
import "./generated/profiler";
import "./generated/push";
import "./generated/render";
import "./generated/resource";
import "./generated/socket";
import "./src/socket-types";
import "./generated/sound";
import "./generated/sprite";
import "./generated/sys";
import "./generated/tilemap";
import "./generated/timer";
import "./generated/types";
import "./generated/vmath";
import "./src/vmath-overloads";
import "./generated/webview";
import "./generated/window";
import "./generated/zlib";

export {
  type ApiAvailability,
  type ApiSymbolIdentity,
  type AvailabilityLabel,
  type AvailabilityLabelKind,
  availabilityLabel,
  deriveAvailabilityMatrix,
  groupByLogicalName,
  isSignatureTransition,
  type LogicalNameGroup,
  normalizedFunctionSignature,
  symbolIdentityKey,
  type VersionSurface,
} from "./src/api-availability";
export type { ApiFunction, ApiModule, ApiParameter, ApiVariable } from "./src/api-doc";
export { parseDefoldApiDoc } from "./src/api-doc";
export {
  DEFOLD_TYPE_MAP,
  type Hash,
  type Matrix4,
  type Quaternion,
  type Url,
  type Vector,
  type Vector3,
  type Vector4,
} from "./src/core-types";
export { examplesHtmlToMarkdown, htmlToCodeText, htmlToDocText } from "./src/doc-comment";
export { type EmitOptions, emitDeclarations } from "./src/emit-dts";
export {
  hashExampleSource,
  lookupTranslation,
  type Translation,
  type TranslationStore,
} from "./src/example-store";
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
  type ScriptProperties,
  type ScriptPropertiesOf,
  type ScriptProperty,
} from "./src/lifecycle";
export { type WrapOptions, wrapAsAmbientGlobal } from "./src/publish-dts";
export {
  lookupSignature,
  type SignatureOverride,
  type SignatureStore,
} from "./src/signature-store";
