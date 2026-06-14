import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import messagesDoc from "../fixtures/messages_doc.json" with { type: "json" };
import { parseDefoldApiDoc } from "../src/api-doc";
import { emitDeclarations } from "../src/emit-dts";
import { emitBuiltinMessages, parseMessagesDoc } from "../src/emit-messages";
import type { TranslationStore } from "../src/example-store";
import { wrapAsAmbientGlobal } from "../src/publish-dts";
import {
  type DocSourceProvenance,
  type DownloadRefDoc,
  type FetchChannelInfo,
  type RefDocChannel,
  refDocCacheDir,
  resolveRefDoc,
} from "./doc-source";
import { loadTranslations } from "./example-store-io";
import { type readZip, SYNC_MANIFEST, type SyncManifestEntry } from "./sync-api-docs";

export interface ApiTargetModule {
  readonly namespace: string;
  readonly fixture: string;
  readonly outFile: string;
  readonly skipFunctions?: readonly string[];
}

// A target sourced from a resolved ref-doc zip (resolved on demand, never
// pre-baked) versus the committed-fixture default (`null`).
export type ApiTargetSource = { readonly kind: "ref-doc"; readonly version: string } | null;

export interface ApiTarget {
  readonly id: string;
  readonly default?: boolean;
  readonly fixturesDir: string;
  readonly generatedDir: string;
  readonly coreTypesImport: string;
  readonly source?: ApiTargetSource;
  readonly modules: readonly ApiTargetModule[];
}

const REGISTRY_PATH = resolve(import.meta.dir, "..", "api-targets.json");
const PACKAGE_ROOT = resolve(import.meta.dir, "..");

export function loadApiTargets(registryPath: string = REGISTRY_PATH): ApiTarget[] {
  const { targets } = JSON.parse(readFileSync(registryPath, "utf8")) as { targets: ApiTarget[] };
  const defaults = targets.filter((t) => t.default === true);
  if (defaults.length !== 1) {
    throw new Error(
      `api-targets.json: expected exactly one default target, found ${defaults.length}`,
    );
  }
  return targets;
}

export function loadTargetModules(
  target: ApiTarget,
  packageRoot: string = PACKAGE_ROOT,
): ModuleManifestEntry[] {
  return target.modules.map((module) => {
    const path = resolve(packageRoot, target.fixturesDir, module.fixture);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      throw new Error(
        `api-targets.json: target "${target.id}" module "${module.namespace}" fixture not found: ${path}`,
      );
    }
    const entry: ModuleManifestEntry = {
      namespace: module.namespace,
      doc: JSON.parse(raw),
      outFile: module.outFile,
      importsFrom: target.coreTypesImport,
    };
    return module.skipFunctions ? { ...entry, skipFunctions: module.skipFunctions } : entry;
  });
}

export interface ModuleManifestEntry {
  readonly namespace: string;
  readonly doc: unknown;
  readonly outFile: string;
  readonly skipFunctions?: readonly string[];
  readonly importsFrom?: string;
  readonly sourceProvenance?: DocSourceProvenance;
}

export interface ResolveTargetOptions {
  readonly cacheDir?: string;
  readonly download?: DownloadRefDoc;
  readonly readZip?: typeof readZip;
  readonly syncManifest?: readonly SyncManifestEntry[];
  readonly packageRoot?: string;
  readonly channel?: RefDocChannel;
  readonly fetchChannelInfo?: FetchChannelInfo;
}

// Source-aware module resolution: a `null`-source target reads committed
// fixtures from disk (delegates to loadTargetModules); a `ref-doc` target
// resolves its docs on demand from the version's ref-doc zip, keyed by the
// SYNC_MANIFEST namespace -> zip-entry map.
export async function resolveTargetModules(
  target: ApiTarget,
  opts: ResolveTargetOptions = {},
): Promise<ModuleManifestEntry[]> {
  const source = target.source ?? null;
  if (source == null) {
    return loadTargetModules(target, opts.packageRoot);
  }
  const { zip, provenance } = await resolveRefDoc({
    version: source.version,
    cacheDir: opts.cacheDir ?? refDocCacheDir(),
    ...(opts.channel ? { channel: opts.channel } : {}),
    ...(opts.download ? { download: opts.download } : {}),
    ...(opts.readZip ? { readZip: opts.readZip } : {}),
    ...(opts.fetchChannelInfo ? { fetchChannelInfo: opts.fetchChannelInfo } : {}),
  });
  const syncManifest = opts.syncManifest ?? SYNC_MANIFEST;
  return target.modules.map((module) => {
    const sync = syncManifest.find((s) => s.namespace === module.namespace);
    if (!sync) {
      throw new Error(
        `api-targets.json: target "${target.id}" module "${module.namespace}": no SYNC_MANIFEST zip entry`,
      );
    }
    const entry: ModuleManifestEntry = {
      namespace: module.namespace,
      doc: JSON.parse(zip.read(sync.zipEntry)),
      outFile: module.outFile,
      importsFrom: target.coreTypesImport,
      sourceProvenance: provenance,
    };
    return module.skipFunctions ? { ...entry, skipFunctions: module.skipFunctions } : entry;
  });
}

