/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../../components/api-index";
import { defoldListings } from "../../../lib/api-content";
import { listingPageMarkdown } from "../../../lib/api-page-render";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";
import { NO_TYPED_API_ICON } from "../../../lib/no-typed-api-icon";
import type { ApiSurfaceDirs } from "../../api/[namespace]";

// The page for a Defold library that ships no `.script_api`: its authored
// summary of what it ships and how a project uses it, in place of an API reference.
export function createLibraryListingRoute(dirs: ApiSurfaceDirs = {}) {
  return createRoute(
    ssgParams(() =>
      defoldListings(dirs.libraryTypesDir).map(({ owner, repo }) => ({ owner, repo })),
    ),
    async (c) => {
      const owner = c.req.param("owner");
      const repo = c.req.param("repo");
      const listing = defoldListings(dirs.libraryTypesDir).find(
        (candidate) => candidate.owner === owner && candidate.repo === repo,
      );
      if (!listing) return c.notFound();

      const body = await renderMarkdown(listingPageMarkdown(listing));
      return c.render(
        <article class="prose">
          <h1>
            <LibraryPath owner={listing.owner} repo={listing.repo} namespace="" />{" "}
            <span dangerouslySetInnerHTML={{ __html: NO_TYPED_API_ICON }} />
          </h1>
          <div dangerouslySetInnerHTML={{ __html: body }} />
        </article>,
        { title: `${listing.owner}/${listing.repo}`, headings: pageHeadings(body) },
      );
    },
  );
}

export default createLibraryListingRoute();
