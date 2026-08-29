/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import {
  apiVersionAxis,
  canonicalApiPages,
  TYPES_DIR,
  windowedApiPages,
} from "../../../lib/api-content";
import {
  apiLinkify,
  apiPageMarkdown,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
  versionedApiParams,
} from "../../../lib/api-page-render";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";
import { resolveVersionWindow } from "../../../lib/version-window";
import type { ApiSurfaceDirs } from "../[namespace]";

// The 3-segment `/api/:version/:namespace` route. The page is the version window
// ending at `:version` rather than that version's own surface, so the reader who
// picked a concrete version is no longer the one reader who cannot see when a
// symbol appeared or went away. The badge-free exact surface is not a separate
// concept any more: it is this window with `from` at the oldest tracked version.
// `versionedApiParams` enumerates the same windowed families, so a page's body
// and its route always agree.
// The dirs seam mirrors the 2-segment route's: every loader this handler reaches
// is otherwise bound to the docs-site cwd, which root `bun test` does not run
// from, so a test could not drive the handler at all without it.
export function createVersionedApiNamespaceRoute(dirs: ApiSurfaceDirs = {}) {
  const typesDir = dirs.typesDir ?? TYPES_DIR;
  return createRoute(
    ssgParams(() => versionedApiParams(typesDir)),
    async (c) => {
      const version = c.req.param("version");
      const namespace = c.req.param("namespace");
      if (!version || !namespace) return c.notFound();
      // `?since=` is parsed and clamped here, but only a prerendered `from` bound
      // reaches this handler: the SSG enumerates one page per `(version, namespace)`
      // at the full range, and a reader's narrower `from` is applied client-side by
      // `applySinceFilter` over that superset. An untracked version is unresolvable
      // and 404s rather than rendering an empty window.
      const window = resolveVersionWindow(
        apiVersionAxis(typesDir),
        version,
        c.req.query("since") ?? null,
      );
      if (!window) return c.notFound();
      const pages = windowedApiPages(window, typesDir);
      const page = pages.find((entry) => entry.namespace === namespace);
      if (!page) return c.notFound();

      const linkify = apiLinkify(pages);
      const resolveReplacement = apiReplacementResolver(pages);
      // Global-type brands (`Opaque`) are version-independent — they live only on
      // the canonical `/api/Opaque` page, not per version — so resolve the
      // signature deep-links against the canonical surface, not this version's. A
      // typedef shape is the opposite: it belongs to the page rendering it, so the
      // windowed page contributes its own shapes at its own versioned route.
      const signatureSymbolLinks = apiSignatureSymbolLinks(
        canonicalApiPages(dirs.typesDir, dirs.libraryTypesDir),
        page,
      );
      // A windowed page *is* a union across versions, so the availability marker
      // layer is meaningful here exactly as it is on the canonical route — and the
      // client `?since=` filter reads the per-symbol span markers it emits. The
      // resolved window also scopes the category layer, so the dots answer for the
      // range the route names rather than for the whole tracked axis.
      const html = await renderMarkdown(
        apiPageMarkdown(page, linkify, { resolveReplacement, combinedMarkers: true, window }),
        {
          highlightSignatureHeadings: true,
          signatureSymbolLinks,
        },
      );
      return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
        title: `${namespace} API (${version})`,
        headings: pageHeadings(html),
      });
    },
  );
}

export default createVersionedApiNamespaceRoute();