const API_TARGETS = loadApiTargets();
const DEFAULT_TARGET = API_TARGETS.find((t) => t.default === true) as ApiTarget;

export const MODULE_MANIFEST: readonly ModuleManifestEntry[] = loadTargetModules(DEFAULT_TARGET);

export interface MessagesManifestEntry {
  readonly doc: unknown;
  readonly outFile: string;
}

export const MESSAGES_MANIFEST: MessagesManifestEntry = {
  doc: messagesDoc,
  outFile: "builtin-messages.d.ts",
};

export function generateBuiltinMessagesDeclaration(entry: MessagesManifestEntry): string {
  return emitBuiltinMessages(parseMessagesDoc(entry.doc));
}

export interface GenerateResult {
  contents: string;
  dropped: string[];
}

// Every CONSTANT FQN across the manifest, so a module's emit can brand a
// constant token owned by a *different* module (e.g. render's
// `graphics.BUFFER_TYPE_*` params) to the same FQN-keyed brand the owning
// module's `const` declaration carries.
export function collectConstantFqns(
  manifest: readonly ModuleManifestEntry[] = MODULE_MANIFEST,
): Set<string> {
  const fqns = new Set<string>();
  for (const entry of manifest) {
    for (const c of parseDefoldApiDoc(entry.doc).constants) fqns.add(c.name);
  }
  return fqns;
}

export interface GenerateOptions {
  knownConstantFqns?: ReadonlySet<string>;
  translations?: TranslationStore;
}

export function generateModuleDeclaration(
  entry: ModuleManifestEntry,
  options?: GenerateOptions,
): GenerateResult {
  const module = parseDefoldApiDoc(entry.doc);
  const prefix = `${module.namespace}.`;
  const dropped: string[] = [];
  const skip = new Set(entry.skipFunctions ?? []);
  module.functions = module.functions.filter((fn) => {
    const local = fn.name.startsWith(prefix) ? fn.name.slice(prefix.length) : fn.name;
    if (skip.has(local)) {
      dropped.push(fn.name);
      return false;
    }
    return true;
  });
  const knownConstantFqns = options?.knownConstantFqns ?? collectConstantFqns();
  const translations = options?.translations ?? loadTranslations();
  const emitted = emitDeclarations(module, { knownConstantFqns, translations });
  const contents = wrapAsAmbientGlobal({
    namespace: module.namespace,
    emitted,
    importsFrom: entry.importsFrom ?? "../src/core-types",
  });
  return { contents, dropped };
}

export interface VersionedModuleManifestEntry extends ModuleManifestEntry {
  readonly versionId: string;
}

// Committed generation covers only filesystem-fixture targets (source == null).
// ref-doc targets are resolved on the fly and never pre-baked, so they are
// excluded from the committed regen loop and the byte-drift guards.
export const VERSIONED_MODULE_MANIFEST: readonly VersionedModuleManifestEntry[] =
  API_TARGETS.filter(
    (target) => target.default !== true && (target.source ?? null) == null,
  ).flatMap((target) =>
    loadTargetModules(target).map((entry) => ({ ...entry, versionId: target.id })),
  );

export const RESTRICTED_NAMESPACES: Readonly<Record<string, string>> = {
  gui: "gui_script",
  render: "render_script",
};

// The Lua standard library rides every per-kind subpath the same as the full
// entrypoint. Triple-slash directives must precede the first statement, so they
// lead the generated kind index.
const LUA_STDLIB_REFERENCES =
  '/// <reference types="lua-types/5.1" />\n/// <reference types="lua-types/special/jit-only" />\n';

