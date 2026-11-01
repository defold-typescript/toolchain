import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ApiAvailability,
  parseDefoldApiDoc,
  routeTypeDeclarations,
  type SignatureStore,
  type SkipOverloadRule,
  signatureStoreFor,
  signatureTransitionNames,
  symbolIdentityKey,
  type TranslationStore,
  withholdOverloads,
} from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory, AvailabilityLookup } from "./api-surface";
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
  modules: { namespace: string; fixture: string; skipOverloads?: SkipOverloadRule[] }[];
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
    transitions: signatureTransitionNames(records, versions),
  };
}

function readTargets(typesDir: string): ApiTarget[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };
  return targets;
}

// Join the version-correct availability lookup onto every page; the projection
// only surfaces a badge where a symbol's identity is present, so pages of other
// categories (lua-stdlib, global-type) carry it harmlessly.
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
// Lua stdlib) are excluded here and sourced once by
// {@link loadVersionIndependentPages}.
function loadEnginePages(typesDir: string, target: ApiTarget, routePrefix: string): ApiPage[] {
  const translations = loadTranslationStore(typesDir);
  const signatures = signatureStoreFor(loadSignatureStore(typesDir), bareVersion(target.id));

  // Routed as regen routes the whole target, so a page lists what its namespace's
  // declarations export.
  const modules = routeTypeDeclarations(
    target.modules.map((mod) => {
      const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
      return withholdOverloads(parseDefoldApiDoc(raw), mod.skipOverloads ?? []);
    }),
  );
  const pages = modules.map(
    (module): ApiPage => ({
      namespace: module.namespace,
      route: `/api${routePrefix}/${module.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    }),
  );

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
// dependency, not the engine) and the hand-curated core value types. A non-default
// target's `luaStdlib` entries are deliberately ignored: a version-prefixed lua-stdlib copy would be a fake
// version of a version-independent namespace, exactly the copy the canonical
// route model forbids.
export function loadVersionIndependentPages(typesDir: string): ApiPage[] {
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
// pages. Retained for the global-type filter that predates the
// canonical/exact-version split; the canonical route and nav surface is assembled
// by `canonicalApiPages` in `api-content.ts`.
export function loadApiSurface(typesDir: string): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }
  return [
    ...loadApiSurfaceForVersion(typesDir, target.id),
    ...loadVersionIndependentPages(typesDir),
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
  const signatureStore = loadSignatureStore(typesDir);
  const translationStore = loadTranslationStore(typesDir);
  const surfaces = versionsWithDiskFixtures(typesDir).map((version) => ({
    version: bareVersion(version.id),
    modules: loadApiSurfaceForVersion(typesDir, version.id)
      .filter((page) => page.category === "engine")
      .map((page) => page.module),
  }));
  return buildCombinedSurface({
    surfaces,
    signatures,
    signatureStore,
    translationStore,
    ...(overlay ? { overlay } : {}),
  });
}
