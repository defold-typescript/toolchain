export {
  type ApiAvailability,
  type ApiMigrationCatalog,
  type ApiMigrationEntry,
  type ApiSymbolIdentity,
  type AvailabilityLabel,
  type AvailabilityLabelKind,
  type AvailabilityLabelOptions,
  applyMigrationOverlay,
  availabilityLabel,
  type Box2dBackend,
  collectSymbolIdentities,
  deriveAvailabilityMatrix,
  groupByLogicalName,
  isSignatureTransition,
  type LogicalNameGroup,
  normalizedFunctionSignature,
  signatureTransitionNames,
  symbolIdentityKey,
  symbolNameKey,
  type VersionSurface,
  validateAvailability,
} from "./api-availability";
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
export {
  type DocCommentParts,
  examplesHtmlToMarkdown,
  htmlToCodeText,
  htmlToDocText,
  renderDocComment,
} from "./doc-comment";
export {
  defineEditorScript,
  type EditorCommand,
  type EditorScriptModule,
} from "./editor";
export {
  type EmitOptions,
  emitDeclarations,
  emitSymbolSignatures,
  type SymbolSignature,
  TS_IDENTIFIER,
  TS_RESERVED_NAMES,
} from "./emit-dts";
export {
  hashExampleSource,
  lookupTranslation,
  type Translation,
  type TranslationStore,
} from "./example-store";
export {
  hasTopLevelUnion,
  luaMultiReturn,
  needsArrayParens,
  varargElementType,
} from "./library-signature";
export {
  defineGuiScript,
  defineRenderScript,
  defineScript,
  type GuiScriptHooks,
  type GuiScriptHooksWithProperties,
  type InputAction,
  type InputTouch,
  type RenderScriptHooks,
  type RenderScriptHooksWithProperties,
  SCRIPT_HOOK_NAMES,
  type ScriptHookName,
  type ScriptHooks,
  type ScriptHooksWithProperties,
  type ScriptProperties,
  type ScriptPropertiesOf,
  type ScriptProperty,
} from "./lifecycle";
export {
  type ModuleWrapOptions,
  type WrapOptions,
  wrapAsAmbientGlobal,
  wrapAsModule,
} from "./publish-dts";
export {
  lookupSignature,
  type SignatureOverride,
  type SignatureStore,
} from "./signature-store";
export {
  classifyUrlParameter,
  collectParameterSlots,
  collectUrlParameterSlots,
  parameterTypesSatisfyClass,
  REQUIRED_TYPES,
  type UrlParameterClass,
  type UrlParameterEntry,
  type UrlParameterSlot,
  type UrlParameterSource,
  type UrlParameterTable,
} from "./url-parameters";
