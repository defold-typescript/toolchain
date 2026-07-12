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

// Per-library provenance, joined from `library-classification.json` (repo,
// pinned commit, license, and the dir each module belongs to) plus `NOTICE`
// (the upstream author/url). Returns a per-module `LibraryMeta` builder the
// render layer turns into the uniform Author / GitHub / Commit pin / Import /
// License block; the module description is left clean.
function loadLibraryProvenance(libraryTypesDir: string): (namespace: string) => LibraryMeta {
  const classification = JSON.parse(
    readFileSync(join(libraryTypesDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const noticePath = join(libraryTypesDir, "NOTICE");
  const attribution = existsSync(noticePath)
    ? parseNoticeAttribution(readFileSync(noticePath, "utf8"))
    : new Map<string, { author: string; url: string }>();

  const moduleDir = libraryModuleDirs(libraryTypesDir);
  const modulePath = libraryModulePaths(libraryTypesDir);

  const { repo, commit, license } = classification.source;
  return (namespace: string): LibraryMeta => {
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
      const fallback = dir ? descByDir?.get(dir) : undefined;
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

// Assemble one target's pages: engine modules, the presence-gated globals page,
// the target's `luaStdlib` pages, and (default only) the shared core-types
// global-type pages. `routePrefix` is `""` for the default target and
// `/<version>` for a non-default one, so every page's route reads
// `/api${routePrefix}/<namespace>` and all downstream link derivation follows.
function loadTargetPages(
  typesDir: string,
  target: ApiTarget,
  opts: { routePrefix: string; includeCoreTypes: boolean; libraryTypesDir: string | undefined },
): ApiPage[] {
  const translations = loadTranslationStore(typesDir);
  const signatures = loadSignatureStore(typesDir);

  const pages = target.modules.map((mod): ApiPage => {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    return {
      namespace: mod.namespace,
      route: `/api${opts.routePrefix}/${mod.namespace}`,
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
      route: `/api${opts.routePrefix}/globals`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    });
  }

  // Docs-only Lua standard library pages (`base`, `bit`, …): types are owned
  // by the `lua-types` dependency the `lua-stdlib-globals` goal adopted, so
  // these fixtures never feed regen / `MODULE_MANIFEST`; docs-site reads them
  // directly to render the "Lua standard library" reference category. The
  // per-namespace page also leads with a provenance note so a reader landing
  // on `/api/base` sees *why* this surface is not generated like the rest.
  for (const mod of target.luaStdlib ?? []) {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    const provenanceNote =
      "Types for this namespace are provided by the `lua-types` dependency " +
      "and are not generated by `@defold-typescript/types`.";
    module.description = provenanceNote + (module.description ? `\n\n${module.description}` : "");
    pages.push({
      namespace: mod.namespace,
      route: `/api${opts.routePrefix}/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "lua-stdlib",
    });
  }

  // Hand-curated core value types (`Vector3`, `Hash`, …), parsed from the
  // typings source string rather than a ref-doc fixture so they never feed
  // regen / `MODULE_MANIFEST`; presence-gated like the `globals` block. These
  // are version-independent and stay on the default surface only.
  const coreTypesPath = join(typesDir, "src", "core-types.ts");
  if (opts.includeCoreTypes && existsSync(coreTypesPath)) {
    for (const page of parseGlobalTypes(readFileSync(coreTypesPath, "utf8"))) {
      pages.push({ ...page, translations, signatures });
    }
  }

  // Vendored third-party library pages ride on the default, core-types-including
  // surface only, so they never appear under a versioned `/api/<version>` route.
  if (opts.libraryTypesDir) {
    pages.push(...loadLibraryPages(opts.libraryTypesDir));
  }

  // Join the version-correct availability lookup onto every page; the projection
  // only surfaces a badge where a symbol's identity is present, so pages of other
  // categories (library, lua-stdlib, global-type) carry it harmlessly.
  const availability = loadAvailability(typesDir);
  if (availability) {
    for (const page of pages) page.availability = availability;
  }

  const categoryRank: Record<ApiPageCategory, number> = {
    engine: 0,
    "global-type": 1,
    "lua-stdlib": 2,
    library: 3,
  };
  return pages.sort((a, b) => {
    if (a.category !== b.category) return categoryRank[a.category] - categoryRank[b.category];
    if (a.namespace === b.namespace) return 0;
    if (a.category === "engine") {
      if (a.namespace === "globals") return -1;
      if (b.namespace === "globals") return 1;
    }
    return a.namespace.localeCompare(b.namespace);
  });
}

export function loadApiSurfaceForVersion(
  typesDir: string,
  versionId: string,
  libraryTypesDir?: string,
): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.id === versionId);
  if (!target) {
    throw new Error(
      `loadApiSurfaceForVersion: no target with id "${versionId}" in api-targets.json`,
    );
  }
  const isDefault = target.default === true;
  return loadTargetPages(typesDir, target, {
    routePrefix: isDefault ? "" : `/${target.id}`,
    includeCoreTypes: isDefault,
    // Library pages are default-surface only; a versioned target never gets them
    // even when a library dir is supplied.
    libraryTypesDir: isDefault ? libraryTypesDir : undefined,
  });
}

export function loadApiSurface(typesDir: string, libraryTypesDir?: string): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }
  return loadApiSurfaceForVersion(typesDir, target.id, libraryTypesDir);
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
