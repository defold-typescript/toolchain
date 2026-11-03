/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.

import { withBase } from "@defold-typescript/docs-render/base";
import { pageHeadings } from "@defold-typescript/docs-render/headings";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { ApiIndex } from "../../components/api-index";
import { isKnownVersionId } from "../../lib/api-badges";
import { canonicalNamespaces, TYPES_DIR, versionIndexPages } from "../../lib/api-content";
import { COMBINED_ROUTE_SEGMENT, combinedRedirect, redirectHtml } from "../../lib/api-redirect";

// honox flat routing collapses `api/[version]/index.tsx` to `/api/:version`,
// which collides with this `/api/:namespace` route (the shallower one wins). So
// three page kinds are folded into one `/api/:param` route: the `combined` compat
// redirect, a known-version exact index (default included), and — otherwise — a
// canonical namespace page (a Combined engine page, or a version-independent one).
// The 3-segment `/api/:version/:namespace` route lives in its own file.
// What the version-index and canonical-namespace branches need to read a surface
// that is not the docs-site cwd's: the dir their loaders take. Deliberately *not* a page-source callback
// — injecting `pagesForVersion` would let a test supply `versionIndexPages` while
// production supplied anything, which is this guard's own bug one layer down.
export interface ApiSurfaceDirs {
  typesDir?: string;
}

export function createApiNamespaceRoute(dirs: ApiSurfaceDirs = {}) {
  const typesDir = dirs.typesDir ?? TYPES_DIR;
  return createRoute(
    ssgParams(() => [
      ...canonicalNamespaces(typesDir).map((namespace) => ({ namespace })),
      ...apiVersions(typesDir).map((v) => ({ namespace: v.id })),
      // honox collapses `api/combined/index.tsx` to `/api/combined`, which the
      // shallower `/api/:namespace` route shadows — so the Combined redirect param
      // is folded in here alongside the per-version index params.
      { namespace: COMBINED_ROUTE_SEGMENT },
    ]),
    async (c) => {
      const param = c.req.param("namespace");
      if (!param) return c.notFound();
      const base = withBase("/").replace(/\/$/, "");

      // The old Combined index is now a permanent compat redirect to canonical /api.
      if (param === COMBINED_ROUTE_SEGMENT) {
        const { from, to } = combinedRedirect();
        return c.html(redirectHtml(from, to, base));
      }

      // A known version id (the default included now that it owns an explicit
      // `/api/<default>` family) renders that version's index — the window ending
      // at it, so the index lists everything its `/api/<version>/<ns>` family
      // routes; its version-independent entries link back to their canonical routes.
      if (isKnownVersionId(param, apiVersions(typesDir))) {
        return c.render(<ApiIndex pages={versionIndexPages(param, typesDir)} version={param} />, {
          title: `API reference (${param})`,
        });
      }

      // Otherwise a canonical namespace, rendered by its owning surface: a Combined
      // engine page or a version-independent one. An unknown namespace 404s.
      const html = await renderCanonicalApiPage(param, typesDir);
      if (html === undefined) return c.notFound();
      // A canonical page's module carries its route namespace, so the param names it.
      return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
        title: `${param} API`,
        headings: pageHeadings(html),
      });
    },
  );
}

export default createApiNamespaceRoute();
