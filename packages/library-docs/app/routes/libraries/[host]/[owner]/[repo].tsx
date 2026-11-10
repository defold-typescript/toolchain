/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for `bun test`; the tsconfig's own setting only reaches tsc.

import { pageHeadings } from "@defold-typescript/docs-render/headings";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../../../components/api-index";
import { untypedListings } from "../../../../lib/api-content";
import type { LibraryDirs } from "../../../../lib/api-surface-loader";
import { listingPageMarkdown } from "../../../../lib/listing-page";
import { NO_TYPED_API_ICON } from "../../../../lib/no-typed-api-icon";

// The page for a library that ships no `.script_api`: what it ships and how a
// project uses it, in place of an API reference. It answers only at the lowercase
// `/libraries/<host>/<owner>/<repo>` route the loader gave it.
export function createLibraryListingRoute(dirs?: LibraryDirs) {
  return createRoute(
    ssgParams(() =>
      untypedListings(dirs).map(({ route }) => {
        const [host = "", owner = "", repo = ""] = route.split("/").slice(2);
        return { host, owner, repo };
      }),
    ),
    async (c) => {
      const route = `/libraries/${c.req.param("host")}/${c.req.param("owner")}/${c.req.param("repo")}`;
      const listing = untypedListings(dirs).find((candidate) => candidate.route === route);
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
