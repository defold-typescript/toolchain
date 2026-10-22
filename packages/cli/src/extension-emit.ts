// Pure parse->emit core of the `[dependencies]`-driven extension typing pipeline.
// Given one extension `.script_api` (YAML) text it produces the ambient-namespace
// `.d.ts` declaration through `scriptApiToFixtureJson` (YAML -> core ref-doc
// JSON) feeding `generateModuleDeclaration`, the same call regen uses to write
// the committed extension goldens (`packages/types/extension-goldens/`). The
// namespace is read from the doc's own top-level table `name`, never a caller
// argument. Reading bytes out of a resolved archive, writing into
// `.defold-types/`, and the CLI `resolve` verb are later slices; this stays
// text-pure and IO-free.

// Shared with the committed extension goldens, which import branded engine
// handles from the types package's core-types via this relative path. Only
// emitted when the declaration actually references one.
const EXTENSION_CORE_TYPES_IMPORT = "../src/core-types";

export interface EmittedExtension {
  namespace: string;
  contents: string;
  dropped: string[];
}

interface ScriptApiToFixtureJson {
  scriptApiToFixtureJson: (text: string) => string;
}

interface RegenModule {
  generateModuleDeclaration: (entry: {
    namespace: string;
    doc: unknown;
    outFile: string;
    importsFrom?: string;
    indexBaseSource?: { pages: readonly string[] };
    ownsConstantUnionAliases?: boolean;
  }) => { contents: string; dropped: string[] };
}

// Imported by specifier (mirrors `extension-archive.ts`): Node's loader reads a
// path as a URL and never strips types under `node_modules`, so the emitter is
// reached through the types package's `cli-runtime` export, which each runtime
// resolves to the entry its condition names. The import stays dynamic so
// `regen.ts`'s fixture-reading module graph loads only when a verb needs it.
async function loadEmitter(): Promise<ScriptApiToFixtureJson & RegenModule> {
  return (await import("@defold-typescript/types/cli-runtime")) as ScriptApiToFixtureJson &
    RegenModule;
}

// Doc-level core shared by the YAML entrypoint and the extension golden parity
// guard. The doc is the post-`scriptApiToFixtureJson` ref-doc JSON, so passing a
// committed `fixtures/<ns>_doc.json` reproduces the committed
// `extension-goldens/<ns>.d.ts` byte-for-byte (regen writes the same
// `generateModuleDeclaration` output with no formatting pass). `pages` are the
// curated library pages documenting this doc, whose classified indexes the
// declaration notes; an uncurated extension has none and gains no note. The
// declaration owns no constant-union alias: an extension declaring an engine
// namespace (`gui`) would otherwise re-declare the engine module's aliases.
export async function emitExtensionDeclarationFromDoc(
  doc: { info: { namespace: string } },
  pages: readonly string[] = [],
): Promise<EmittedExtension> {
  const { generateModuleDeclaration } = await loadEmitter();
  const namespace = doc.info.namespace;
  const { contents, dropped } = generateModuleDeclaration({
    namespace,
    doc,
    outFile: `${namespace}.d.ts`,
    importsFrom: EXTENSION_CORE_TYPES_IMPORT,
    indexBaseSource: { pages },
    ownsConstantUnionAliases: false,
  });
  return { namespace, contents, dropped };
}

export async function emitExtensionDeclaration(
  scriptApiYaml: string,
  pages: readonly string[] = [],
): Promise<EmittedExtension> {
  const { scriptApiToFixtureJson } = await loadEmitter();
  const doc = JSON.parse(scriptApiToFixtureJson(scriptApiYaml)) as {
    info: { namespace: string };
  };
  return emitExtensionDeclarationFromDoc(doc, pages);
}
