import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiAvailability,
  parseDefoldApiDoc,
  type SignatureStore,
  symbolIdentityKey,
  type TranslationStore,
} from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory, AvailabilityLookup, LibraryMeta } from "./api-surface";
import {
  buildCombinedSurface,
  type CombinedSurface,
  type SignaturesArtifact,
} from "./combined-surface";
import { parseGlobalTypes } from "./global-types";

interface ApiTarget {
  id: string;
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string }[];
  luaStdlib?: { namespace: string; fixture: string }[];
}

export interface ApiVersion {
  id: string;
  isDefault: boolean;
}

// The same `examples/translations.json` the `.d.ts` emit consumes; a missing
// file degrades gracefully to an empty store (every example renders its Lua
// fallback). The shipped `src/example-store.ts` stays node-free, so the file
// read lives here in the docs-site rather than in the types entry graph.
function loadTranslationStore(typesDir: string): TranslationStore {
  const path = join(typesDir, "examples", "translations.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as TranslationStore;
}

// Merge every `signatures/*.json` override file into one store; an absent dir
// degrades to an empty store (every signature renders its ref-doc form). Like
// `loadTranslationStore`, the file read lives here rather than in the node-free
// types entry graph. Keys are FQNs and never collide across the per-namespace
// files, so a flat `Object.assign` merge is sufficient.
function loadSignatureStore(typesDir: string): SignatureStore {
  const dir = join(typesDir, "signatures");
  if (!existsSync(dir)) return {};
  const stores = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")) as SignatureStore);
  return Object.assign({}, ...stores);
}

// The committed `api-availability.json` (the N-version presence matrix plus the
// curated migration overlay), read into a versions-axis + identity-keyed lookup
// the projection joins by exact overload identity. A missing file degrades to
// `undefined` — the surface renders with no lifecycle badges, exactly as before
// the artifact existed. The same lookup is attached to every page of every
// version: a record only matches on a surface that actually contains that
// identity, so sharing it across the canonical and historical surfaces is safe.
function loadAvailability(typesDir: string): AvailabilityLookup | undefined {
  const path = join(typesDir, "api-availability.json");
  if (!existsSync(path)) return undefined;
  const { versions, records } = JSON.parse(readFileSync(path, "utf8")) as {
    versions: string[];
    records: ApiAvailability[];
  };
  return {
    versions,
    records: new Map(records.map((record) => [symbolIdentityKey(record.identity), record])),
  };
}

function readTargets(typesDir: string): ApiTarget[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };
  return targets;
}

interface LibraryClassification {
  source: { repo: string; commit: string; license: string };
  dirs: { dir: string; modules: string[] }[];
}

interface LibraryTargets {
  targets: { module: string; path: string }[];
}

// The `/api/<slug>` route for a dotted library module. honox SSG emits a clean
// static file for a literal dot (`…/monarch.monarch/index.html`), so the slug
// keeps the dotted module name verbatim — namespace, card label, and route stay
// identical, and the `[namespace]` route needs no bespoke slug mapping.
export function libraryRouteSlug(namespace: string): string {
  return namespace;
}

// The vendored `import * as <alias> from "<module>"` string, mirroring the
// upstream ts-defold/library `@example` convention: the alias is the module
// name past its first dotted segment, remaining dots collapsed to underscores
// (`monarch.transitions.easings` -> `transitions_easings`). Double quotes match
// the module declarations in `@defold-typescript/library-types`.
function libraryImportString(namespace: string): string {
  const segments = namespace.split(".");
  const alias = segments.length > 1 ? segments.slice(1).join("_") : segments[0];
  return `import * as ${alias} from "${namespace}"`;
}

// The GitHub owner handle is the first path segment of an author URL
// (`https://github.com/paweljarosz/squid` -> `paweljarosz`); an empty or
// hostless URL yields `""`. Handles are consistent across the NOTICE credits,
// unlike the free-text author column casing, so the display alias keys off this.
export function githubOwner(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+\//, "");
  return path.split("/")[0] ?? "";
}

