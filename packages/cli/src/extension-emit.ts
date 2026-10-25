// Pure parse->emit core of the `[dependencies]`-driven extension typing pipeline.
// Given one extension `.script_api` (YAML) text it produces the `.d.ts`
// declaration — a `@globalTable` module with its deprecated ambient namespace, or
// an engine namespace's ambient form — through `scriptApiToFixtureJson` (YAML ->
// core ref-doc JSON) feeding `generateGlobalTableDeclaration`, the same call
// regen uses to write the committed extension goldens
// (`packages/types/extension-goldens/`). The
// namespace is read from the doc's own top-level table `name`, never a caller
// argument. Reading bytes out of a resolved archive, writing into
// `.defold-types/`, and the CLI `resolve` verb are later slices; this stays
// text-pure and IO-free.

import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { loadApiTargetsRegistry, type RegistryTargetModule } from "./api-registry";

// Shared with the committed extension goldens, which import branded engine
// handles from the types package's core-types via this relative path. Only
// emitted when the declaration actually references one.
const EXTENSION_CORE_TYPES_IMPORT = "../src/core-types";

export interface EmittedExtension {
  namespace: string;
  contents: string;
  // The ambient namespace kept beside the module for one release, tagged
  // `@deprecated`. Absent when the namespace is the engine's: `contents` is then
  // that ambient form itself.
  deprecatedGlobal?: string;
  dropped: string[];
}

interface ScriptApiToFixtureJson {
  scriptApiToFixtureJson: (text: string) => string;
}

interface RegenEntry {
  namespace: string;
  doc: unknown;
  outFile: string;
  importsFrom?: string;
  indexBaseSource?: {
    pages: readonly string[];
    classifications: LibraryIndexSlotClassifications;
  };
  ownsConstantUnionAliases?: boolean;
}

interface RegenModule {
  generateModuleDeclaration: (entry: RegenEntry) => { contents: string; dropped: string[] };
  generateGlobalTableDeclaration: (entry: RegenEntry) => {
    contents: string;
    deprecatedGlobal: string;
    dropped: string[];
  };
}

// Every namespace a registered engine target declares. A doc adding members to
// one (Spine's `gui`) stays ambient: a module cannot extend the engine's global.
export function engineNamespaces(): ReadonlySet<string> {
  return new Set(
    loadApiTargetsRegistry().flatMap((target) =>
      ((target.modules ?? []) as readonly RegistryTargetModule[]).map((m) => m.namespace),
    ),
  );
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
// `extension-goldens/<ns>.d.ts` and `<ns>.global.d.ts` byte-for-byte (regen
// writes the same `generateGlobalTableDeclaration` output with no formatting
// pass). `pages` are the
// curated library pages documenting this doc, whose indexes `classifications`
// classifies and the declaration notes; an uncurated extension has none and
// gains no note. The declaration owns no constant-union alias: an extension
// declaring an engine namespace (`gui`) would otherwise re-declare the engine
// module's aliases. Any other namespace is a `@globalTable` module beside its
// deprecated ambient form.
export async function emitExtensionDeclarationFromDoc(
  doc: { info: { namespace: string } },
  pages: readonly string[] = [],
  classifications: LibraryIndexSlotClassifications = new Map(),
  engine: ReadonlySet<string> = engineNamespaces(),
): Promise<EmittedExtension> {
  const { generateGlobalTableDeclaration, generateModuleDeclaration } = await loadEmitter();
  const namespace = doc.info.namespace;
  const entry: RegenEntry = {
    namespace,
    doc,
    outFile: `${namespace}.d.ts`,
    importsFrom: EXTENSION_CORE_TYPES_IMPORT,
    indexBaseSource: { pages, classifications },
    ownsConstantUnionAliases: false,
  };
  if (engine.has(namespace)) {
    const { contents, dropped } = generateModuleDeclaration(entry);
    return { namespace, contents, dropped };
  }
  const { contents, deprecatedGlobal, dropped } = generateGlobalTableDeclaration(entry);
  return { namespace, contents, deprecatedGlobal, dropped };
}

export async function emitExtensionDeclaration(
  scriptApiYaml: string,
  pages: readonly string[] = [],
  classifications: LibraryIndexSlotClassifications = new Map(),
  engine: ReadonlySet<string> = engineNamespaces(),
): Promise<EmittedExtension> {
  const { scriptApiToFixtureJson } = await loadEmitter();
  const doc = JSON.parse(scriptApiToFixtureJson(scriptApiYaml)) as {
    info: { namespace: string };
  };
  return emitExtensionDeclarationFromDoc(doc, pages, classifications, engine);
}
