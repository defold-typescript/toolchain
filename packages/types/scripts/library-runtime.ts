// The emitter helpers the CLI's library printer imports statically, published as
// `@defold-typescript/types/library-runtime` and resolved the way `cli-runtime`
// is: Bun's `bun` condition to this source, Node's `default` to the bundle built
// beside it (`dist/library-runtime.js`). It stays apart from `cli-runtime`, whose
// `regen.ts` reads target registries at load: a static import lands at the top of
// the CLI bundle, so everything here must be safe to load on every command.

export { renderDocComment } from "../src/doc-comment";
export { isKnownDefoldTypeToken, TS_IDENTIFIER, TS_RESERVED_NAMES } from "../src/emit-dts";
export {
  appendNotes,
  libraryIndexBaseNotes,
  parseLibraryIndexSlotClassifications,
} from "../src/index-slot-classifications";
export { luaMultiReturn, varargElementType } from "../src/library-signature";
export {
  LUALS_VARARG_TOKEN,
  mapLualsCallSignatureExpression,
  mapLualsExpression,
  matchBracket,
  splitTopLevel,
} from "../src/luals-type-expr";
