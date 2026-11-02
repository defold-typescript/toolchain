/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for `bun test`; the tsconfig's own setting only reaches tsc.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../components/api-index";
import { apiPages, libraryOrigins, linkPages } from "../../lib/api-content";
import { apiLinkify, apiPageMarkdown, apiSignatureSymbolLinks } from "../../lib/api-page-render";
import type { LibraryDirs } from "../../lib/api-surface-loader";
import { pageHeadings } from "../../lib/headings";
import { renderMarkdown } from "../../lib/markdown";
import { libraryLineage } from "../../lib/nav";

// The library page heading: the styled `owner/repo/namespace` path. Exported so
// the path wiring is unit-testable without the route's surface loaders.
export function LibraryHeading({
  owner,
  repo,
  namespace,
}: {
  owner: string;
  repo: string;
  namespace: string;
}) {
  return (
    <h1>
      <LibraryPath owner={owner} repo={repo} namespace={namespace} />
    </h1>
  );
}

export function createApiNamespaceRoute(dirs?: LibraryDirs) {
  return createRoute(
    ssgParams(() => apiPages(dirs).map((page) => ({ namespace: page.namespace }))),
    async (c) => {
      const param = c.req.param("namespace");
      if (!param) return c.notFound();
      const page = apiPages(dirs).find((entry) => entry.namespace === param);
      if (!page) return c.notFound();

      const links = linkPages(dirs);
      const { owner, repo } = libraryLineage(page.namespace, libraryOrigins(dirs));
      // The heading is the styled path, so the markdown body omits its H1.
      const body = await renderMarkdown(
        apiPageMarkdown(page, apiLinkify(links), { omitHeading: true }),
        {
          highlightSignatureHeadings: true,
          signatureSymbolLinks: apiSignatureSymbolLinks(links, page),
        },
      );
      return c.render(
        <article class="prose">
          <LibraryHeading owner={owner} repo={repo} namespace={page.namespace} />
          <div dangerouslySetInnerHTML={{ __html: body }} />
        </article>,
        { title: `${page.module.namespace} API`, headings: pageHeadings(body) },
      );
    },
  );
}

export default createApiNamespaceRoute();
