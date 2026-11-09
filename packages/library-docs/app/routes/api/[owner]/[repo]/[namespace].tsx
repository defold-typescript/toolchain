/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for `bun test`; the tsconfig's own setting only reaches tsc.

import {
  apiLinkify,
  apiPageMarkdown,
  apiSignatureSymbolLinks,
} from "@defold-typescript/docs-render/api-page-render";
import { pageHeadings } from "@defold-typescript/docs-render/headings";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../../../components/api-index";
import { apiPages, libraryOrigins, linkPages } from "../../../../lib/api-content";
import type { LibraryDirs } from "../../../../lib/api-surface-loader";
import { libraryLineage } from "../../../../lib/nav";

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

// Each page answers at the `/api/<owner>/<repo>/<namespace>` route the loader
// gave it, and only there: the params are matched against that route, never
// against the page key, so a key or a mixed-case path finds no page.
export function createApiNamespaceRoute(dirs?: LibraryDirs) {
  return createRoute(
    ssgParams(() =>
      apiPages(dirs).map((page) => {
        const [owner = "", repo = "", namespace = ""] = page.route.split("/").slice(2);
        return { owner, repo, namespace };
      }),
    ),
    async (c) => {
      const route = `/api/${c.req.param("owner")}/${c.req.param("repo")}/${c.req.param("namespace")}`;
      const page = apiPages(dirs).find((entry) => entry.route === route);
      if (!page) return c.notFound();

      const links = linkPages(dirs);
      const { owner, repo } = libraryLineage(page.namespace, libraryOrigins(dirs));
      // A name several libraries (or a library and the engine) declare links only
      // on a page that declares it, to that page's own heading.
      const body = await renderMarkdown(
        apiPageMarkdown(page, apiLinkify(links, { current: page, ambiguous: "drop" }), {
          // The heading is the styled path, so the markdown body omits its H1.
          omitHeading: true,
        }),
        {
          highlightSignatureHeadings: true,
          signatureSymbolLinks: apiSignatureSymbolLinks(links, page, links, { ambiguous: "drop" }),
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
