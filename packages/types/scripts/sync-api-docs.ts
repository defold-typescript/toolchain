import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type ApiModule, parseDefoldApiDoc } from "../src/api-doc";
import { DEFOLD_TYPE_MAP } from "../src/core-types";
import { parseScriptApi } from "../src/script-api";
import { MODULE_MANIFEST } from "./regen";

export const DEFOLD_VERSION = "1.12.4";
export const refDocUrl = (version = DEFOLD_VERSION): string =>
  `https://github.com/defold/defold/releases/download/${version}/ref-doc.zip`;

export interface SyncManifestEntry {
  readonly namespace: string;
  readonly zipEntry: string;
  readonly fixture: string;
  // Extra ref-doc.zip entries whose elements are merged into this namespace at
  // sync time. A namespace whose Lua surface is split across several upstream
  // docs (e.g. `sys`) is reassembled before parse, so the emitter still sees one
  // fixture, one namespace.
  readonly mergeEntries?: readonly string[];
}

// namespace -> ref-doc.zip entry. Entry paths do not match the namespace (gui ->
// gui_script, go -> gameobject_script, most -> scripts-script_<n> / src-script_<n>),
// so each path is confirmed against the pinned release artifact, not derived.
export const SYNC_MANIFEST: readonly SyncManifestEntry[] = [
  entry("b2d", "doc/scripts-box2d-script_box2d.cpp_doc.json"),
  // On-disk name uses underscores to avoid a double-dotted filename; the namespace
  // string stays `b2d.body` so /api/b2d.body routes correctly and the emitter
  // produces `declare global { namespace b2d.body { ... } }`. Use the non-`_defold`
  // variant — the `_defold` variant has duplicate `get_world_center` elements.
  entry(
    "b2d.body",
    "doc/scripts-box2d-script_box2d_body.cpp_doc.json",
    "fixtures/b2d_body_doc.json",
  ),
  entry("buffer", "doc/scripts-script_buffer.cpp_doc.json"),
  // camera's Lua surface lives in the render-script doc, not the scripts-script
  // one (`doc/scripts-script_camera.cpp_doc.json` is empty upstream in 1.12.4).
  entry("camera", "doc/render-render_script_camera.cpp_doc.json"),
  entry("collectionfactory", "doc/scripts-script_collection_factory.cpp_doc.json"),
  entry("collectionproxy", "doc/scripts-script_collectionproxy.cpp_doc.json"),
  entry("crash", "doc/script_crash.cpp_doc.json"),
  entry("factory", "doc/scripts-script_factory.cpp_doc.json"),
  entry("font", "doc/scripts-script_font.cpp_doc.json"),
  entry("go", "doc/gameobject_script.cpp_doc.json"),
  entry("graphics", "doc/src-script_graphics.cpp_doc.json"),
  entry("gui", "doc/gui_script.cpp_doc.json"),
  entry("html5", "doc/src-script_html5_js.cpp_doc.json"),
  entry("http", "doc/scripts-script_http.cpp_doc.json"),
  entry("image", "doc/scripts-script_image.cpp_doc.json"),
  entry("json", "doc/src-script_json.cpp_doc.json"),
  entry("label", "doc/scripts-script_label.cpp_doc.json"),
  entry("liveupdate", "doc/src-script_liveupdate.h_doc.json"),
  entry("model", "doc/scripts-script_model.cpp_doc.json"),
  entry("msg", "doc/src-script_msg.cpp_doc.json"),
  entry("particlefx", "doc/scripts-script_particlefx.cpp_doc.json"),
  entry("physics", "doc/scripts-script_physics.cpp_doc.json"),
  entry("profiler", "doc/profiler.cpp_doc.json"),
  entry("render", "doc/render-render_script.cpp_doc.json"),
  entry("resource", "doc/scripts-script_resource.cpp_doc.json"),
  entry("socket", "doc/luasocket-luasocket.doc_h_doc.json"),
  entry("sound", "doc/scripts-script_sound.cpp_doc.json"),
  entry("sprite", "doc/scripts-script_sprite.cpp_doc.json"),
  // The `sys` Lua surface is split across three docs in ref-doc.zip: the core
  // (src-script_sys), the gamesys subset (`load_buffer`/`load_buffer_async` plus
  // the `REQUEST_STATUS_*` constants), and the engine doc (`set_engine_throttle`/
  // `set_render_enable`). `mergeEntries` folds all three into one fixture at sync
  // time. The `*_ddf.proto` doc is deliberately excluded — it is message-shaped
  // and owned by the builtin-messages catalog.
  entry("sys", "doc/src-script_sys.cpp_doc.json", "fixtures/sys_doc.json", [
    "doc/scripts-script_sys_gamesys.cpp_doc.json",
    "doc/script-script_engine.cpp_doc.json",
  ]),
  entry("tilemap", "doc/scripts-script_tilemap.cpp_doc.json"),
  entry("timer", "doc/src-script_timer.cpp_doc.json"),
  entry("types", "doc/src-script_types.cpp_doc.json"),
  entry("vmath", "doc/src-script_vmath.cpp_doc.json"),
  entry("window", "doc/scripts-script_window.cpp_doc.json"),
  entry("zlib", "doc/src-script_zlib.cpp_doc.json"),
];

