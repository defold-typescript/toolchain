export type { GuiNodeIndex } from "./gui-node-index";
export { buildGuiNodeIndex } from "./gui-node-index";
export { findMainEntryFactoryImports } from "./main-entry-factory-imports";
export { getProgramDiagnostics } from "./program-diagnostics";
export type { SceneComponentIndex } from "./scene-component-index";
export { buildSceneComponentIndex } from "./scene-component-index";
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
  resolveClassifiedSlotAtPosition,
} from "./url-address-slots";
export type { UrlFragmentFinding, UrlFragmentReport } from "./url-fragment-reachability";
export { checkUrlFragmentReachability } from "./url-fragment-reachability";
