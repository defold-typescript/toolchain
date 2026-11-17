import {
  apiLinkify,
  apiPageMarkdown,
  apiSignatureSymbolLinks,
} from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { stripPlatformMarkers } from "@defold-typescript/docs-render/platform-icons";
import { htmlToDocText } from "@defold-typescript/types";
import { apiPages, libraryOrigins, linkPages, untypedListings } from "./api-content";
import type { LibraryDirs } from "./api-surface-loader";
import { guides, renderGuideMarkdown } from "./guides";
import { listingPageMarkdown } from "./listing-page";
import {
  type LibraryListing,
  libraryLineage,
  libraryOwnerGroups,
  libraryPathSegments,
  OFFICIAL_NOTE,
} from "./nav";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "./no-typed-api-icon";

// The decisions behind the site's page routes, kept here so they can be tested:
// Waku route modules load only under the React server runtime. Each page answers
// at the lowercase route the loader gave it and only there, so a page key or a
// mixed-case path renders nothing.

export interface LibraryApiParams {
  host: string;
  owner: string;
  repo: string;
  namespace: string;
}

export interface LibraryListingParams {
  host: string;
  owner: string;
  repo: string;
}

/** A page's `<title>` stem and its body, which carries its own `h1`. */
export interface LibraryPageHtml {
  title: string;
  html: string;
}

export interface LibraryStaticPaths {
  /** `/api/<host>/<owner>/<repo>/<namespace>`: one per typed library page. */
  api: [string, string, string, string][];
  /** `/libraries/<host>/<owner>/<repo>`: one per library with no typed API. */
  listings: [string, string, string][];
  /** `/guides/<slug>`. */
  guides: string[];
}

export interface LibraryIndexCard {
  href: string;
  titleHtml: string;
  description?: string;
}

/** One owner's block on the Libraries index; the owner heads it. */
export interface LibraryIndexSection {
  label: string;
  note?: string;
  cards: LibraryIndexCard[];
}

