// The one entry the CLI loads the generator through, published as
// `@defold-typescript/types/cli-runtime`. Node's loader refuses a `.ts` file
// under `node_modules` and reads a bare Windows path as a URL scheme, so the
// CLI never imports these scripts by path: Bun resolves the export's `bun`
// condition to this source, Node its `default` to the bundle built beside it
// (`dist/cli-runtime.js`, `bun run build:cli-runtime`). Anything the CLI needs
// at runtime is added here, never imported by path.

export {
  buildVersionedSurfaceFiles,
  materializeVersionedSurface,
  RESTRICTED_SRC_AUGMENTATIONS,
  RUNTIME_KIND_MANIFEST,
  renderMaterializedKindIndex,
  targetKindManifest,
} from "./materialize-version";
export { generateGlobalTableDeclaration, generateModuleDeclaration } from "./regen";
export {
  readZip,
  scriptApiToFixtureJson,
  type ZipAccessor,
  type ZipArchive,
} from "./sync-api-docs";