// Checklist namespaces with no machine-readable doc anywhere (neither core
// ref-doc.zip nor a published extension `.script_api`). Currently empty: the
// four extension-only surfaces are wired via EXTENSION_MANIFEST below.
export const UNMAPPED: ReadonlyMap<string, string> = new Map();

// A Lua script namespace is a lowercase, dot-separated identifier (`sys`,
// `b2d.body`). The native C/C++ SDK docs (`dmGraphics`, …), the C# bindings
// (`cs-*`), and the struct-only docs (empty `info.namespace`) fail this shape,
// so the upstream-coverage guard skips them structurally rather than listing
// each by hand — that keeps the guard self-maintaining as the SDK grows.
const LUA_NAMESPACE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;

// Lowercase-identifier namespaces that pass LUA_NAMESPACE but are intentionally
// not wired through SYNC_MANIFEST, each with a sourced reason (mirrors the
// `EMPTY_BY_UPSTREAM` allowlist shape). The upstream-coverage guard treats these
// as covered. Adding a namespace here is a deliberate, reviewed act.
export const IGNORED_UPSTREAM: ReadonlyMap<string, string> = new Map([
  ["editor", "editor-scripting API (editor.apidoc), not a runtime game namespace"],
  ["engine", "CLI/engine env doc, not a runtime Lua namespace"],
  [
    "builtins",
    "global Defold builtins (hash/pprint/…) typed as ambient globals, not a `builtins.*` namespace",
  ],
]);

// Pure-Lua / LuaJIT surfaces Defold documents (https://defold.com/ref/stable/base-lua/,
// `bit-lua`) whose TypeScript types are owned by the `lua-types` dependency the
// `lua-stdlib-globals` goal adopted — `lua-types/special/jit-only.d.ts` declares
// `declare namespace bit { ... }` and `lua-types/core/global.d.ts` carries the
// base globals. Re-emitting them as generated Defold namespaces would collide
// (`declare namespace bit` duplicates; base globals are top-level globals, not
// a `base.*` namespace). LUA_STDLIB_MANIFEST vendors the same ref-doc JSON
// `SYNC_MANIFEST` carries, but the docs-site is the only consumer — `regen.ts`
// / `MODULE_MANIFEST` never read it, so no `generated/<ns>.d.ts` is produced.
export const LUA_STDLIB_MANIFEST: readonly SyncManifestEntry[] = [
  entry("base", "doc/lua_base.doc_h_doc.json"),
  entry("bit", "doc/src-script_bitop.cpp_doc.json"),
  // Core Lua stdlib docs. The 1.12.4 release names these `doc/lua_<ns>.doc_h_doc.json`
  // (confirmed against the pinned ref-doc.zip, not derived — the naming drifted from
  // the 1.9.8 `doc/<ns>_doc.json` form). Typed by the lua-types dependency, so docs-only.
  entry("math", "doc/lua_math.doc_h_doc.json"),
  entry("os", "doc/lua_os.doc_h_doc.json"),
  entry("string", "doc/lua_string.doc_h_doc.json"),
  entry("table", "doc/lua_table.doc_h_doc.json"),
  entry("coroutine", "doc/lua_coroutine.doc_h_doc.json"),
  // Sandboxed-runtime stdlib surfaces. Defold sandboxes the Lua VM, but the pinned
  // 1.12.4 ref-doc.zip documents all three with real function elements; types stay
  // owned by lua-types (core/{debug,io}.d.ts + core/modules.d.ts for `package`).
  entry("debug", "doc/lua_debug.doc_h_doc.json"),
  entry("io", "doc/lua_io.doc_h_doc.json"),
  entry("package", "doc/lua_package.doc_h_doc.json"),
];

