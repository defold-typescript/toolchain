/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "../lib/api-surface";
import {
  type LibraryListing,
  type LibraryOrigin,
  libraryPathSegments,
  OFFICIAL_NOTE,
} from "../lib/nav";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "../lib/no-typed-api-icon";
import { stripPlatformMarkers } from "../lib/platform-icons";
import { apiPageCardDescription, groupLibraryIndexByOwner } from "./api-index-sections";
import { LandingCard, LandingCardGrid, LandingPage, LandingSection } from "./landing";

// A library namespace's full lineage as one line: dimmed `creator/dir/` path
// with the namespace itself emphasised (mono, accent), so a card or page header
// carries the whole tree the sidebar shows without a separate level per line.
// The `creator` segment is dropped when it equals the dir (a dir with no owner).
// Neither a dot between letters nor a path slash is a line-break opportunity
// under UAX #14, so a long dotted namespace (`monarch.transitions.easings`)
// would ride off the edge of a heading and widen the page. Emit an explicit
// `<wbr>` after each dot so the path wraps at its own segment boundaries.
function dottedSegments(text: string) {
  const parts = text.split(".");
  return parts.map((part, index) =>
    index === parts.length - 1 ? (
      part
    ) : (
      <>
        {part}.
        <wbr />
      </>
    ),
  );
}

export function LibraryPath({
  owner,
  repo,
  namespace,
}: {
  owner: string;
  repo: string;
  namespace: string;
}) {
  const segments = libraryPathSegments(owner, repo, namespace);
  return (
    <>
      {segments.map((segment, index) => (
        <>
          {index > 0 ? (
            <>
              <span class="font-normal text-text-faint/25">/</span>
              <wbr />
            </>
          ) : null}
          <span
            class={
              index === segments.length - 1
                ? "font-mono font-semibold text-accent"
                : "font-normal text-text-muted"
            }
          >
            {dottedSegments(segment)}
          </span>
        </>
      ))}
    </>
  );
}

// The first sentence of an authored summary's lead (`What it ships`) paragraph, as
// plain text: the card's stand-in for a manifest entry whose upstream description
// is empty. The lead may still hold a `###` subheading, so headings are skipped.
function summaryFirstSentence(ships: string): string {
  const paragraph =
    ships
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block !== "" && !block.startsWith("#")) ?? "";
  const text = paragraph
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/\s+/g, " ");
  return text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
}

function listingCardDescription(listing: LibraryListing): string {
  return [
    listing.description || summaryFirstSentence(listing.ships),
    LIBRARY_API_KIND_SENTENCE[listing.api].replace(/`/g, ""),
  ]
    .filter((part) => part !== "")
    .join(" ");
}

export function LibraryIndex({
  pages,
  origins,
  listings = [],
}: {
  pages: ApiPage[];
  origins: Map<string, LibraryOrigin>;
  listings?: LibraryListing[];
}) {
  const groups = groupLibraryIndexByOwner(pages, origins, listings);
  const listingsByRoute = new Map(listings.map((listing) => [listing.route, listing]));
  const total = groups.reduce(
    (sum, group) => sum + group.libraries.reduce((acc, lib) => acc + lib.pages.length, 0),
    0,
  );
  return (
    <LandingPage
      title="Libraries"
      lead={
        <p>
          Library API blocks, and libraries that have no typed API.
          <br />
          The TypeScript definitions behind each API block are maintained in the library data repo —
          generated from the upstream sources that ship machine-readable types, and hand-forked
          where upstream ships none — and pinned to an upstream commit or tag.
          <br />A card marked with the no-typed-API icon links to a page describing what the library
          ships and how to use it, but it has no typed API.
          <br />
          <span class="mt-1 block text-sm text-text-faint">
            {total} namespace{total === 1 ? "" : "s"} documented.
          </span>
        </p>
      }
    >
      {groups.map((group) => (
        // One section per owner (like the API index's topic sections); the owner
        // heads the block, so each card shows only `repo/namespace`.
        <LandingSection
          heading={group.label}
          {...(group.official ? { headingNote: OFFICIAL_NOTE } : {})}
        >
          <LandingCardGrid>
            {group.libraries.flatMap((lib) => {
              const listing = lib.listing && listingsByRoute.get(lib.listing.route);
              if (listing) {
                return (
                  <LandingCard
                    mono
                    href={listing.route}
                    title={
                      <>
                        <LibraryPath owner="" repo={lib.label} namespace="" />{" "}
                        <span dangerouslySetInnerHTML={{ __html: NO_TYPED_API_ICON }} />
                      </>
                    }
                    description={listingCardDescription(listing)}
                  />
                );
              }
              return lib.pages.map((page) => (
                <LandingCard
                  mono
                  href={page.route}
                  title={<LibraryPath owner="" repo={lib.label} namespace={page.namespace} />}
                  description={
                    stripPlatformMarkers(htmlToDocText(apiPageCardDescription(page))) || null
                  }
                />
              ));
            })}
          </LandingCardGrid>
        </LandingSection>
      ))}
    </LandingPage>
  );
}