export interface LibraryIndex {
  /** The typed library namespaces the index documents. */
  namespaceCount: number;
  sections: LibraryIndexSection[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Neither a dot between letters nor a path slash is a line-break opportunity
// under UAX #14, so a long dotted namespace (`monarch.transitions.easings`)
// would ride off the edge of a heading and widen the page. A `<wbr>` after each
// dot and slash lets the path wrap at its own segment boundaries.
function dottedHtml(segment: string): string {
  return segment.split(".").map(escapeHtml).join(".<wbr>");
}

/**
 * A library's `owner/repo/namespace` lineage as one line: dimmed path segments
 * with the last one, the namespace or else the repo, in the code face and the
 * accent. The page heading and the index cards share it.
 */
export function libraryPathHtml(owner: string, repo: string, namespace: string): string {
  const segments = libraryPathSegments(owner, repo, namespace);
  return segments
    .map((segment, index) => {
      const separator =
        index > 0 ? '<span class="font-normal text-text-faint/25">/</span><wbr>' : "";
      const style =
        index === segments.length - 1
          ? "font-mono font-semibold text-accent"
          : "font-normal text-text-muted";
      return `${separator}<span class="${style}">${dottedHtml(segment)}</span>`;
    })
    .join("");
}

// The segments after the first of a `/<kind>/...` route.
const routeSegments = (route: string): string[] => route.split("/").slice(2);

export function libraryStaticPaths(dirs?: LibraryDirs, guideDir?: string): LibraryStaticPaths {
  return {
    api: apiPages(dirs).map((page) => {
      const [host = "", owner = "", repo = "", namespace = ""] = routeSegments(page.route);
      return [host, owner, repo, namespace];
    }),
    listings: untypedListings(dirs).map((listing) => {
      const [host = "", owner = "", repo = ""] = routeSegments(listing.route);
      return [host, owner, repo];
    }),
    guides: guides(guideDir).map((guide) => guide.slug),
  };
}

export async function renderLibraryApiHtml(
  { host, owner, repo, namespace }: LibraryApiParams,
  dirs?: LibraryDirs,
): Promise<LibraryPageHtml | undefined> {
  const route = `/api/${host}/${owner}/${repo}/${namespace}`;
  const page = apiPages(dirs).find((entry) => entry.route === route);
  if (!page) return undefined;

  const links = linkPages(dirs);
  const lineage = libraryLineage(page.namespace, libraryOrigins(dirs));
  // A name several libraries (or a library and the engine) declare links only on
  // a page that declares it, to that page's own heading.
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
  return {
    title: `${page.module.namespace} API`,
    html: `<h1>${libraryPathHtml(lineage.owner, lineage.repo, page.namespace)}</h1>${body}`,
  };
}

// The page for a library that ships no `.script_api`: what it ships and how a
// project uses it, in place of an API reference.
export async function renderLibraryListingHtml(
  { host, owner, repo }: LibraryListingParams,
  dirs?: LibraryDirs,
): Promise<LibraryPageHtml | undefined> {
  const route = `/libraries/${host}/${owner}/${repo}`;
  const listing = untypedListings(dirs).find((candidate) => candidate.route === route);
  if (!listing) return undefined;

  const body = await renderMarkdown(listingPageMarkdown(listing));
  const heading = `${libraryPathHtml(listing.owner, listing.repo, "")} <span>${NO_TYPED_API_ICON}</span>`;
  return { title: `${listing.owner}/${listing.repo}`, html: `<h1>${heading}</h1>${body}` };
}

export async function renderLibraryGuideHtml(
  slug: string,
  guideDir?: string,
): Promise<LibraryPageHtml | undefined> {
  const guide = guides(guideDir).find((candidate) => candidate.slug === slug);
  if (!guide) return undefined;
  return { title: guide.title, html: await renderGuideMarkdown(guide.markdown) };
}

function apiPageCardDescription(page: ApiPage): string {
  if (page.brief) return page.brief;
  if (page.category === "library") return page.module.description;
  return "";
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

const withDescription = (card: LibraryIndexCard, description: string): LibraryIndexCard =>
  description ? { ...card, description } : card;

/**
 * The Libraries index: one section per owner, in the sidebar's order, each card
 * titled `repo/namespace` since the owner heads its section. A library with no
 * typed API is one card, marked with the no-typed-API icon, linking its own page.
 * The cards come from the same `libraryOwnerGroups` merge the sidebar reads, so
 * the index and the tree cannot disagree about where a library sits.
 */
export function libraryIndexSections(dirs?: LibraryDirs): LibraryIndex {
  const libraryPages = apiPages(dirs).filter((page) => page.category === "library");
  const listings = untypedListings(dirs);
  const byNamespace = new Map(libraryPages.map((page) => [page.namespace, page]));
  const listingByRoute = new Map(listings.map((listing) => [listing.route, listing]));
  let namespaceCount = 0;
  const sections = libraryOwnerGroups(
    libraryPages.map((page) => ({ namespace: page.namespace, route: page.route })),
    libraryOrigins(dirs),
    listings,
  ).map(
    (owner): LibraryIndexSection => ({
      label: owner.label,
      ...(owner.official ? { note: OFFICIAL_NOTE } : {}),
      cards: owner.libraries.flatMap((library): LibraryIndexCard[] => {
        const listing = library.listing && listingByRoute.get(library.listing.route);
        if (listing) {
          const titleHtml = `${libraryPathHtml("", library.label, "")} ${NO_TYPED_API_ICON}`;
          return [
            withDescription({ href: listing.route, titleHtml }, listingCardDescription(listing)),
          ];
        }
        const pages = library.modules
          .map((module) => byNamespace.get(module.label))
          .filter((page): page is ApiPage => page !== undefined);
        namespaceCount += pages.length;
        return pages.map((page) =>
          withDescription(
            { href: page.route, titleHtml: libraryPathHtml("", library.label, page.namespace) },
            stripPlatformMarkers(htmlToDocText(apiPageCardDescription(page))),
          ),
        );
      }),
    }),
  );
  return { namespaceCount, sections };
}
