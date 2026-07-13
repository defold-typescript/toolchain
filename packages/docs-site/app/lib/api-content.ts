import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import {
  type ApiVersion,
  libraryModuleDirs,
  libraryOwnerByDir,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import {
  type CombinedNamespace,
  type CombinedSurface,
  combinedNamespaceToApiPage,
} from "./combined-surface";

export const TYPES_DIR = join(process.cwd(), "../types");
export const LIBRARY_TYPES_DIR = join(process.cwd(), "../library-types");

export function apiPages(): ApiPage[] {
  return loadApiSurface(TYPES_DIR, LIBRARY_TYPES_DIR);
}

// Enumeration for routing and version chrome: a non-default target with no
// on-disk fixtures is skipped (it would ENOENT at build time), so an
// unmaterialized ref-doc version stays invisible until its fixtures are committed.
export function apiVersions(): ApiVersion[] {
  return versionsWithDiskFixtures(TYPES_DIR);
}

export function apiPagesForVersion(versionId: string): ApiPage[] {
  return loadApiSurfaceForVersion(TYPES_DIR, versionId);
}

export function defaultGlobalTypePages(): ApiPage[] {
  return apiPages().filter((p) => p.category === "global-type");
}

// The union "Combined" projection across every materialized version's engine
// surface — the reusable domain model shared by the `/api/combined` routes and
// (later) the Combined search / LLM serialization. Memoized because the renderer
// (which needs the union namespaces for the selector) runs once per page, and a
// full multi-version rebuild on every page would dominate the SSG build. The
// committed artifacts are fixed for a build; the dev server reloads the module
// graph on change, so the memo cannot serve stale data across a real edit.
let combinedSurfaceCache: CombinedSurface | undefined;
export function combinedSurface(): CombinedSurface {
  if (!combinedSurfaceCache) combinedSurfaceCache = loadCombinedSurface(TYPES_DIR);
  return combinedSurfaceCache;
}

// A Combined namespace projected as an `ApiPage` for the existing render/index
// components: an `engine` page routed at the canonical `/api/<ns>`, carrying the
// union module and the synthetic availability lookup. Combined omits example
// translations (they render as their Lua fallback) and signature overrides.
export function toCombinedApiPage(ns: CombinedNamespace): ApiPage {
  return combinedNamespaceToApiPage(ns);
}

// The Combined namespaces projected as pages at their canonical `/api/<ns>`
// identity — the projection owns the canonical route at its source, so this is
// the surface the canonical route, the nav, and the search / symbol manifests all
// read directly (no post-projection route rewrite). An explicit `typesDir`
// bypasses the module cache for deterministic tests.
export function combinedApiPages(typesDir?: string): ApiPage[] {
  const surface = typesDir ? loadCombinedSurface(typesDir) : combinedSurface();
  return surface.namespaces.map(toCombinedApiPage);
}

// The version-independent reference pages (core value types, Lua standard
// library, vendored libraries), each canonical at `/api/<ns>` with no version
// tie. Defaults to the real types/library dirs; an explicit dir pair drives
// deterministic tests.
export function versionIndependentPages(
  typesDir: string = TYPES_DIR,
  libraryTypesDir: string = LIBRARY_TYPES_DIR,
): ApiPage[] {
  return loadVersionIndependentPages(typesDir, libraryTypesDir);
}

// Which surface owns a canonical namespace: a Combined engine namespace, or a
// version-independent one (global type, Lua stdlib, library).
export type ApiNamespaceOwner = "combined-engine" | "version-independent";

// Assign each canonical namespace to exactly one owning surface, throwing on a
// collision so an engine namespace can never silently shadow a version-independent
// one (or the reverse). Both `canonicalApiPages` and `apiNamespaceOwner` derive
// their ownership from this single map.
export function apiNamespaceOwners(
  combinedPages: ApiPage[],
  versionIndependent: ApiPage[],
): Map<string, ApiNamespaceOwner> {
  const owners = new Map<string, ApiNamespaceOwner>();
  for (const page of combinedPages) owners.set(page.namespace, "combined-engine");
  for (const page of versionIndependent) {
    if (owners.has(page.namespace)) {
      throw new Error(
        `api namespace collision: "${page.namespace}" is claimed by both the combined-engine and version-independent surfaces`,
      );
    }
    owners.set(page.namespace, "version-independent");
  }
  return owners;
}

// The canonical unprefixed API surface: the Combined engine pages (at `/api/<ns>`)
// unioned with the version-independent pages, guarded so no namespace is claimed
// by both. This is what the `/api` route, the sidebar nav, and the renderer read.
export function canonicalApiPages(
  typesDir?: string,
  libraryTypesDir: string = LIBRARY_TYPES_DIR,
): ApiPage[] {
  const engine = combinedApiPages(typesDir);
  const independent = versionIndependentPages(typesDir ?? TYPES_DIR, libraryTypesDir);
  apiNamespaceOwners(engine, independent);
  return [...engine, ...independent];
}

// The canonical namespaces, in canonical-page order, for the 2-segment
// `/api/<namespace>` route's static params.
export function canonicalNamespaces(
  typesDir?: string,
  libraryTypesDir: string = LIBRARY_TYPES_DIR,
): string[] {
  return canonicalApiPages(typesDir, libraryTypesDir).map((page) => page.namespace);
}

// The owning surface for one canonical namespace, or `undefined` for an unknown
// namespace. The 2-segment route dispatches on this: a `combined-engine` namespace
// renders its Combined page, a `version-independent` one its canonical page.
export function apiNamespaceOwner(
  namespace: string,
  typesDir?: string,
  libraryTypesDir: string = LIBRARY_TYPES_DIR,
): ApiNamespaceOwner | undefined {
  const engine = combinedApiPages(typesDir);
  const independent = versionIndependentPages(typesDir ?? TYPES_DIR, libraryTypesDir);
  return apiNamespaceOwners(engine, independent).get(namespace);
}

// Union namespaces of the Combined surface, for the version-selector's Combined
// entry (namespace-preserving switch) and the sidebar.
export function combinedNamespaces(): string[] {
  return combinedSurface().namespaces.map((ns) => ns.namespace);
}

// SSG params for `/api/combined/<namespace>`: one entry per union namespace.
export function combinedParams(): { namespace: string }[] {
  return combinedNamespaces().map((namespace) => ({ namespace }));
}

// Module -> upstream-library `dir` map for the vendored library surface, used to
// group Libraries nav and index pages by library.
export function libraryDirs(): Map<string, string> {
  return libraryModuleDirs(LIBRARY_TYPES_DIR);
}

export function libraryOwners(): Map<string, string> {
  return libraryOwnerByDir(LIBRARY_TYPES_DIR);
}
