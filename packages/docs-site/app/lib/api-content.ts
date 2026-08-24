import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import {
  type ApiVersion,
  libraryOriginByNamespace,
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  loadSignaturesArtifact,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "./api-surface-loader";
import {
  type CombinedNamespace,
  type CombinedSurface,
  combinedNamespaceToApiPage,
  type SignaturesArtifact,
} from "./combined-surface";
import type { LibraryOrigin } from "./nav";
import { resolveVersionWindow, type VersionWindow, windowCombinedSurface } from "./version-window";

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

// The union "Combined" projection across every materialized version's engine
// surface — the canonical `/api/<ns>` domain model, which also feeds the Combined
// search / LLM serialization. Memoized because the renderer
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

// The authoritative signatures artifact, memoized on the same terms as
// `combinedSurface` — every windowed projection re-reads it, and the SSG build
// windows once per tracked version.
let signaturesCache: SignaturesArtifact | undefined;
function signaturesArtifact(): SignaturesArtifact {
  if (!signaturesCache) signaturesCache = loadSignaturesArtifact(TYPES_DIR);
  return signaturesCache;
}

// The tracked version axis the windows are sliced on: bare semver, newest first,
// exactly the axis `buildCombinedSurface` derived. The single source every window
// bound is validated against, so a route, a selector and a param set can never
// disagree about which versions exist.
export function apiVersionAxis(typesDir?: string): readonly string[] {
  return (typesDir ? loadCombinedSurface(typesDir) : combinedSurface()).versions;
}

// The route segment a bare axis version is addressed by (`1.13.1` ->
// `defold-1.13.1`). Read back from the registry rather than re-prefixed, so a
// target whose id is not `defold-`-shaped still routes at its own id.
function versionIdForBare(bare: string, typesDir: string): string {
  const match = versionsWithDiskFixtures(typesDir).find(
    (version) => version.id.replace(/^defold-/, "") === bare,
  );
  return match?.id ?? bare;
}

function buildWindowedPages(
  combined: CombinedSurface,
  signatures: SignaturesArtifact,
  window: VersionWindow,
  typesDir: string,
): ApiPage[] {
  const id = versionIdForBare(window.to, typesDir);
  return windowCombinedSurface(combined, signatures, window).namespaces.map((ns) => ({
    ...toCombinedApiPage(ns),
    // The Combined projection owns the canonical `/api/<ns>` route at its source;
    // a windowed page is addressed under the version it ends at instead.
    route: `/api/${id}/${ns.namespace}`,
  }));
}

// The engine pages for a `[from, to]` window, routed under `to`. This is what
// `/api/<version>/<ns>` renders: the exact per-version surface is no longer a
// separate concept, it is this window with `from` at the oldest tracked version.
// Memoized per window because the SSG build renders every namespace of every
// version, and re-windowing per page would dominate it. An explicit `typesDir`
// bypasses the module cache for deterministic tests, matching `combinedApiPages`.
const windowedPagesCache = new Map<string, ApiPage[]>();
export function windowedApiPages(window: VersionWindow, typesDir?: string): ApiPage[] {
  if (typesDir) {
    return buildWindowedPages(
      loadCombinedSurface(typesDir),
      loadSignaturesArtifact(typesDir),
      window,
      typesDir,
    );
  }
  const key = `${window.from}..${window.to}`;
  let pages = windowedPagesCache.get(key);
  if (!pages) {
    pages = buildWindowedPages(combinedSurface(), signaturesArtifact(), window, TYPES_DIR);
    windowedPagesCache.set(key, pages);
  }
  return pages;
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

// Merge the version-independent pages into a version's engine pages, keeping the
// engine page when both claim a namespace so the index never renders a card
// twice. Order is preserved: the version's own pages first, the shared ones after.
export function withVersionIndependentPages(
  versionPages: ApiPage[],
  independentPages: ApiPage[],
): ApiPage[] {
  const present = new Set(versionPages.map((p) => p.namespace));
  return [...versionPages, ...independentPages.filter((p) => !present.has(p.namespace))];
}

// The `/api/<version>` index surface: the engine namespaces of the window
// `{oldest, to: version}` — exactly the family `/api/<version>/<ns>` routes —
// unioned with the version-independent pages the canonical `/api` index carries,
// under the identical library filter. Sourcing the index from the window rather
// than from the version's own surface is what makes a namespace removed before
// this version reachable from it; unioning the same set `/api` does is what makes
// the default version's `rel="canonical"` to `/api` true by construction. An
// unresolvable version yields no window and no pages — the route's
// `isKnownVersionId` guard already rejects an unknown param.
export function versionIndexPages(
  versionId: string,
  typesDir?: string,
  libraryTypesDir: string = LIBRARY_TYPES_DIR,
): ApiPage[] {
  const window = resolveVersionWindow(apiVersionAxis(typesDir), versionId, null);
  if (!window) return [];
  return withVersionIndependentPages(
    windowedApiPages(window, typesDir),
    versionIndependentPages(typesDir ?? TYPES_DIR, libraryTypesDir).filter(
      (page) => page.category !== "library",
    ),
  );
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

// Namespace -> GitHub `<owner>/<repo>` origin, the lineage the Libraries tree,
// the index cards, and each library page heading all group and title themselves by.
export function libraryOrigins(): Map<string, LibraryOrigin> {
  return libraryOriginByNamespace(LIBRARY_TYPES_DIR);
}