function entry(
  namespace: string,
  zipEntry: string,
  fixture: string = `fixtures/${namespace}_doc.json`,
  mergeEntries?: readonly string[],
): SyncManifestEntry {
  return { namespace, zipEntry, fixture, ...(mergeEntries ? { mergeEntries } : {}) };
}

export interface ExtensionManifestEntry {
  readonly namespace: string;
  readonly repo: string;
  readonly tag: string;
  readonly path: string;
  readonly fixture: string;
}

// Extension-only namespaces: each ships a single `.script_api` (YAML) doc in
// its own repo rather than appearing in core ref-doc.zip. Pinned to a release
// tag and converted to the core ref-doc JSON shape via parseScriptApi so they
// flow through MODULE_MANIFEST and the drift guard like every core namespace.
export const EXTENSION_MANIFEST: readonly ExtensionManifestEntry[] = [
  ext("iac", "defold/extension-iac", "1.4.0", "extension-iac/api/iac.script_api"),
  ext("iap", "defold/extension-iap", "8.4.0", "extension-iap/api/iap.script_api"),
  ext("push", "defold/extension-push", "4.1.0", "extension-push/api/push.script_api"),
  ext("webview", "defold/extension-webview", "1.5.0", "webview/api/webview.script_api"),
];

function ext(namespace: string, repo: string, tag: string, path: string): ExtensionManifestEntry {
  return { namespace, repo, tag, path, fixture: `fixtures/${namespace}_doc.json` };
}

export const extensionRawUrl = (e: ExtensionManifestEntry): string =>
  `https://raw.githubusercontent.com/${e.repo}/${e.tag}/${e.path}`;

// Convert a raw `.script_api` YAML doc to the core ref-doc JSON string written
// to fixtures/<ns>_doc.json. The result is byte-compared by the same drift
// semantics core fixtures use.
export function scriptApiToFixtureJson(text: string): string {
  return JSON.stringify(parseScriptApi(text));
}

