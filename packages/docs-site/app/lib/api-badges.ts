import { apiVersionAxis, windowedApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import {
  type ApiVersion,
  versionsWithDiskFixtures,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import { resolveVersionWindow } from "@defold-typescript/docs-render/version-window";

// SSG params for the per-version namespace pages: one entry per engine page of
// every materialized version — the default included, since it now owns an
// explicit `/api/defold-<default>/…` family alongside the historical versions.
// Filtered through `versionsWithDiskFixtures` so an unmaterialized ref-doc target
// contributes nothing and the build stays clean until its fixtures land.
//
// Enumerated from the same windowed surface the route renders, not from the
// version's own surface: a version's family is the window ending at it, so it
// includes namespaces that existed earlier and were gone by then. Deriving params
// and content from one source is what keeps a page's body and its route in
// agreement. A tracked target carrying no engine namespace is off the window axis
// and contributes nothing — the release manifest then rejects its empty family
// rather than the build silently emitting an unreachable route.
export function versionedApiParams(typesDir: string): { version: string; namespace: string }[] {
  const axis = apiVersionAxis(typesDir);
  return versionsWithDiskFixtures(typesDir).flatMap((v) => {
    const window = resolveVersionWindow(axis, v.id, null);
    if (!window) return [];
    return windowedApiPages(window, typesDir).map((page) => ({
      version: v.id,
      namespace: page.namespace,
    }));
  });
}

// The `/api/:param` route branches on this: a known version id (default included,
// now that every version owns a `/api/defold-<version>` index) renders that
// version's index; anything else is a canonical namespace or the `combined`
// redirect param.
export function isKnownVersionId(param: string, versions: ApiVersion[]): boolean {
  return versions.some((v) => v.id === param);
}