// Presentation-only author-first label for a library module:
// `<owner> / <dir>[ · <leaf>]`. The spaced slash signals "label, not a require
// path". The `· <leaf>` tail is kept only for a genuinely multi-module dir whose
// module leaf differs from the dir (`defold-input` -> `· button`); a single-
// module dir, or a module whose last segment equals its dir (`monarch.monarch`),
// drops the leaf. A missing owner falls back to the bare dir part.
export function libraryDisplayName(
  namespace: string,
  dir: string,
  ownerHandle: string,
  moduleCountInDir: number,
): string {
  const leaf = namespace.split(".").at(-1) ?? namespace;
  const dirPart = moduleCountInDir > 1 && leaf !== dir ? `${dir} · ${leaf}` : dir;
  return ownerHandle ? `${ownerHandle} / ${dirPart}` : dirPart;
}

// Parse the `NOTICE` attribution table (`- <dir> — <author>, <url>` lines) into
// a per-upstream-dir map so each library page can credit its original author.
function parseNoticeAttribution(notice: string): Map<string, { author: string; url: string }> {
  const attribution = new Map<string, { author: string; url: string }>();
  const line = /^\s*-\s+(\S+)\s+—\s+(.+?),\s+(https?:\/\/\S+)\s*$/;
  for (const raw of notice.split("\n")) {
    const match = line.exec(raw);
    if (match?.[1] && match[2] && match[3]) {
      attribution.set(match[1], { author: match[2], url: match[3] });
    }
  }
  return attribution;
}