const UNIVERSAL_EXTRA_IMPORTS: readonly string[] = [
  "../builtin-messages",
  "../../src/engine-globals",
  "../../src/msg-overloads",
  "../../src/message-guard",
  "../../src/window-event-guard",
  "../../src/go-overloads",
];

export interface KindManifestEntry {
  readonly kind: string;
  readonly restricted?: string;
  readonly factory: string;
}

export const KIND_MODULE_MANIFEST: readonly KindManifestEntry[] = [
  { kind: "script", factory: "defineScript" },
  { kind: "gui-script", restricted: "gui", factory: "defineGuiScript" },
  { kind: "render-script", restricted: "render", factory: "defineRenderScript" },
];

export function generateKindIndex(kind: string): string {
  const entry = KIND_MODULE_MANIFEST.find((e) => e.kind === kind);
  if (!entry) throw new Error(`unknown script kind: ${kind}`);
  const universalNamespaces = MODULE_MANIFEST.filter(
    (m) => !Object.hasOwn(RESTRICTED_NAMESPACES, m.namespace),
  ).map((m) => `../${m.outFile.replace(/\.d\.ts$/, "")}`);
  const lines = [
    ...new Set([...universalNamespaces.sort(), ...[...UNIVERSAL_EXTRA_IMPORTS].sort()]),
  ].map((path) => `import "${path}";`);
  if (entry.restricted) lines.push(`import "../${entry.restricted}";`);
  return `${LUA_STDLIB_REFERENCES}${lines.join("\n")}\n\nexport { ${entry.factory} } from "../../src/lifecycle";\nexport type { ScriptProperties, ScriptProperty } from "../../src/lifecycle";\n`;
}

export function generateVersionIndex(
  versionId: string,
  manifest: readonly VersionedModuleManifestEntry[] = VERSIONED_MODULE_MANIFEST,
): string {
  const imports = manifest
    .filter((entry) => entry.versionId === versionId)
    .map((entry) => entry.outFile.replace(/\.d\.ts$/, ""))
    .sort()
    .map((module) => `import "./${module}";`)
    .join("\n");
  return `${imports}\n\nexport {};\n`;
}

if (import.meta.main) {
  const generated = resolve(import.meta.dir, "..", "generated");
  for (const entry of MODULE_MANIFEST) {
    const { contents, dropped } = generateModuleDeclaration(entry);
    if (dropped.length > 0) {
      console.log(`note: dropped skipped member(s) from ${entry.namespace}: ${dropped.join(", ")}`);
    }
    const out = resolve(generated, entry.outFile);
    writeFileSync(out, contents);
    console.log(`wrote ${out}`);
  }
  const messagesOut = resolve(generated, MESSAGES_MANIFEST.outFile);
  writeFileSync(messagesOut, generateBuiltinMessagesDeclaration(MESSAGES_MANIFEST));
  console.log(`wrote ${messagesOut}`);

  const versionIds = new Set(VERSIONED_MODULE_MANIFEST.map((entry) => entry.versionId));
  for (const entry of VERSIONED_MODULE_MANIFEST) {
    const { contents, dropped } = generateModuleDeclaration(entry);
    if (dropped.length > 0) {
      console.log(
        `note: dropped skipped member(s) from ${entry.versionId}/${entry.namespace}: ${dropped.join(", ")}`,
      );
    }
    const versionDir = resolve(generated, "versions", entry.versionId);
    mkdirSync(versionDir, { recursive: true });
    const out = resolve(versionDir, entry.outFile);
    writeFileSync(out, contents);
    console.log(`wrote ${out}`);
  }
  for (const versionId of versionIds) {
    const indexOut = resolve(generated, "versions", versionId, "index.d.ts");
    writeFileSync(indexOut, generateVersionIndex(versionId));
    console.log(`wrote ${indexOut}`);
  }

  const kindsDir = resolve(generated, "kinds");
  mkdirSync(kindsDir, { recursive: true });
  for (const entry of KIND_MODULE_MANIFEST) {
    const out = resolve(kindsDir, `${entry.kind}.d.ts`);
    writeFileSync(out, generateKindIndex(entry.kind));
    console.log(`wrote ${out}`);
  }
}
