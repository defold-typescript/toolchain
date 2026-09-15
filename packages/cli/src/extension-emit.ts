// Pure parse->emit core of the `[dependencies]`-driven extension typing pipeline.
// Given one extension `.script_api` (YAML) text it produces the ambient-namespace
// `.d.ts` declaration through `scriptApiToFixtureJson` (YAML -> core ref-doc
// JSON) feeding `generateModuleDeclaration`, the same call regen uses to write
// the committed extension goldens (`packages/types/extension-goldens/`). The
// namespace is read from the doc's own top-level table `name`, never a caller
// argument. Reading bytes out of a resolved archive, writing into
// `.defold-types/`, and the CLI `resolve` verb are later slices; this stays
// text-pure and IO-free.

import { join } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";

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
  }) => { contents: string; dropped: string[] };
}

// Loaded by resolved path (mirrors `extension-archive.ts`) so the CLI never
// statically pulls in `regen.ts`'s fixture-reading module side effects.
async function loadEmitter(): Promise<ScriptApiToFixtureJson & RegenModule> {
  const root = resolveTypesPackageRoot();
  if (root === null) {
    throw new Error("cannot locate @defold-typescript/types to emit an extension declaration");
  }
  const sync = (await import(join(root, "scripts", "sync-api-docs.ts"))) as ScriptApiToFixtureJson;
  const regen = (await import(join(root, "scripts", "regen.ts"))) as RegenModule;
  return { ...sync, ...regen };
}

// Doc-level core shared by the YAML entrypoint and the extension golden parity
// guard. The doc is the post-`scriptApiToFixtureJson` ref-doc JSON, so passing a
// committed `fixtures/<ns>_doc.json` reproduces the committed
// `extension-goldens/<ns>.d.ts` byte-for-byte (regen writes the same
// `generateModuleDeclaration` output with no formatting pass).
export async function emitExtensionDeclarationFromDoc(doc: {
  info: { namespace: string };
}): Promise<EmittedExtension> {
  const { generateModuleDeclaration } = await loadEmitter();
  const namespace = doc.info.namespace;
  const { contents, dropped } = generateModuleDeclaration({
    namespace,
    doc,
    outFile: `${namespace}.d.ts`,
    importsFrom: EXTENSION_CORE_TYPES_IMPORT,
  });
  return { namespace, contents, dropped };
}

export async function emitExtensionDeclaration(scriptApiYaml: string): Promise<EmittedExtension> {
  const { scriptApiToFixtureJson } = await loadEmitter();
  const doc = JSON.parse(scriptApiToFixtureJson(scriptApiYaml)) as {
    info: { namespace: string };
  };
  return emitExtensionDeclarationFromDoc(doc);
}
