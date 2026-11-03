import type { ApiPage } from "./api-surface";
import {
  type CombinedSurface,
  combinedNamespaceToApiPage,
  type SignaturesArtifact,
} from "./combined-surface";
import {
  type ApiVersion,
  loadApiSurface,
  loadCombinedSurface,
  loadSignaturesArtifact,
  loadVersionIndependentPages,
  versionsWithDiskFixtures,
} from "./toolchain-surface-loader";
import { type VersionWindow, windowCombinedSurface } from "./version-window";

// The toolchain docs' API surface, read from a `@defold-typescript/types` package
// dir. The toolchain site renders it at `/api/<ns>`; the library site links into
// it. The committed artifacts are fixed for a build and the dev server reloads the
// module graph on change, so each loaded surface is memoized per types dir.

export function apiPages(typesDir: string): ApiPage[] {
  return loadApiSurface(typesDir);
}

// Enumeration for routing and version chrome: a non-default target with no
// on-disk fixtures is skipped (it would ENOENT at build time), so an
// unmaterialized ref-doc version stays invisible until its fixtures are committed.
export function apiVersions(typesDir: string): ApiVersion[] {
  return versionsWithDiskFixtures(typesDir);
}

// The union "Combined" projection across every materialized version's engine
// surface — the canonical `/api/<ns>` domain model, which also feeds the Combined
// search / LLM serialization. Memoized because the renderer (which needs the union
// namespaces for the selector) runs once per page, and a full multi-version rebuild
// on every page would dominate the SSG build.
const combinedSurfaces = new Map<string, CombinedSurface>();
export function combinedSurface(typesDir: string): CombinedSurface {
  let surface = combinedSurfaces.get(typesDir);
  if (!surface) {
    surface = loadCombinedSurface(typesDir);
    combinedSurfaces.set(typesDir, surface);
  }
  return surface;
}

// The Combined namespaces projected as pages at their canonical `/api/<ns>`
// identity — the projection owns the canonical route at its source, so this is
// the surface the canonical route, the nav, and the search / symbol manifests all
// read directly (no post-projection route rewrite). Combined omits example
// translations (they render as their Lua fallback) but carries the authored
// signature override store, so every hand-authored overload arm renders.
export function combinedApiPages(typesDir: string): ApiPage[] {
  return combinedSurface(typesDir).namespaces.map(combinedNamespaceToApiPage);
}

// The authoritative signatures artifact, memoized on the same terms as
// `combinedSurface` — every windowed projection re-reads it, and the SSG build
// windows once per tracked version.
const signaturesArtifacts = new Map<string, SignaturesArtifact>();
function signaturesArtifact(typesDir: string): SignaturesArtifact {
  let signatures = signaturesArtifacts.get(typesDir);
  if (!signatures) {
    signatures = loadSignaturesArtifact(typesDir);
    signaturesArtifacts.set(typesDir, signatures);
  }
  return signatures;
}

// The tracked version axis the windows are sliced on: bare semver, newest first,
// exactly the axis `buildCombinedSurface` derived. The single source every window
// bound is validated against, so a route, a selector and a param set can never
// disagree about which versions exist.
export function apiVersionAxis(typesDir: string): readonly string[] {
  return combinedSurface(typesDir).versions;
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

// The engine pages for a `[from, to]` window, routed under `to`. This is what
// `/api/<version>/<ns>` renders: the exact per-version surface is no longer a
// separate concept, it is this window with `from` at the oldest tracked version.
// Memoized per types dir and window because the SSG build renders every namespace
// of every version, and re-windowing per page would dominate it.
const windowedPagesCache = new Map<string, ApiPage[]>();
export function windowedApiPages(window: VersionWindow, typesDir: string): ApiPage[] {
  const key = `${typesDir}\0${window.from}..${window.to}`;
  let pages = windowedPagesCache.get(key);
  if (!pages) {
    const id = versionIdForBare(window.to, typesDir);
    pages = windowCombinedSurface(
      combinedSurface(typesDir),
      signaturesArtifact(typesDir),
      window,
    ).namespaces.map((ns) => ({
      ...combinedNamespaceToApiPage(ns),
      // The Combined projection owns the canonical `/api/<ns>` route at its source;
      // a windowed page is addressed under the version it ends at instead.
      route: `/api/${id}/${ns.namespace}`,
    }));
    windowedPagesCache.set(key, pages);
  }
  return pages;
}

// The version-independent reference pages (core value types, Lua standard
// library), each canonical at `/api/<ns>` with no version tie.
export function versionIndependentPages(typesDir: string): ApiPage[] {
  return loadVersionIndependentPages(typesDir);
}

// Which surface owns a canonical namespace: a Combined engine namespace, or a
// version-independent one (global type, Lua stdlib).
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
// by both. This is what the `/api` route, the sidebar nav, the renderer and the
// library site's toolchain links read.
export function canonicalApiPages(typesDir: string): ApiPage[] {
  const engine = combinedApiPages(typesDir);
  const independent = versionIndependentPages(typesDir);
  apiNamespaceOwners(engine, independent);
  return [...engine, ...independent];
}

// The owning surface for one canonical namespace, or `undefined` for an unknown
// namespace. The 2-segment route dispatches on this: a `combined-engine` namespace
// renders its Combined page, a `version-independent` one its canonical page.
export function apiNamespaceOwner(
  namespace: string,
  typesDir: string,
): ApiNamespaceOwner | undefined {
  return apiNamespaceOwners(combinedApiPages(typesDir), versionIndependentPages(typesDir)).get(
    namespace,
  );
}
