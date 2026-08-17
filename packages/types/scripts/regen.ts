import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import messagesDoc from "../fixtures/messages_doc.json" with { type: "json" };
import { type ApiModule, parseDefoldApiDoc } from "../src/api-doc";
import {
  defaultMapType,
  emitDeclarations,
  emitSymbolSignatures,
  type SymbolSignature,
} from "../src/emit-dts";
import {
  applyMessageDeprecations,
  emitBuiltinMessages,
  parseMessagesDoc,
} from "../src/emit-messages";
import type { TranslationStore } from "../src/example-store";
import { wrapAsAmbientGlobal, wrapAsModule } from "../src/publish-dts";
import type { UrlParameterTable } from "../src/url-parameters";
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

// An editor-VM document declared by a target. It carries two things a runtime
// module never needs: its own `importsFrom` (the `editor-vm/` subdirectory sits
// a level below the runtime surface, so the target's `coreTypesImport` does not
// reach) and a named `mapType` selector, since the editor VM is the only surface
// with handle tokens no runtime namespace uses.
export interface ApiTargetEditorModule extends ApiTargetModule {
  readonly importsFrom?: string;
  readonly mapType?: string;
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
  // The editor-scripting documents this target ships, or absent when it ships
  // none. Absence is declared, never inferred from a missing file, so a fixture
  // deleted by accident fails loudly instead of silently degrading a pinned
  // project to the default target's editor surface.
  readonly editorModules?: readonly ApiTargetEditorModule[];
  // Docs-only Lua stdlib pages (no generated `.d.ts`): vendored fixtures the
  // docs-site pages under the "Lua standard library" category. Never read by
  // regen/MODULE_MANIFEST; surfaced here so the registry stays type-honest.
  readonly luaStdlib?: readonly { readonly namespace: string; readonly fixture: string }[];
}

const REGISTRY_PATH = resolve(import.meta.dir, "..", "api-targets.json");
const PACKAGE_ROOT = resolve(import.meta.dir, "..");

