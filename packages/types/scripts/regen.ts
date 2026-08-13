import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
  // Docs-only Lua stdlib pages (no generated `.d.ts`): vendored fixtures the
  // docs-site pages under the "Lua standard library" category. Never read by
  // regen/MODULE_MANIFEST; surfaced here so the registry stays type-honest.
  readonly luaStdlib?: readonly { readonly namespace: string; readonly fixture: string }[];
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
  // Each item drops one member: an exact stripped local (`get`), or — when it
  // ends in `.` — a segment prefix dropping everything beneath it (`ui.`).
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

// The editor VM's own `http`/`json`/`zip`/`zlib`/`pprint`/`localization`/
// `tilemap.tiles` sit in this same upstream document under their own top-level
// namespaces. They are emitted from their own per-namespace fixtures through
// EDITOR_VM_MODULE_MANIFEST, and skipped here so this entry cannot misname them
// as `editor.*` — `pprint`, a flat identifier, would otherwise land as
// `editor.pprint`. `editor.ui.*` and `editor.prefs.*` have no second home yet
// and are simply dropped.
const EDITOR_SKIP_FUNCTIONS: readonly string[] = [
  // Unlike every other entry here, this is not a dropped namespace prefix: the
  // hand-authored `src/editor-overloads.d.ts` supplies `editor.command` with a
  // generic signature that couples a command's opts bag to its own query, which
  // the emitter cannot express.
  "command",
  "ui.",
  "prefs.",
  "http.",
  "json.",
  "localization.",
  "pprint",
  "tilemap.",
  "zip.",
  "zlib.",
];

// The editor-scripting surface. Vendored and emitted through the same pipeline
// as MODULE_MANIFEST but deliberately separate from it: MODULE_MANIFEST drives
// every runtime kind's universal imports, the per-version targets and the
// published API artifacts, none of which describe the editor VM. Reached only
// through the `editor-script` kind index.
export const EDITOR_MODULE_MANIFEST: readonly ModuleManifestEntry[] = [
  {
    namespace: "editor",
    doc: JSON.parse(
      readFileSync(resolve(PACKAGE_ROOT, "fixtures", "defold-1.13.0", "editor_doc.json"), "utf8"),
    ),
    outFile: "editor.d.ts",
    skipFunctions: EDITOR_SKIP_FUNCTIONS,
    mapType: mapEditorType,
  },
];

// The namespace-shaped libraries the editor VM exposes alongside `editor`. They
// emit into `generated/editor-vm/` rather than beside the runtime modules for a
// hard reason: `tsconfig.json` includes the flat glob `generated/*.d.ts`, so an
// editor `http.d.ts` there would share a program with the runtime one and
// declare `namespace http` twice. A subdirectory keeps them out of that glob,
// the same escape `generated/versions/` and `generated/kinds/` already use.
const EDITOR_VM_NAMESPACES: readonly string[] = [
  "http",
  "json",
  "localization",
  "zip",
  "zlib",
  "tilemap.tiles",
];

// The functions whose vendored signature the emitter cannot render soundly, so
// they are withheld here and hand-authored in `src/editor-vm-globals.d.ts`
// instead. Two causes, both of them the fixture's positional model being a lossy
// description of the Lua function its own `examples` block calls: an optional
// parameter sitting *before* a required one (TypeScript cannot mark a middle
// parameter `?`, so the emit renders it `T | undefined` and rejects every
// documented short form), and an empty `returnvalues` on a function upstream's
// own prose says returns a value. Rules are local names — the `<namespace>.`
// prefix is stripped before matching.
const EDITOR_VM_SKIP_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  http: ["server.route"],
  json: ["decode", "encode"],
  zip: ["pack", "unpack"],
};

const editorVmSlug = (namespace: string): string => namespace.replace(/\./g, "_");

