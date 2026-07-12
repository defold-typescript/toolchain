import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import {
  type ApiVersion,
  libraryModuleDirs,
  libraryOwnerByDir,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import type { CombinedNamespace, CombinedSurface } from "./combined-surface";

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
// components: an `engine` page routed under `/api/combined`, carrying the union
// module and the synthetic availability lookup. Combined omits example
// translations (they render as their Lua fallback) and signature overrides.
export function toCombinedApiPage(ns: CombinedNamespace): ApiPage {
  return {
    namespace: ns.namespace,
    route: `/api/combined/${ns.namespace}`,
    brief: ns.module.brief,
    module: ns.module,
    translations: {},
    signatures: {},
    category: "engine",
    availability: ns.availability,
  };
}

export function combinedApiPages(): ApiPage[] {
  return combinedSurface().namespaces.map(toCombinedApiPage);
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