export function loadApiTargets(
  registryPath: string = REGISTRY_PATH,
  packageRoot: string = resolve(registryPath, ".."),
): ApiTarget[] {
  const { targets } = JSON.parse(readFileSync(registryPath, "utf8")) as { targets: ApiTarget[] };
  const defaults = targets.filter((t) => t.default === true);
  if (defaults.length !== 1) {
    throw new Error(
      `api-targets.json: expected exactly one default target, found ${defaults.length}`,
    );
  }
  for (const target of targets) {
    for (const module of target.editorModules ?? []) {
      const path = resolve(packageRoot, target.fixturesDir, module.fixture);
      if (!existsSync(path)) {
        throw new Error(
          `api-targets.json: target "${target.id}" editor module "${module.namespace}" fixture not found: ${path}`,
        );
      }
    }
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
  // Each item drops one member of any element kind — a FUNCTION or a VARIABLE —
  // by an exact stripped local (`get`), or — when it ends in `.` — a segment
  // prefix dropping everything beneath it (`ui.`). The field keeps its historic
  // name; its reach is not limited to functions.
  readonly skipFunctions?: readonly string[];
  readonly importsFrom?: string;
  readonly moduleId?: string;
  readonly sourceProvenance?: DocSourceProvenance;
  // Overrides the shared token -> TS type mapping for this entry alone. Reserved
  // for tokens no runtime namespace uses, so `DEFOLD_TYPE_MAP` keeps describing
  // only the runtime surface.
  readonly mapType?: (token: string) => string;
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

// The fidelity audit runs over the promoted default surface (the `default: true`
// target) so the 1.13-only modules (b2d.*, compute, material) and the 1.13 model
// additions are audited too — auditing the older 1.12.4 target left them unseen,
// which is how the promoted surface shipped opaque `Record` fallbacks while the
// gate read `recordTables: 0`.
const FIDELITY_BASELINE_TARGET = DEFAULT_TARGET;
export const FIDELITY_BASELINE_MANIFEST: readonly ModuleManifestEntry[] =
  loadTargetModules(FIDELITY_BASELINE_TARGET);

// Handle tokens the editor VM alone exposes. `transaction_step[` is what
// upstream literally emits for `transaction_step[]` — the ref-doc's own type
// string loses the closing bracket — so it is repaired here, per entry, rather
// than in the parser: no runtime namespace carries it, and normalizing a
// truncated bracket globally would silently reinterpret any future token of that
// shape. The doc's other truncated token, `string[`, is deliberately left to map
// to `unknown`: it covers both a plain path list and `create_resources`' mixed
// path/[path, content] entries, so `string[]` would be wrong at one of its two
// slots.
const EDITOR_TYPE_MAP: Readonly<Record<string, string>> = {
  // `editor.command` — the token's only consumer today — is skipped in favour of
  // the hand-authored overload file, which returns the same `Opaque<"command">`.
  // The entry stays so a future `command`-returning function maps identically.
  command: 'Opaque<"command">',
  // The handle every `editor.ui.*` builder returns and `editor.ui.show_dialog`
  // consumes. Branding it keeps the whole component chain one nominal type
  // rather than letting each end fall to the default `unknown` mapping.
  component: 'Opaque<"component">',
  transaction_step: 'Opaque<"transaction_step">',
  "transaction_step[": 'Opaque<"transaction_step">[]',
  // The handle every `localization` function returns: a userdata whose only
  // documented use is being stringified or nested into another pattern.
  message: 'Opaque<"message">',
  // Repaired per entry for the same reason as `transaction_step[` above. Unlike
  // `string[`, this token means one thing everywhere it appears — a list of
  // values to render — so `unknown[]` is sound at all three of its slots.
  "any[": "unknown[]",
};

function mapEditorType(token: string): string {
  return EDITOR_TYPE_MAP[token] ?? defaultMapType(token);
}

// The named type maps an `editorModules` entry may select. A closed set, so an
// unknown selector fails loudly instead of silently falling back to the runtime
// token mapping and emitting `unknown` for every editor handle.
const NAMED_TYPE_MAPS: Readonly<Record<string, (token: string) => string>> = {
  editor: mapEditorType,
};

// The subdirectory the namespace-shaped libraries the editor VM exposes
// alongside `editor` emit into, rather than beside the runtime modules, for a
// hard reason: `tsconfig.json` includes the flat glob `generated/*.d.ts`, so an
// editor `http.d.ts` there would share a program with the runtime one and
// declare `namespace http` twice. A subdirectory keeps them out of that glob,
// the same escape `generated/versions/` and `generated/kinds/` already use.
// Because that boundary is forced, it also discriminates the two halves of a
// target's declaration: the `editor` namespace a kind index names directly, and
// the VM libraries it must import by explicit path.
export const EDITOR_VM_SUBDIR = "editor-vm/";

export function isEditorVmModule(module: { readonly outFile: string }): boolean {
  return module.outFile.startsWith(EDITOR_VM_SUBDIR);
}

function oneLevelDeeper(importPath: string): string {
  return importPath.startsWith("./") ? `../${importPath.slice(2)}` : `../${importPath}`;
}

// The editor-scripting surface a target declares. Vendored and emitted through
// the same pipeline as MODULE_MANIFEST but deliberately separate from it:
// MODULE_MANIFEST drives every runtime kind's universal imports, the per-version
// targets and the published API artifacts, none of which describe the editor VM.
// Reached only through the `editor-script` kind index.
//
// The `skipFunctions` rules a target declares in `api-targets.json` withhold
// members for reasons the registry data alone cannot state. Rules are local
// names — the `<namespace>.` prefix is stripped before matching — and they
// withhold VARIABLEs as well as FUNCTIONs.
//
// On the `editor` entry, the editor VM's own `http`/`json`/`zip`/`zlib`/
// `pprint`/`localization`/`tilemap.tiles` sit in that same upstream document
// under their own top-level namespaces. They are emitted from their own
// per-namespace fixtures instead, and skipped on `editor` so that entry cannot
// misname them as `editor.*` — `pprint`, a flat identifier, would otherwise land
// as `editor.pprint`. `command` is the one rule there that is not a dropped
// namespace prefix: the hand-authored `src/editor-overloads.d.ts` supplies
// `editor.command` with a generic signature that couples a command's opts bag to
// its own query, which the emitter cannot express.
//
// On a VM entry, the withheld members are hand-authored in
// `src/editor-vm-globals.d.ts` instead. The functions are ones whose vendored
// signature the emitter cannot render soundly, both causes being the fixture's
// positional model being a lossy description of the Lua function its own
// `examples` block calls: an optional parameter sitting *before* a required one
// (TypeScript cannot mark a middle parameter `?`, so the emit renders it
// `T | undefined` and rejects every documented short form), and an empty
// `returnvalues` on a function upstream's own prose says returns a value.
//
// The constant tables are expressible now that the nested pass reaches
// variables, but a VARIABLE carries no `types`, so the emit would be `unknown` —
// and `ZipPackOptions.method?: string` rejects that. Their brief is the literal
// value, which looks like a string-literal type until you notice upstream's own
// `zip.ON_CONFLICT.OVERWRITE` reads `"skip"`, so no type is derived from it.
// The hand-authored declarations stay authoritative and these stay withheld.
export function loadTargetEditorModules(
  target: ApiTarget,
  packageRoot: string = PACKAGE_ROOT,
): ModuleManifestEntry[] {
  return (target.editorModules ?? []).map((module) => {
    const path = resolve(packageRoot, target.fixturesDir, module.fixture);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      throw new Error(
        `api-targets.json: target "${target.id}" editor module "${module.namespace}" fixture not found: ${path}`,
      );
    }
    if (module.mapType !== undefined && NAMED_TYPE_MAPS[module.mapType] === undefined) {
      throw new Error(
        `api-targets.json: target "${target.id}" editor module "${module.namespace}": unknown mapType "${module.mapType}"`,
      );
    }
    const entry: ModuleManifestEntry = {
      namespace: module.namespace,
      doc: JSON.parse(raw),
      outFile: module.outFile,
      // A VM module sits one directory below the rest of the surface, so it
      // cannot ride the target's own `coreTypesImport` unchanged. Deriving the
      // deeper form keeps a relocated surface (a materialized `.defold-types/`
      // copy rewrites `coreTypesImport` to `./core-types`) resolving too.
      importsFrom:
        module.importsFrom ??
        (isEditorVmModule(module)
          ? oneLevelDeeper(target.coreTypesImport)
          : target.coreTypesImport),
      ...(module.skipFunctions ? { skipFunctions: module.skipFunctions } : {}),
      ...(module.mapType ? { mapType: NAMED_TYPE_MAPS[module.mapType] } : {}),
    };
    return entry;
  });
}

const DEFAULT_EDITOR_MODULES = loadTargetEditorModules(DEFAULT_TARGET);

export const EDITOR_MODULE_MANIFEST: readonly ModuleManifestEntry[] = DEFAULT_EDITOR_MODULES.filter(
  (entry) => !isEditorVmModule(entry),
);

export const EDITOR_VM_MODULE_MANIFEST: readonly ModuleManifestEntry[] =
  DEFAULT_EDITOR_MODULES.filter(isEditorVmModule);

export const EDITOR_SKIP_FUNCTIONS: readonly string[] =
  EDITOR_MODULE_MANIFEST.find((entry) => entry.namespace === "editor")?.skipFunctions ?? [];

export interface MessagesManifestEntry {
  readonly doc: unknown;
  readonly outFile: string;
}

// Unlike MODULE_MANIFEST, this surface is hand-maintained: Defold ships no
// machine-readable export for built-in message ids, so refresh fixtures/
// messages_doc.json by hand from the Defold API reference. The
// message-payload-drift test guards the payload shapes against drift.
export const MESSAGES_MANIFEST: MessagesManifestEntry = {
  doc: messagesDoc,
  outFile: "builtin-messages.d.ts",
};

export function generateBuiltinMessagesDeclaration(entry: MessagesManifestEntry): string {
  return emitBuiltinMessages(applyMessageDeprecations(parseMessagesDoc(entry.doc)));
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

const URL_PARAMETERS_PATH = resolve(PACKAGE_ROOT, "url-parameters.json");

// The committed classification table, read once. Both the `.d.ts` emit and the
// authoritative-signature emit default to it, so the two surfaces cannot
// disagree about which slots address the scene graph.
export function loadUrlParameters(path: string = URL_PARAMETERS_PATH): UrlParameterTable {
  return JSON.parse(readFileSync(path, "utf8")) as UrlParameterTable;
}

let urlParametersCache: UrlParameterTable | null = null;

function committedUrlParameters(): UrlParameterTable {
  urlParametersCache ??= loadUrlParameters();
  return urlParametersCache;
}

export interface GenerateOptions {
  knownConstantFqns?: ReadonlySet<string>;
  translations?: TranslationStore;
  urlParameters?: UrlParameterTable;
}

interface PreparedGeneratedModule {
  module: ApiModule;
  knownConstantFqns: ReadonlySet<string>;
  translations: TranslationStore;
  urlParameters: UrlParameterTable;
  mapType: ((token: string) => string) | undefined;
  dropped: string[];
}

// Parse a manifest entry, apply its `skipFunctions` filter, and resolve the
// shared constant-brand universe and translations. Both the `.d.ts` emit and
// the authoritative-signature emit run off this identical prepared module, so a
// dropped member never appears in either surface.
function prepareGeneratedModule(
  entry: ModuleManifestEntry,
  options?: GenerateOptions,
): PreparedGeneratedModule {
  const module = parseDefoldApiDoc(entry.doc);
  const prefix = `${module.namespace}.`;
  const dropped: string[] = [];
  const rules = entry.skipFunctions ?? [];
  const exact = new Set(rules.filter((rule) => !rule.endsWith(".")));
  const segments = rules.filter((rule) => rule.endsWith("."));
  const withheld = (name: string): boolean => {
    const local = name.startsWith(prefix) ? name.slice(prefix.length) : name;
    if (!exact.has(local) && !segments.some((segment) => local.startsWith(segment))) return false;
    dropped.push(name);
    return true;
  };
  module.functions = module.functions.filter((fn) => !withheld(fn.name));
  module.variables = module.variables.filter((v) => !withheld(v.name));
  const knownConstantFqns = options?.knownConstantFqns ?? collectConstantFqns();
  const translations = options?.translations ?? loadTranslations();
  const urlParameters = options?.urlParameters ?? committedUrlParameters();
  return {
    module,
    knownConstantFqns,
    translations,
    urlParameters,
    mapType: entry.mapType,
    dropped,
  };
}

export function generateModuleDeclaration(
  entry: ModuleManifestEntry,
  options?: GenerateOptions,
): GenerateResult {
  const { module, knownConstantFqns, translations, urlParameters, mapType, dropped } =
    prepareGeneratedModule(entry, options);
  const emitted = emitDeclarations(module, {
    knownConstantFqns,
    translations,
    urlParameters,
    ...(mapType ? { mapType } : {}),
  });
  const importsFrom = entry.importsFrom ?? "../src/core-types";
  const contents = entry.moduleId
    ? wrapAsModule({ namespace: module.namespace, emitted, importsFrom, moduleId: entry.moduleId })
    : wrapAsAmbientGlobal({ namespace: module.namespace, emitted, importsFrom });
  return { contents, dropped };
}

// The authoritative per-symbol signatures for a manifest entry, rendered through
// the same prepared module (skip filter + constant branding) as
// `generateModuleDeclaration`, so every signature corresponds to the committed
// `.d.ts` byte-for-byte.
export function generateModuleSignatures(
  entry: ModuleManifestEntry,
  options?: GenerateOptions,
): SymbolSignature[] {
  const { module, knownConstantFqns, urlParameters, mapType } = prepareGeneratedModule(
    entry,
    options,
  );
  return emitSymbolSignatures(module, {
    knownConstantFqns,
    urlParameters,
    ...(mapType ? { mapType } : {}),
  });
}

export interface VersionedModuleManifestEntry extends ModuleManifestEntry {
  readonly versionId: string;
  // Set on an entry derived from the target's `editorModules`. The editor
  // surface rides the same per-version emit as the runtime modules but never the
  // version's aggregate index — importing it there would drag the editor VM into
  // every runtime program pinned to that version.
  readonly editor?: boolean;
}

// Committed generation covers only filesystem-fixture targets (source == null).
// ref-doc targets are resolved on the fly and never pre-baked, so they are
// excluded from the committed regen loop and the byte-drift guards.
export function versionedModuleManifest(
  targets: readonly ApiTarget[],
  packageRoot: string = PACKAGE_ROOT,
): VersionedModuleManifestEntry[] {
  return targets
    .filter((target) => target.default !== true && (target.source ?? null) == null)
    .flatMap((target) => [
      ...loadTargetModules(target, packageRoot).map((entry) => ({
        ...entry,
        versionId: target.id,
      })),
      ...loadTargetEditorModules(target, packageRoot).map((entry) => ({
        ...entry,
        versionId: target.id,
        editor: true,
      })),
    ]);
}

export const VERSIONED_MODULE_MANIFEST: readonly VersionedModuleManifestEntry[] =
  versionedModuleManifest(API_TARGETS);

export const RESTRICTED_NAMESPACES: Readonly<Record<string, string>> = {
  gui: "gui_script",
  render: "render_script",
};

// The Lua standard library rides every per-kind subpath the same as the full
// entrypoint. Triple-slash directives must precede the first statement, so they
// lead the generated kind index. The two lines select independently: the game
// runtime is LuaJIT, but the editor VM is plain Lua 5.1 and has no `bit`.
const LUA_51_REFERENCE = '/// <reference types="lua-types/5.1" />\n';
const LUA_JIT_ONLY_REFERENCE = '/// <reference types="lua-types/special/jit-only" />\n';
export const LUA_STDLIB_REFERENCES = `${LUA_51_REFERENCE}${LUA_JIT_ONLY_REFERENCE}`;

// The stdlib references a kind's own VM earns. Shared with the materialized
// renderer so a surface generated on the fly makes the same LuaJIT call the
// committed emit does.
export function kindStdlibReferences(entry: KindManifestEntry): string {
  return `${LUA_51_REFERENCE}${entry.jit === false ? "" : LUA_JIT_ONLY_REFERENCE}`;
}

const UNIVERSAL_EXTRA_IMPORTS: readonly string[] = [
  "../builtin-messages",
  "../../src/engine-globals",
  "../../src/msg-overloads",
  "../../src/message-guard",
  "../../src/window-event-guard",
  "../../src/scene-addresses",
  "../../src/go-overloads",
  "../../src/vmath-overloads",
];

const DEFAULT_FACTORY_MODULE = "../../src/lifecycle";

export interface KindManifestEntry {
  readonly kind: string;
  readonly restricted?: string;
  readonly factory: string;
  // Replaces the universal import set with exactly these generated modules. A
  // kind that names one is disjoint from the runtime surface, not a narrowing
  // of it, so it takes none of the universal extras either.
  readonly only?: readonly string[];
  // Hand-authored ambient modules the kind imports on top of `only`. A kind
  // naming `only` takes none of `UNIVERSAL_EXTRA_IMPORTS`, so it cannot ride
  // that set to reach an overload file.
  readonly extraModules?: readonly string[];
  // Extra value exports the factory module contributes to the kind subpath.
  readonly extraExports?: readonly string[];
  // Extra type-only exports the factory module contributes to the kind subpath.
  readonly extraTypeExports?: readonly string[];
  // Where the factory (and, when emitted, the script-property helper types) is
  // re-exported from. Defaults to the runtime lifecycle module.
  readonly factoryFrom?: string;
  // Whether the kind has script properties at all. Editor scripts do not.
  readonly propertyTypes?: boolean;
  // Whether the kind's VM is LuaJIT. The editor runs plain Lua 5.1.
  readonly jit?: boolean;
}

export const KIND_MODULE_MANIFEST: readonly KindManifestEntry[] = [
  { kind: "script", factory: "defineScript" },
  { kind: "gui-script", restricted: "gui", factory: "defineGuiScript" },
  { kind: "render-script", restricted: "render", factory: "defineRenderScript" },
  {
    kind: "editor-script",
    // Empty on purpose: the emitted namespaces come from the declaring target's
    // `editorModules` (see `editorKindModules`), and the empty array is what
    // marks the kind as disjoint from the runtime surface rather than a
    // narrowing of it.
    only: [],
    extraModules: ["../../src/editor-overloads", "../../src/editor-vm-globals"],
    factory: "defineEditorScript",
    extraExports: ["defineEditorCommand"],
    extraTypeExports: ["EditorCommandQuery", "EditorNode"],
    factoryFrom: "../../src/editor",
    propertyTypes: false,
    jit: false,
  },
];

// The kinds every materialized *versioned* surface carries, whatever the target.
// An `only` kind is built from the target's own `editorModules`, so it has a
// versioned form only for a target that declares an editor document — see
// `targetKindManifest`, which is what a per-target emit resolves through.
export const RUNTIME_KIND_MANIFEST: readonly KindManifestEntry[] = KIND_MODULE_MANIFEST.filter(
  (entry) => entry.only === undefined,
);

// The emitted modules an editor kind index imports, read from the declaring
// target rather than from a list beside the kind entry, so a pinned surface
// names its own editor document instead of the default target's. The plain
// namespace leads and the VM libraries follow by explicit path — `only` holds
// namespaces and would build `../http` (the runtime module) and
// `../tilemap.tiles` (not a path) for those.
function editorKindModules(target: ApiTarget): string[] {
  const declared = target.editorModules ?? [];
  if (declared.length === 0) {
    throw new Error(`api-targets.json: target "${target.id}" declares no editor document`);
  }
  return [
    ...declared.filter((m) => !isEditorVmModule(m)),
    ...declared.filter(isEditorVmModule),
  ].map((m) => `../${m.outFile.replace(/\.d\.ts$/, "")}`);
}

export function generateKindIndex(kind: string, target: ApiTarget = DEFAULT_TARGET): string {
  const entry = KIND_MODULE_MANIFEST.find((e) => e.kind === kind);
  if (!entry) throw new Error(`unknown script kind: ${kind}`);
  const srcPrefix = targetSrcPrefix(target);
  const universalNamespaces = MODULE_MANIFEST.filter(
    (m) => !Object.hasOwn(RESTRICTED_NAMESPACES, m.namespace),
  ).map((m) => `../${m.outFile.replace(/\.d\.ts$/, "")}`);
  const modules = (
    entry.only === undefined
      ? [...new Set([...universalNamespaces.sort(), ...[...UNIVERSAL_EXTRA_IMPORTS].sort()])]
      : [...editorKindModules(target), ...(entry.extraModules ?? [])]
  ).map((path) => retargetSrcPath(path, srcPrefix));
  const lines = modules.map((path) => `import "${path}";`);
  if (entry.restricted) lines.push(`import "../${entry.restricted}";`);
  const references = kindStdlibReferences(entry);
  const from = retargetSrcPath(entry.factoryFrom ?? DEFAULT_FACTORY_MODULE, srcPrefix);
  const values = [entry.factory, ...(entry.extraExports ?? [])].join(", ");
  const typeExports = entry.extraTypeExports?.length
    ? `\nexport type { ${entry.extraTypeExports.join(", ")} } from "${from}";`
    : "";
  const properties =
    entry.propertyTypes === false
      ? ""
      : `\nexport type { ScriptProperties, ScriptProperty } from "${from}";`;
  return `${references}${lines.join("\n")}\n\nexport { ${values} } from "${from}";${typeExports}${properties}\n`;
}

export function generateVersionIndex(
  versionId: string,
  manifest: readonly VersionedModuleManifestEntry[] = VERSIONED_MODULE_MANIFEST,
): string {
  const imports = manifest
    .filter((entry) => entry.versionId === versionId && entry.editor !== true)
    .map((entry) => entry.outFile.replace(/\.d\.ts$/, ""))
    .sort()
    .map((module) => `import "./${module}";`)
    .join("\n");
  return `${imports}\n\nexport {};\n`;
}

// The `src/`-relative prefix a kind index living in `<generatedDir>/kinds/` needs
// to reach the package's hand-authored modules. The target's own
// `coreTypesImport` already measures its generated dir's depth; the kind index
// sits one level below it.
function targetSrcPrefix(target: ApiTarget): string {
  return `../${target.coreTypesImport.slice(0, -"core-types".length)}`;
}

const DEFAULT_SRC_PREFIX = "../../src/";

function retargetSrcPath(modulePath: string, srcPrefix: string): string {
  return modulePath.startsWith(DEFAULT_SRC_PREFIX)
    ? `${srcPrefix}${modulePath.slice(DEFAULT_SRC_PREFIX.length)}`
    : modulePath;
}

// The kinds a materialized surface for `target` can carry: the runtime trio
// always, plus the editor kind when — and only when — the target declares an
// editor document of its own.
export function targetKindManifest(target: ApiTarget): readonly KindManifestEntry[] {
  if ((target.editorModules?.length ?? 0) === 0) {
    return RUNTIME_KIND_MANIFEST;
  }
  return [...RUNTIME_KIND_MANIFEST, ...KIND_MODULE_MANIFEST.filter((e) => e.only !== undefined)];
}

if (import.meta.main) {
  const generated = resolve(import.meta.dir, "..", "generated");
  mkdirSync(resolve(generated, "editor-vm"), { recursive: true });
  for (const entry of [
    ...MODULE_MANIFEST,
    ...EDITOR_MODULE_MANIFEST,
    ...EDITOR_VM_MODULE_MANIFEST,
  ]) {
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

  // The target's own `generatedDir` is where a version lands, so a declaring
  // target's editor surface (and its `editor-vm/` subdirectory) rides the same
  // destination rule as its runtime modules rather than a second convention.
  const versionedTargets = API_TARGETS.filter(
    (target) => target.default !== true && (target.source ?? null) == null,
  );
  const versionDirOf = (versionId: string): string => {
    const target = versionedTargets.find((t) => t.id === versionId);
    if (!target) throw new Error(`no committed target for version ${versionId}`);
    return resolve(PACKAGE_ROOT, target.generatedDir);
  };
  for (const entry of VERSIONED_MODULE_MANIFEST) {
    const { contents, dropped } = generateModuleDeclaration(entry);
    if (dropped.length > 0) {
      console.log(
        `note: dropped skipped member(s) from ${entry.versionId}/${entry.namespace}: ${dropped.join(", ")}`,
      );
    }
    const out = resolve(versionDirOf(entry.versionId), entry.outFile);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, contents);
    console.log(`wrote ${out}`);
  }
  for (const target of versionedTargets) {
    const indexOut = resolve(versionDirOf(target.id), "index.d.ts");
    mkdirSync(dirname(indexOut), { recursive: true });
    writeFileSync(indexOut, generateVersionIndex(target.id));
    console.log(`wrote ${indexOut}`);

    const editorKinds = targetKindManifest(target).filter((entry) => entry.only !== undefined);
    if (editorKinds.length === 0) continue;
    const versionKindsDir = resolve(versionDirOf(target.id), "kinds");
    mkdirSync(versionKindsDir, { recursive: true });
    for (const entry of editorKinds) {
      const out = resolve(versionKindsDir, `${entry.kind}.d.ts`);
      writeFileSync(out, generateKindIndex(entry.kind, target));
      console.log(`wrote ${out}`);
    }
  }

  const kindsDir = resolve(generated, "kinds");
  mkdirSync(kindsDir, { recursive: true });
  for (const entry of KIND_MODULE_MANIFEST) {
    const out = resolve(kindsDir, `${entry.kind}.d.ts`);
    writeFileSync(out, generateKindIndex(entry.kind));
    console.log(`wrote ${out}`);
  }
}
