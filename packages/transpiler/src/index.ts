export type { ComponentAnimationIndex } from "./component-animation-index";
export {
  buildComponentAnimationIndex,
  componentIdOfSameObjectAddress,
} from "./component-animation-index";
export { buildConfigKeyIndex } from "./config-key-index";
export type { GuiFlipbookIndex } from "./gui-flipbook-index";
export { buildGuiFlipbookIndex } from "./gui-flipbook-index";
export type { GuiNodeIndex } from "./gui-node-index";
export { buildGuiNodeIndex } from "./gui-node-index";
export { buildInputActionIndex } from "./input-action-index";
export type {
  ExtensionDependency,
  LibraryIncludedEntries,
  LibrarySceneDocument,
  LibrarySceneDocuments,
  LibrarySharedEntry,
} from "./library-dependencies";
export {
  archiveWrapperOf,
  LIBRARY_DEPENDENCY_ROOT,
  libraryIncludedEntries,
  readGameProjectDependencies,
  readLibrarySceneDocuments,
} from "./library-dependencies";
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
export { buildSceneAddressDeclaration } from "./scene-address-declaration";
export type { SceneComponentIndex } from "./scene-component-index";
export { buildSceneComponentIndex } from "./scene-component-index";
export type { SceneReadHost } from "./scene-documents";
export {
  ANIMATION_ASSET_EXTENSIONS,
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  GUI_EXTENSIONS,
  INPUT_BINDING_EXTENSIONS,
  isExcludedProjectPath,
  LIBRARY_SCENE_EXTENSIONS,
  listProjectResourcePaths,
  PROJECT_EXTENSIONS,
  readSceneDocuments,
  SCENE_EXTENSIONS,
} from "./scene-documents";
export type { SceneObjectPathIndex } from "./scene-object-path-index";
export { buildSceneObjectPathIndex } from "./scene-object-path-index";
export type { SceneMessage } from "./scene-text-format";
export { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";
export type { TranspileSession } from "./session";
export { createTranspileSession } from "./session";
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
  isFragmentCaret,
  resolveClassifiedSlotAtPosition,
} from "./url-address-slots";
export type { UrlFragmentFinding, UrlFragmentReport } from "./url-fragment-reachability";
export { checkUrlFragmentReachability } from "./url-fragment-reachability";
