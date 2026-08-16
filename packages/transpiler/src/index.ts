export { buildConfigKeyIndex } from "./config-key-index";
export type { GuiNodeIndex } from "./gui-node-index";
export { buildGuiNodeIndex } from "./gui-node-index";
export { findMainEntryFactoryImports } from "./main-entry-factory-imports";
export type { BuildConfig, ScriptKind, SourceOutputKind } from "./output-paths";
export {
  computeOutputRel,
  DEFAULT_INCLUDE,
  parseBuildConfig,
  SCRIPT_SUFFIX_BY_KIND,
  stripIncludeBase,
} from "./output-paths";
export { getProgramDiagnostics } from "./program-diagnostics";
export { isDefignoredPath, SCAFFOLDED_DEFIGNORE_LINES } from "./project-resources";
export type { SceneComponentIndex } from "./scene-component-index";
export { buildSceneComponentIndex } from "./scene-component-index";
export type { SceneObjectPathIndex } from "./scene-object-path-index";
export { buildSceneObjectPathIndex } from "./scene-object-path-index";
export type { SceneMessage } from "./scene-text-format";
export { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";
export type { TranspileSession } from "./session";
export { createTranspileSession } from "./session";
export type { SpriteAnimationIndex } from "./sprite-animation-index";
export {
  buildSpriteAnimationIndex,
  componentIdOfSameObjectAddress,
} from "./sprite-animation-index";
export type {
  TranspileDiagnostic,
  TranspileProjectInput,
  TranspileProjectResult,
  TranspileResult,
} from "./transpile";
export { transpile, transpileProject } from "./transpile";
export type { ClassifiedSlot } from "./url-address-slots";
export {
  addressClassOfArgument,
  isAddressClass,
  resolveClassifiedSlotAtPosition,
} from "./url-address-slots";
export type { UrlFragmentFinding, UrlFragmentReport } from "./url-fragment-reachability";
export { checkUrlFragmentReachability } from "./url-fragment-reachability";