// Module -> upstream `dir` join from `library-classification.json`
// (`dirs[].modules[]`): the reverse index every library-surface consumer needs
// to attribute a dotted module (`monarch.monarch`, `in.button`) to its library.
export function libraryModuleDirs(libraryTypesDir: string): Map<string, string> {
  const classification = JSON.parse(
    readFileSync(join(libraryTypesDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const moduleDir = new Map<string, string>();
  for (const entry of classification.dirs) {
    for (const mod of entry.modules) moduleDir.set(mod, entry.dir);
  }
  const targetsPath = join(libraryTypesDir, "library-targets.json");
  if (existsSync(targetsPath)) {
    const { targets } = JSON.parse(readFileSync(targetsPath, "utf8")) as LibraryTargets;
    for (const target of targets) {
      const dir = target.path.split("/")[1];
      if (dir) moduleDir.set(target.module, dir);
    }
  }
  return moduleDir;
}

export function libraryOwnerByDir(libraryTypesDir: string): Map<string, string> {
  const noticePath = join(libraryTypesDir, "NOTICE");
  if (!existsSync(noticePath)) return new Map();
  const attribution = parseNoticeAttribution(readFileSync(noticePath, "utf8"));
  const ownerByDir = new Map<string, string>();
  for (const [dir, credit] of attribution) {
    const owner = githubOwner(credit.url);
    if (owner) ownerByDir.set(dir, owner);
  }
  return ownerByDir;
}

// A LuaLS-sourced library's own pin, read from `luals-targets.json`. Unlike the
// ts-defold libraries — vendored en masse from one `ts-defold/library` commit —
// each druid-style library lives in its own repo at its own tag, so it carries
// its own `repo`/`ref` and cannot be attributed from the shared classification.
interface LualsProvenance {
  repo: string;
  ref: string;
  license: string;
}

function loadLualsProvenance(libraryTypesDir: string): Map<string, LualsProvenance> {
  const path = join(libraryTypesDir, "luals-targets.json");
  if (!existsSync(path)) return new Map();
  const { targets } = JSON.parse(readFileSync(path, "utf8")) as {
    targets: { namespace: string; repo: string; ref: string; license?: string }[];
  };
  return new Map(
    targets.map((t) => [t.namespace, { repo: t.repo, ref: t.ref, license: t.license ?? "" }]),
  );
}

// Per-library provenance, joined from `library-classification.json` (repo,
// pinned commit, license, and the dir each module belongs to) plus `NOTICE`
// (the upstream author/url). Returns a per-module `LibraryMeta` builder the
// render layer turns into the uniform Author / GitHub / Commit pin / Import /
// License block; the module description is left clean.
//
// A module absent from the ts-defold classification but present in
// `luals-targets.json` is a LuaLS-sourced library (druid): it is attributed to
// its own repo at its own ref, not pinned to the shared ts-defold/library
// commit the classification would otherwise default it to.
export function loadLibraryProvenance(libraryTypesDir: string): (namespace: string) => LibraryMeta {
  const classification = JSON.parse(
    readFileSync(join(libraryTypesDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const noticePath = join(libraryTypesDir, "NOTICE");
  const attribution = existsSync(noticePath)
    ? parseNoticeAttribution(readFileSync(noticePath, "utf8"))
    : new Map<string, { author: string; url: string }>();

  const moduleDir = libraryModuleDirs(libraryTypesDir);
  const modulePath = libraryModulePaths(libraryTypesDir);
  const luals = loadLualsProvenance(libraryTypesDir);

  const { repo, commit, license } = classification.source;
  return (namespace: string): LibraryMeta => {
    const lualsEntry = moduleDir.has(namespace) ? undefined : luals.get(namespace);
    if (lualsEntry) {
      return {
        author: "",
        authorUrl: lualsEntry.repo,
        commit: lualsEntry.ref,
        sourceUrl: `${lualsEntry.repo}/tree/${lualsEntry.ref}`,
        importString: libraryImportString(namespace),
        license: lualsEntry.license,
        authoredHere: true,
      };
    }
    const dir = moduleDir.get(namespace);
    const credit = dir ? attribution.get(dir) : undefined;
    // Link straight to the `.d.ts` the types were generated from at the pin;
    // fall back to the repo tree at the commit if the path is unknown.
    const path = modulePath.get(namespace);
    const sourceUrl = path ? `${repo}/blob/${commit}/${path}` : `${repo}/tree/${commit}`;
    return {
      author: credit?.author ?? "",
      authorUrl: credit?.url ?? "",
      commit,
      sourceUrl,
      importString: libraryImportString(namespace),
      license,
      authoredHere: false,
    };
  };
}

// Module -> upstream `.d.ts` path (`packages/<dir>/<module>.d.ts`) from
// `library-targets.json`: the file each module's types were generated from.
export function libraryModulePaths(libraryTypesDir: string): Map<string, string> {
  const targetsPath = join(libraryTypesDir, "library-targets.json");
  if (!existsSync(targetsPath)) return new Map();
  const { targets } = JSON.parse(readFileSync(targetsPath, "utf8")) as LibraryTargets;
  return new Map(targets.map((target) => [target.module, target.path]));
}

// Docs-only pages for the vendored third-party libraries in
// `@defold-typescript/library-types`: each `api-doc/*.json` fixture parsed by
// `parseDefoldApiDoc`, gated on an already-vendored `generated/*.d.ts` sibling,
// tagged `category: "library"`, routed default-only under `/api/<slug>` (no
// version prefix — library types are pinned to a ts-defold/library commit, not
// a Defold version), and carrying a structured `libraryMeta` the render layer
// turns into the uniform provenance block. Library symbols carry no authored
// translations/signatures, so those stores stay empty.
//
// A library page whose api-doc fixture has an empty `info.description` falls
// back to the per-upstream-dir text in `library-descriptions.json` (keyed by
// library dir, populated from the upstream GitHub `description` field at sync
// time + a curated overrides map). A richer per-module description, where the
// api-doc fixture already supplies one, still wins — the fallback only fills
// the empty cases that the previous step rendered as a floating provenance
// block.
function loadLibraryPages(libraryTypesDir: string): ApiPage[] {
  const apiDocDir = join(libraryTypesDir, "api-doc");
  if (!existsSync(apiDocDir)) return [];
  const metaFor = loadLibraryProvenance(libraryTypesDir);

  const descByDir = loadLibraryDescriptions(libraryTypesDir);
  const moduleDir = libraryModuleDirs(libraryTypesDir);
  const displayOverrides = loadLibraryDisplayOverrides(libraryTypesDir);

  const namespaces = readdirSync(apiDocDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((namespace) => existsSync(join(libraryTypesDir, "generated", `${namespace}.d.ts`)));

  // Modules-per-dir count drives whether the display label keeps its `· <leaf>`
  // distinguisher; a single-module dir drops it.
  const dirCounts = new Map<string, number>();
  for (const namespace of namespaces) {
    const dir = moduleDir.get(namespace) ?? namespace;
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }

  const pages: ApiPage[] = [];
  for (const namespace of namespaces) {
    const module = parseDefoldApiDoc(
      JSON.parse(readFileSync(join(apiDocDir, `${namespace}.json`), "utf8")),
    );
    const dir = moduleDir.get(namespace);
    if (!module.description) {
      // ts-defold libraries key the description on their upstream dir; a LuaLS
      // library has no classification dir, so it keys on its namespace directly
      // (druid documents its own `---@class` and never reaches this fallback).
      const fallback = (dir ? descByDir?.get(dir) : undefined) ?? descByDir?.get(namespace);
      if (fallback) module.description = fallback;
    }
    const meta = metaFor(namespace);
    const displayName =
      displayOverrides.get(namespace) ??
      libraryDisplayName(
        namespace,
        dir ?? namespace,
        githubOwner(meta.authorUrl),
        dirCounts.get(dir ?? namespace) ?? 1,
      );
    pages.push({
      namespace,
      route: `/api/${libraryRouteSlug(namespace)}`,
      brief: module.brief,
      module,
      translations: {},
      signatures: {},
      category: "library",
      libraryMeta: meta,
      displayName,
    });
  }
  return pages;
}

// Curated display-name overrides from `library-display-overrides.json` (dotted
// namespace -> label). The escape hatch for a namespace whose derived
// author-first label reads awkwardly; an absent file degrades to an empty map,
// so every module falls back to `libraryDisplayName`. Mirrors the
// `loadLibraryDescriptions` override-loader pattern.
function loadLibraryDisplayOverrides(libraryTypesDir: string): Map<string, string> {
  const path = join(libraryTypesDir, "library-display-overrides.json");
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return new Map(Object.entries(raw));
}

// Per-upstream-dir description text from `library-descriptions.json`, keyed by
// the library dir (not the dotted module). A missing or unreadable file
// degrades to undefined — every page falls back to its own (possibly empty)
// api-doc description, which matches the pre-step behavior.
function loadLibraryDescriptions(libraryTypesDir: string): Map<string, string> | undefined {
  const path = join(libraryTypesDir, "library-descriptions.json");
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return new Map(Object.entries(raw));
}

// Join the version-correct availability lookup onto every page; the projection
// only surfaces a badge where a symbol's identity is present, so pages of other
// categories (library, lua-stdlib, global-type) carry it harmlessly.
function attachAvailability(typesDir: string, pages: ApiPage[]): void {
  const availability = loadAvailability(typesDir);
  if (availability) {
    for (const page of pages) page.availability = availability;
  }
}

const CATEGORY_RANK: Record<ApiPageCategory, number> = {
  engine: 0,
  "global-type": 1,
  "lua-stdlib": 2,
  library: 3,
};

// Category-then-namespace ordering shared by the engine and version-independent
// surfaces, with the `globals` engine page hoisted to the top of its category.
function sortApiPages(pages: ApiPage[]): ApiPage[] {
  return pages.sort((a, b) => {
    if (a.category !== b.category) return CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
    if (a.namespace === b.namespace) return 0;
    if (a.category === "engine") {
      if (a.namespace === "globals") return -1;
      if (b.namespace === "globals") return 1;
    }
    return a.namespace.localeCompare(b.namespace);
  });
}

// One target's engine surface: its declared modules plus the presence-gated
// globals page, every route carrying the version prefix (`/api/<id>/<namespace>`).
// Every tracked version — the default included — owns an explicit prefixed engine
// family; the canonical unprefixed `/api/<namespace>` surface is the Combined
// projection, not any single version. Version-independent categories (core types,
// Lua stdlib, libraries) are excluded here and sourced once by
// {@link loadVersionIndependentPages}.
function loadEnginePages(typesDir: string, target: ApiTarget, routePrefix: string): ApiPage[] {
  const translations = loadTranslationStore(typesDir);
  const signatures = loadSignatureStore(typesDir);

  const pages = target.modules.map((mod): ApiPage => {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    return {
      namespace: mod.namespace,
      route: `/api${routePrefix}/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    };
  });

  // Hand-vendored, presence-gated: the prefixless global symbols (`hash`, …)
  // have no api-targets module, so they never reach regen/generated output.
  const globalsPath = join(typesDir, target.fixturesDir, "globals_doc.json");
  if (existsSync(globalsPath)) {
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(globalsPath, "utf8")));
    pages.push({
      namespace: "globals",
      route: `/api${routePrefix}/globals`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    });
  }

  attachAvailability(typesDir, pages);
  return sortApiPages(pages);
}

// The version-independent reference surface, sourced ONCE and emitted at the
// canonical `/api/<namespace>` — never under a version prefix. It carries the
// default target's Lua standard library pages (types owned by the `lua-types`
// dependency, not the engine), the hand-curated core value types, and the
// vendored third-party library pages. A non-default target's `luaStdlib` entries
// are deliberately ignored: a version-prefixed lua-stdlib copy would be a fake
// version of a version-independent namespace, exactly the copy the canonical
// route model forbids.
export function loadVersionIndependentPages(typesDir: string, libraryTypesDir?: string): ApiPage[] {
  const translations = loadTranslationStore(typesDir);
  const signatures = loadSignatureStore(typesDir);
  const pages: ApiPage[] = [];

  // Docs-only Lua standard library pages (`base`, `bit`, …): types are owned by
  // the `lua-types` dependency, so these fixtures never feed regen /
  // `MODULE_MANIFEST`; docs-site reads them directly. Each page leads with a
  // provenance note so a reader landing on `/api/base` sees *why* this surface
  // is not generated like the rest.
  const defaultTarget = readTargets(typesDir).find((t) => t.default === true);
  for (const mod of defaultTarget?.luaStdlib ?? []) {
    const raw = JSON.parse(
      readFileSync(join(typesDir, defaultTarget?.fixturesDir ?? "", mod.fixture), "utf8"),
    );
    const module = parseDefoldApiDoc(raw);
    const provenanceNote =
      "Types for this namespace are provided by the `lua-types` dependency " +
      "and are not generated by `@defold-typescript/types`.";
    module.description = provenanceNote + (module.description ? `\n\n${module.description}` : "");
    pages.push({
      namespace: mod.namespace,
      route: `/api/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "lua-stdlib",
    });
  }

  // Hand-curated core value types (`Vector3`, `Hash`, …), parsed from the
  // typings source string rather than a ref-doc fixture so they never feed
  // regen / `MODULE_MANIFEST`; each already routes to its canonical `/api/<name>`.
  const coreTypesPath = join(typesDir, "src", "core-types.ts");
  if (existsSync(coreTypesPath)) {
    for (const page of parseGlobalTypes(readFileSync(coreTypesPath, "utf8"))) {
      pages.push({ ...page, translations, signatures });
    }
  }

  // Vendored third-party library pages, pinned to a ts-defold/library commit
  // rather than a Defold version, so they are canonical-only too.
  if (libraryTypesDir) {
    pages.push(...loadLibraryPages(libraryTypesDir));
  }

  attachAvailability(typesDir, pages);
  return sortApiPages(pages);
}

// One tracked version's engine + globals surface, routed under its own
// `/api/<id>/…` prefix. The default version is no longer special: it too owns an
// explicit prefixed family, and its version-independent content is sourced
// separately by {@link loadVersionIndependentPages}.
export function loadApiSurfaceForVersion(typesDir: string, versionId: string): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.id === versionId);
  if (!target) {
    throw new Error(
      `loadApiSurfaceForVersion: no target with id "${versionId}" in api-targets.json`,
    );
  }
  return loadEnginePages(typesDir, target, `/${target.id}`);
}

// The default version's engine surface plus the canonical version-independent
// pages. Retained for the back-compat callers (library index, global-type
// filter) that predate the canonical/exact-version split; the canonical route
// and nav surface is assembled by `canonicalApiPages` in `api-content.ts`.
export function loadApiSurface(typesDir: string, libraryTypesDir?: string): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }
  return [
    ...loadApiSurfaceForVersion(typesDir, target.id),
    ...loadVersionIndependentPages(typesDir, libraryTypesDir),
  ];
}

function orderedTargets(typesDir: string): ApiTarget[] {
  return [...readTargets(typesDir)].sort(
    (a, b) => Number(b.default === true) - Number(a.default === true),
  );
}

export function listApiVersions(typesDir: string): ApiVersion[] {
  return orderedTargets(typesDir).map((t) => ({ id: t.id, isDefault: t.default === true }));
}

// Enumeration guard for routing / version chrome: the default target is always
// kept (it is the canonical surface), but a non-default target whose declared
// module fixtures are not on disk is dropped rather than allowed to ENOENT at
// build time. A ref-doc-sourced target (resolved on demand, materialization
// deferred to a future Worker) therefore stays invisible until its fixtures are
// committed — direct `loadApiSurfaceForVersion` by id still throws for unknowns.
function targetIsMaterialized(typesDir: string, target: ApiTarget): boolean {
  return target.modules.every((mod) => existsSync(join(typesDir, target.fixturesDir, mod.fixture)));
}

export function versionsWithDiskFixtures(typesDir: string): ApiVersion[] {
  return orderedTargets(typesDir)
    .filter((t) => t.default === true || targetIsMaterialized(typesDir, t))
    .map((t) => ({ id: t.id, isDefault: t.default === true }));
}

// The bare semver a target's availability/signature records are keyed by
// (`defold-1.13.0` -> `1.13.0`); a non-`defold-` id passes through unchanged.
function bareVersion(id: string): string {
  return id.replace(/^defold-/, "");
}

// The authoritative `api-signatures.json` artifact (version -> identity-key ->
// TS signature). Missing file degrades to an empty artifact, so the Combined
// projection renders with no authoritative-signature guarantee rather than
// throwing — matching how `loadAvailability` tolerates an absent overlay.
export function loadSignaturesArtifact(typesDir: string): SignaturesArtifact {
  const path = join(typesDir, "api-signatures.json");
  if (!existsSync(path)) return { versions: {} };
  return JSON.parse(readFileSync(path, "utf8")) as SignaturesArtifact;
}

// The union "Combined" projection over every materialized version's engine
// surface. Documentation-only: it reuses the same committed artifacts the
// per-version routes read (there is no `combined` api-target, export, or
// materialized surface) and is rebuilt on demand.
export function loadCombinedSurface(typesDir: string): CombinedSurface {
  const overlay = loadAvailability(typesDir);
  const signatures = loadSignaturesArtifact(typesDir);
  const surfaces = versionsWithDiskFixtures(typesDir).map((version) => ({
    version: bareVersion(version.id),
    modules: loadApiSurfaceForVersion(typesDir, version.id)
      .filter((page) => page.category === "engine")
      .map((page) => page.module),
  }));
  return buildCombinedSurface({ surfaces, signatures, ...(overlay ? { overlay } : {}) });
}