// The types-api-coverage `What` checklist in vision.md lists every namespace as
// a backtick-quoted token on the "Concrete breadth checklist" line. Reading it
// here keeps SYNC_MANIFEST + UNMAPPED honest against the source of truth: the
// coverage test fails if the checklist gains a namespace neither maps.
export function parseChecklistNamespaces(visionMarkdown: string): string[] {
  const start = visionMarkdown.indexOf("Concrete breadth checklist");
  if (start === -1) return [];
  const lineEnd = visionMarkdown.indexOf("\n", start);
  const line = visionMarkdown.slice(start, lineEnd === -1 ? undefined : lineEnd);
  const afterParen = line.slice(line.indexOf("):") + 2);
  const shipped = afterParen.indexOf("Currently shipped");
  const segment = shipped === -1 ? afterParen : afterParen.slice(0, shipped);
  const namespaces: string[] = [];
  const seen = new Set<string>();
  for (const match of segment.matchAll(/`([^`]+)`/g)) {
    const token = match[1] as string;
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(token) || seen.has(token)) continue;
    seen.add(token);
    namespaces.push(token);
  }
  return namespaces;
}

export interface ZipAccessor {
  has(entry: string): boolean;
  read(entry: string): string;
  // Surfaces the same entry set `has` is built from, so the extension-archive
  // resolver can hand the list to the pure `locateScriptApis` / `classifyExtension`.
  entries(): string[];
}

export function readZip(path: string): ZipAccessor {
  const list = Bun.spawnSync(["unzip", "-Z1", path]);
  if (list.exitCode !== 0) {
    throw new Error(`unzip -Z1 failed for ${path}: ${list.stderr.toString()}`);
  }
  const entries = new Set(list.stdout.toString().split("\n").filter(Boolean));
  return {
    has: (name) => entries.has(name),
    entries: () => [...entries],
    read: (name) => {
      const out = Bun.spawnSync(["unzip", "-p", path, name]);
      if (out.exitCode !== 0) {
        throw new Error(`unzip -p failed for ${name} in ${path}: ${out.stderr.toString()}`);
      }
      return out.stdout.toString();
    },
  };
}

export async function downloadZip(version = DEFOLD_VERSION): Promise<ZipAccessor> {
  const url = refDocUrl(version);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), "defold-ref-doc-"));
  const zipPath = join(dir, "ref-doc.zip");
  writeFileSync(zipPath, bytes);
  return readZip(zipPath);
}

export interface ExtractedFixture {
  namespace: string;
  fixture: string;
  contents: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Concatenate the `elements` of every doc into the first doc, deduping exact
// API signatures with first occurrence winning, and keep the first doc's
// `info`. Function signatures include parameters and returns because the same
// namespace can expose backend-specific overloads under one function name.
export function mergeApiDocs(docs: readonly unknown[]): unknown {
  const first = docs[0];
  const seen = new Set<string>();
  const elements: unknown[] = [];
  for (const doc of docs) {
    if (!isRecord(doc) || !Array.isArray(doc.elements)) continue;
    const info = isRecord(doc.info) ? doc.info : null;
    const namespace = info && typeof info.namespace === "string" ? info.namespace : "";
    for (const element of doc.elements) {
      const key = apiElementIdentity(namespace, element);
      if (key !== null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      elements.push(element);
    }
  }
  return isRecord(first) ? { ...first, elements } : { elements };
}

export function apiElementIdentity(namespace: string, element: unknown): string | null {
  if (!isRecord(element) || typeof element.name !== "string" || typeof element.type !== "string") {
    return null;
  }
  const base = `${namespace}\0${element.type}\0${element.name}`;
  if (element.type !== "FUNCTION") return base;
  return `${base}\0${normalizedArguments(element.parameters)}\0${normalizedArguments(element.returnvalues)}`;
}

function normalizedArguments(value: unknown): string {
  if (!Array.isArray(value)) return "[]";
  return JSON.stringify(
    value.map((argument) => {
      if (!isRecord(argument)) return argument;
      const types = Array.isArray(argument.types)
        ? argument.types.filter((type): type is string => typeof type === "string").sort()
        : [];
      return {
        types,
        ...(argument.is_optional === undefined ? {} : { is_optional: argument.is_optional }),
      };
    }),
  );
}

export function extractFixtures(
  zip: ZipAccessor,
  manifest: readonly SyncManifestEntry[] = SYNC_MANIFEST,
): ExtractedFixture[] {
  return manifest.map((item) => {
    const sources = [item.zipEntry, ...(item.mergeEntries ?? [])];
    for (const source of sources) {
      if (!zip.has(source)) {
        throw new Error(`zip is missing entry ${source} for namespace ${item.namespace}`);
      }
    }
    const contents =
      item.mergeEntries === undefined
        ? zip.read(item.zipEntry)
        : JSON.stringify(mergeApiDocs(sources.map((source) => JSON.parse(zip.read(source)))));
    return { namespace: item.namespace, fixture: item.fixture, contents };
  });
}

export type FixtureSyncStatus = "clean" | "drift" | "created";

export interface FixtureSyncResult {
  namespace: string;
  fixture: string;
  status: FixtureSyncStatus;
}

export interface SyncOptions {
  fixturesRoot?: string;
  check?: boolean;
  manifest?: readonly SyncManifestEntry[];
  format?: (raw: string) => string;
}

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function canonicalJson(raw: string): string {
  return JSON.stringify(JSON.parse(raw));
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(["bunx", "biome", "format", "--stdin-file-path=fixture.json"], {
    stdin: Buffer.from(raw),
  });
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

export function syncFixtures(zip: ZipAccessor, options: SyncOptions = {}): FixtureSyncResult[] {
  const manifest = options.manifest ?? SYNC_MANIFEST;
  return syncExtractedFixtures(extractFixtures(zip, manifest), options);
}

// Compare/write a set of already-extracted fixtures against disk. Shared by
// the core (zip) and extension (`.script_api`) sync paths so both honor the
// identical created/clean/drift + format-on-write semantics.
export function syncExtractedFixtures(
  items: readonly ExtractedFixture[],
  options: Omit<SyncOptions, "manifest"> = {},
): FixtureSyncResult[] {
  const root = options.fixturesRoot ?? PACKAGE_ROOT;
  const check = options.check ?? false;
  const format = options.format ?? biomeFormatJson;
  const results: FixtureSyncResult[] = [];
  for (const item of items) {
    const path = resolve(root, item.fixture);
    const existing = readFixtureOrNull(path);
    const status: FixtureSyncStatus =
      existing === null
        ? "created"
        : canonicalJson(existing) === canonicalJson(item.contents)
          ? "clean"
          : "drift";
    if (!check && status !== "clean") {
      writeFileSync(path, format(item.contents));
    }
    results.push({ namespace: item.namespace, fixture: item.fixture, status });
  }
  return results;
}

export async function downloadExtensionFixtures(
  manifest: readonly ExtensionManifestEntry[] = EXTENSION_MANIFEST,
): Promise<ExtractedFixture[]> {
  const out: ExtractedFixture[] = [];
  for (const e of manifest) {
    const url = extensionRawUrl(e);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`extension doc download failed: ${url} -> ${res.status} ${res.statusText}`);
    }
    out.push({
      namespace: e.namespace,
      fixture: e.fixture,
      contents: scriptApiToFixtureJson(await res.text()),
    });
  }
  return out;
}

function readFixtureOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export interface SyncedDoc {
  namespace: string;
  doc: unknown;
}

export interface UpstreamNamespace {
  namespace: string;
  functionCount: number;
  zipEntry: string;
}

export interface UnmappedUpstreamNamespace {
  namespace: string;
  zipEntry: string;
}

export interface CoverageReport {
  wired: string[];
  fixtureOnly: string[];
  missingMapping: string[];
  unknownTypeTokens: { namespace: string; tokens: string[] }[];
  // Function-bearing Lua namespaces present in the zip but neither mapped nor
  // allowlisted — the next `font`-style miss. The `--check` path fails when this
  // is non-empty.
  unmappedUpstream: UnmappedUpstreamNamespace[];
}

export interface CoverageInput {
  manifest: readonly { namespace: string }[];
  moduleManifest: readonly { namespace: string }[];
  unmapped: ReadonlyMap<string, string>;
  syncedDocs: readonly SyncedDoc[];
  // Every function-bearing namespace the zip itself exposes (from
  // collectUpstreamNamespaces). Absent in pure-fixture callers that don't audit
  // upstream coverage, in which case unmappedUpstream is empty.
  upstream?: readonly UpstreamNamespace[];
  upstreamMapped?: ReadonlySet<string>;
  ignoredUpstream?: ReadonlyMap<string, string>;
}

// Enumerate every `doc/*.json` zip entry, reading its `info.namespace` and the
// count of FUNCTION elements. Only function-bearing docs are returned, so
// message-only / struct-only docs never reach the coverage guard.
export function collectUpstreamNamespaces(zip: ZipAccessor): UpstreamNamespace[] {
  const out: UpstreamNamespace[] = [];
  for (const zipEntry of zip.entries()) {
    if (!/^doc\/.*\.json$/.test(zipEntry)) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(zip.read(zipEntry));
    } catch {
      continue;
    }
    if (!isRecord(doc)) continue;
    const info = doc.info;
    const namespace = isRecord(info) && typeof info.namespace === "string" ? info.namespace : "";
    const elements = Array.isArray(doc.elements) ? doc.elements : [];
    let functionCount = 0;
    for (const element of elements) {
      if (isRecord(element) && element.type === "FUNCTION") functionCount += 1;
    }
    if (functionCount > 0) out.push({ namespace, functionCount, zipEntry });
  }
  return out;
}

export function buildCoverageReport(input: CoverageInput): CoverageReport {
  const wiredSet = new Set(input.moduleManifest.map((e) => e.namespace));
  const wired: string[] = [];
  const fixtureOnly: string[] = [];
  for (const item of input.manifest) {
    (wiredSet.has(item.namespace) ? wired : fixtureOnly).push(item.namespace);
  }
  const missingMapping = [...input.unmapped.keys()];

  const unknownTypeTokens: { namespace: string; tokens: string[] }[] = [];
  for (const synced of input.syncedDocs) {
    const module = parseDefoldApiDoc(synced.doc);
    const tokens = collectUnknownTokens(module);
    if (tokens.length > 0) {
      unknownTypeTokens.push({ namespace: synced.namespace, tokens });
    }
  }

  const mapped = input.upstreamMapped ?? new Set<string>();
  const ignored = input.ignoredUpstream ?? new Map<string, string>();
  const flagged = new Map<string, string>();
  for (const item of input.upstream ?? []) {
    if (
      !LUA_NAMESPACE.test(item.namespace) ||
      mapped.has(item.namespace) ||
      ignored.has(item.namespace) ||
      flagged.has(item.namespace)
    ) {
      continue;
    }
    flagged.set(item.namespace, item.zipEntry);
  }
  const unmappedUpstream = [...flagged]
    .map(([namespace, zipEntry]) => ({ namespace, zipEntry }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace));

  return { wired, fixtureOnly, missingMapping, unknownTypeTokens, unmappedUpstream };
}

function collectUnknownTokens(module: ApiModule): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const consider = (types: readonly string[]) => {
    for (const token of types) {
      if (Object.hasOwn(DEFOLD_TYPE_MAP, token) || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  };
  for (const fn of module.functions) {
    for (const param of fn.parameters) consider(param.types);
    for (const ret of fn.returnValues) consider(ret.types);
  }
  for (const variable of module.variables) consider(variable.types);
  return out;
}

function printReport(results: FixtureSyncResult[], report: CoverageReport, check: boolean): void {
  const verb = check ? "checked" : "synced";
  console.log(`${verb} ${results.length} mapped fixture(s) from Defold ${DEFOLD_VERSION}`);
  for (const status of ["created", "drift", "clean"] as const) {
    const names = results.filter((r) => r.status === status).map((r) => r.namespace);
    if (names.length > 0) console.log(`  ${status}: ${names.join(", ")}`);
  }

  console.log("\ncoverage");
  console.log(`  wired (${report.wired.length}): ${report.wired.join(", ")}`);
  console.log(`  fixture-only (${report.fixtureOnly.length}): ${report.fixtureOnly.join(", ")}`);
  console.log(
    `  missing-mapping (${report.missingMapping.length}): ${report.missingMapping.join(", ")}`,
  );

  if (report.unknownTypeTokens.length > 0) {
    console.log("\nunknown type tokens (would emit `unknown`)");
    for (const { namespace, tokens } of report.unknownTypeTokens) {
      console.log(`  ${namespace}: ${tokens.join(", ")}`);
    }
  }

  if (report.unmappedUpstream.length > 0) {
    console.log(
      "\nunmapped upstream namespaces (function-bearing, neither mapped nor allowlisted)",
    );
    for (const { namespace, zipEntry } of report.unmappedUpstream) {
      console.log(`  ${namespace}: ${zipEntry}`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const zipPath = args.find((a) => !a.startsWith("--"));
  const zip = zipPath ? readZip(zipPath) : await downloadZip();

  const coreFixtures = extractFixtures(zip);
  const extensionFixtures = await downloadExtensionFixtures();
  const luaStdlibFixtures = extractFixtures(zip, LUA_STDLIB_MANIFEST);
  const results = [
    ...syncExtractedFixtures(coreFixtures, { check }),
    ...syncExtractedFixtures(extensionFixtures, { check }),
    ...syncExtractedFixtures(luaStdlibFixtures, { check }),
  ];
  const syncedDocs = [...coreFixtures, ...extensionFixtures].map((f) => ({
    namespace: f.namespace,
    doc: JSON.parse(f.contents),
  }));
  const report = buildCoverageReport({
    manifest: [...SYNC_MANIFEST, ...EXTENSION_MANIFEST],
    moduleManifest: MODULE_MANIFEST,
    unmapped: UNMAPPED,
    syncedDocs,
    upstream: collectUpstreamNamespaces(zip),
    upstreamMapped: new Set(
      [...SYNC_MANIFEST, ...EXTENSION_MANIFEST, ...LUA_STDLIB_MANIFEST].map((e) => e.namespace),
    ),
    ignoredUpstream: IGNORED_UPSTREAM,
  });
  printReport(results, report, check);

  if (check && (results.some((r) => r.status === "drift") || report.unmappedUpstream.length > 0)) {
    process.exitCode = 1;
  }
}
