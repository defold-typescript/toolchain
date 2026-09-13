/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { LibraryPath } from "../../../components/api-index";
import { defoldListings } from "../../../lib/api-content";
import { pageHeadings } from "../../../lib/headings";
import { renderMarkdown } from "../../../lib/markdown";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "../../../lib/no-typed-api-icon";
import type { ApiSurfaceDirs } from "../../api/[namespace]";

// A 40-hex commit pin reads as its short sha; a tag or release pin reads verbatim.
function pinLabel(ref: string): string {
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}

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

      const kind = await renderMarkdown(LIBRARY_API_KIND_SENTENCE[listing.api]);
      const summary = await renderMarkdown(listing.summary);
      return c.render(
        <article class="prose">
          <h1>
            <LibraryPath owner={listing.owner} repo={listing.repo} namespace="" />{" "}
            <span dangerouslySetInnerHTML={{ __html: NO_TYPED_API_ICON }} />
          </h1>
          <div dangerouslySetInnerHTML={{ __html: kind }} />
          <div dangerouslySetInnerHTML={{ __html: summary }} />
          <p>
            GitHub:{" "}
            <a href={`${listing.url}/tree/${listing.ref}`}>
              {listing.owner}/{listing.repo}
            </a>{" "}
            — pinned to <code>{pinLabel(listing.ref)}</code>
          </p>
        </article>,
        { title: `${listing.owner}/${listing.repo}`, headings: pageHeadings(summary) },
      );
    },
  );
}

export default createLibraryListingRoute();