export const EDITOR_VM_MODULE_MANIFEST: readonly ModuleManifestEntry[] = EDITOR_VM_NAMESPACES.map(
  (namespace) => ({
    namespace,
    doc: JSON.parse(
      readFileSync(
        resolve(
          PACKAGE_ROOT,
          "fixtures",
          "defold-1.13.0",
          `editor_${editorVmSlug(namespace)}_doc.json`,
        ),
        "utf8",
      ),
    ),
    outFile: `editor-vm/${editorVmSlug(namespace)}.d.ts`,
    importsFrom: "../../src/core-types",
    mapType: mapEditorType,
    ...(EDITOR_VM_SKIP_FUNCTIONS[namespace]
      ? { skipFunctions: EDITOR_VM_SKIP_FUNCTIONS[namespace] }
      : {}),
  }),
);

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
  module.functions = module.functions.filter((fn) => {
    const local = fn.name.startsWith(prefix) ? fn.name.slice(prefix.length) : fn.name;
    if (exact.has(local) || segments.some((segment) => local.startsWith(segment))) {
      dropped.push(fn.name);
      return false;
    }
    return true;
  });
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
// lead the generated kind index. The two lines select independently: the game
// runtime is LuaJIT, but the editor VM is plain Lua 5.1 and has no `bit`.
const LUA_51_REFERENCE = '/// <reference types="lua-types/5.1" />\n';
const LUA_JIT_ONLY_REFERENCE = '/// <reference types="lua-types/special/jit-only" />\n';
export const LUA_STDLIB_REFERENCES = `${LUA_51_REFERENCE}${LUA_JIT_ONLY_REFERENCE}`;

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
    only: ["editor"],
    // `only` holds namespaces and builds `../${namespace}`, which would produce
    // `../http` (the runtime module) and `../tilemap.tiles` (not a path). The
    // editor VM modules come through as explicit relative paths instead.
    extraModules: [
      ...EDITOR_VM_MODULE_MANIFEST.map((entry) => `../${entry.outFile.replace(/\.d\.ts$/, "")}`),
      "../../src/editor-overloads",
      "../../src/editor-vm-globals",
    ],
    factory: "defineEditorScript",
    extraExports: ["defineEditorCommand"],
    extraTypeExports: ["EditorCommandQuery", "EditorNode"],
    factoryFrom: "../../src/editor",
    propertyTypes: false,
    jit: false,
  },
];

// The kinds a materialized *versioned* surface can carry. An `only` kind names
// generated modules built from MODULE_MANIFEST targets, which never contain the
// editor VM, so it has no versioned form.
export const RUNTIME_KIND_MANIFEST: readonly KindManifestEntry[] = KIND_MODULE_MANIFEST.filter(
  (entry) => entry.only === undefined,
);

export function generateKindIndex(kind: string): string {
  const entry = KIND_MODULE_MANIFEST.find((e) => e.kind === kind);
  if (!entry) throw new Error(`unknown script kind: ${kind}`);
  const universalNamespaces = MODULE_MANIFEST.filter(
    (m) => !Object.hasOwn(RESTRICTED_NAMESPACES, m.namespace),
  ).map((m) => `../${m.outFile.replace(/\.d\.ts$/, "")}`);
  const modules = entry.only
    ? [...entry.only.map((namespace) => `../${namespace}`), ...(entry.extraModules ?? [])]
    : [...new Set([...universalNamespaces.sort(), ...[...UNIVERSAL_EXTRA_IMPORTS].sort()])];
  const lines = modules.map((path) => `import "${path}";`);
  if (entry.restricted) lines.push(`import "../${entry.restricted}";`);
  const references = `${LUA_51_REFERENCE}${entry.jit === false ? "" : LUA_JIT_ONLY_REFERENCE}`;
  const from = entry.factoryFrom ?? DEFAULT_FACTORY_MODULE;
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
    .filter((entry) => entry.versionId === versionId)
    .map((entry) => entry.outFile.replace(/\.d\.ts$/, ""))
    .sort()
    .map((module) => `import "./${module}";`)
    .join("\n");
  return `${imports}\n\nexport {};\n`;
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
