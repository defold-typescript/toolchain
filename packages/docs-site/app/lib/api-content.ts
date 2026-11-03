import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import {
  apiVersionAxis,
  canonicalApiPages,
  combinedSurface,
  versionIndependentPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import { loadApiSurfaceForVersion } from "@defold-typescript/docs-render/toolchain-surface-loader";
import { resolveVersionWindow } from "@defold-typescript/docs-render/version-window";

export const TYPES_DIR = join(process.cwd(), "../types");

export function apiPagesForVersion(versionId: string): ApiPage[] {
  return loadApiSurfaceForVersion(TYPES_DIR, versionId);
}

// What one version contributes to a window: the namespaces the single-version
// window `{V, V}` selects. The selector, the surface-preference redirect and the
// sidebar rewrite each hold a map of these and union it across their own
// `[from, to]`, so the union over any window is exactly that window's namespace
// set. Sourcing it from the version's on-disk surface instead would drop a
// namespace whose only presence in the window is one a deprecation claim widened
// in — real to the routes, invisible to the disk. An unresolvable version
// contributes nothing; the `/api/:namespace` route already rejects unknown ids.
export function versionNamespaceAtom(versionId: string, typesDir: string = TYPES_DIR): string[] {
  const window = resolveVersionWindow(apiVersionAxis(typesDir), versionId, versionId);
  if (!window) return [];
  return windowedApiPages(window, typesDir).map((page) => page.namespace);
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
// unioned with the version-independent pages the canonical `/api` index carries.
// Sourcing the index from the window rather than from the version's own surface is what makes a namespace removed before
// this version reachable from it; unioning the same set `/api` does is what makes
// the default version's `rel="canonical"` to `/api` true by construction. An
// unresolvable version yields no window and no pages — the route's
// `isKnownVersionId` guard already rejects an unknown param.
export function versionIndexPages(versionId: string, typesDir: string = TYPES_DIR): ApiPage[] {
  const window = resolveVersionWindow(apiVersionAxis(typesDir), versionId, null);
  if (!window) return [];
  return withVersionIndependentPages(
    windowedApiPages(window, typesDir),
    versionIndependentPages(typesDir),
  );
}

// The canonical namespaces, in canonical-page order, for the 2-segment
// `/api/<namespace>` route's static params.
export function canonicalNamespaces(typesDir: string = TYPES_DIR): string[] {
  return canonicalApiPages(typesDir).map((page) => page.namespace);
}

// Union namespaces of the Combined surface, for the version-selector's Combined
// entry (namespace-preserving switch) and the sidebar.
export function combinedNamespaces(): string[] {
  return combinedSurface(TYPES_DIR).namespaces.map((ns) => ns.namespace);
}

// SSG params for `/api/combined/<namespace>`: one entry per union namespace.
export function combinedParams(): { namespace: string }[] {
  return combinedNamespaces().map((namespace) => ({ namespace }));
}
