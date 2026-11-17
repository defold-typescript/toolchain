import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
} from "@defold-typescript/docs-render/api-page-render";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import {
  apiVersionAxis,
  apiVersions,
  canonicalApiPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import { resolveVersionWindow } from "@defold-typescript/docs-render/version-window";
import { isKnownVersionId, versionedApiParams } from "./api-badges";
import {
  canonicalNamespaces,
  combinedNamespaces,
  TYPES_DIR,
  versionIndexPages,
} from "./api-content";
import { COMBINED_ROUTE_SEGMENT, combinedRedirect } from "./api-redirect";

// The decisions behind the three `/api…` page routes, kept here so they can be
// tested: Waku route modules load only under the React server runtime.

export type ApiParamKind =
  | { kind: "combined-redirect"; to: string }
  | { kind: "version-index"; version: string }
  | { kind: "namespace"; namespace: string };

// `/api/<param>` serves three page kinds from one route because they share the
// segment: the old Combined index (now a redirect to `/api`), a version's index,
// and a canonical namespace page. `to` is unprefixed; the route adds the base.
export function apiParamKind(param: string, typesDir: string = TYPES_DIR): ApiParamKind {
  if (param === COMBINED_ROUTE_SEGMENT) {
    return { kind: "combined-redirect", to: combinedRedirect().to };
  }
  if (isKnownVersionId(param, apiVersions(typesDir))) {
    return { kind: "version-index", version: param };
  }
  return { kind: "namespace", namespace: param };
}

export interface ApiStaticPaths {
  /** `/api/<param>`: canonical namespaces, version ids and the `combined` redirect. */
  single: string[];
  /** `/api/<version>/<namespace>`: each version's windowed family. */
  versioned: [string, string][];
  /** `/api/combined/<namespace>`: one redirect stub per Combined namespace. */
  combined: string[];
}

export function apiStaticPaths(typesDir: string = TYPES_DIR): ApiStaticPaths {
  return {
    single: [
      ...canonicalNamespaces(typesDir),
      ...apiVersions(typesDir).map((version) => version.id),
      COMBINED_ROUTE_SEGMENT,
    ],
    versioned: versionedApiParams(typesDir).map(({ version, namespace }) => [version, namespace]),
    combined: combinedNamespaces(typesDir),
  };
}

// Every `/api…` path the site builds, from the static paths the route files hand
// Waku:
//
//   /api                                `src/pages/api/index.tsx`
//   /api/<namespace>                    `src/pages/api/[namespace].tsx`
//   /api/<version>                      same route, version-index kind
//   /api/<version>/<namespace>          `src/pages/api/[version]/[namespace].tsx`
//   /api/combined[/<namespace>]         the redirect stubs
//
// A new *kind* of API route has to be added here too; until it is, links to it
// read as unknown, which fails loudly instead of passing silently.
export function apiRouteSet(typesDir: string = TYPES_DIR): Set<string> {
  const { single, versioned, combined } = apiStaticPaths(typesDir);
  return new Set([
    "/api",
    ...single.map((param) => `/api/${param}`),
    ...versioned.map(([version, namespace]) => `/api/${version}/${namespace}`),
    ...combined.map((namespace) => combinedRedirect(namespace).from),
  ]);
}

// One namespace as it stands at an exact engine version: the window from the
// oldest tracked version up to `version`. `undefined` for a version off the axis
// or a namespace that window does not hold.
export async function renderVersionedApiHtml(
  version: string,
  namespace: string,
  typesDir: string = TYPES_DIR,
): Promise<string | undefined> {
  const window = resolveVersionWindow(apiVersionAxis(typesDir), version, null);
  if (!window) return undefined;
  const pages = windowedApiPages(window, typesDir);
  const page = pages.find((entry) => entry.namespace === namespace);
  if (!page) return undefined;
  return renderMarkdown(
    apiPageMarkdown(page, apiLinkify(pages), {
      resolveReplacement: apiReplacementResolver(pages),
      combinedMarkers: true,
      window,
    }),
    {
      highlightSignatureHeadings: true,
      signatureSymbolLinks: apiSignatureSymbolLinks(canonicalApiPages(typesDir), page, pages),
    },
  );
}

export interface VersionIndexEntry {
  namespace: string;
  brief: string;
  href: string;
}

// The cards of the `/api/<version>` index: the version's windowed family at its
// versioned routes, and the version-independent pages at their canonical ones.
export function versionIndexEntries(
  version: string,
  typesDir: string = TYPES_DIR,
): VersionIndexEntry[] {
  return versionIndexPages(version, typesDir).map((page) => ({
    namespace: page.namespace,
    brief: page.brief,
    href: page.route,
  }));
}
