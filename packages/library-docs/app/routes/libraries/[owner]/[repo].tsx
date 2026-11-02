/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for `bun test`; the tsconfig's own setting only reaches tsc.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../../components/api-index";
import { untypedListings } from "../../../lib/api-content";
import { listingPageMarkdown } from "../../../lib/api-page-render";
import type { LibraryDirs } from "../../../lib/api-surface-loader";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";
import { NO_TYPED_API_ICON } from "../../../lib/no-typed-api-icon";

// The page for a library that ships no `.script_api`: what it ships and how a
// project uses it, in place of an API reference.
export function createLibraryListingRoute(dirs?: LibraryDirs) {
  return createRoute(
    ssgParams(() => untypedListings(dirs).map(({ owner, repo }) => ({ owner, repo }))),
    async (c) => {
      const owner = c.req.param("owner");
      const repo = c.req.param("repo");
      const listing = untypedListings(dirs).find(
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
