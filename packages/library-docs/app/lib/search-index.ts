import { type ApiPage, apiModuleSections, qualify } from "./api-surface";
import type { Guide } from "./guides";
import type { LibraryListing } from "./nav";
import { memberAnchors } from "./symbol-index";

export interface SearchRecord {
  route: string;
  title: string;
  text: string;
}

const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

// A page's search records: the page record (`<namespace> API`) holding `pageText`,
// then one record per member heading, routed at the heading anchor
// `memberAnchors` gives it and titled by the member's qualified key. Members
// sharing a heading (an overload group's forms) share its record; a member with
// no anchor folds into the page record, so its text is never dropped.
function pageSearchRecords(
  page: ApiPage,
  pageText: string[],
  members: { kind: string; name: string; text: string }[],
): SearchRecord[] {
  const anchors = memberAnchors(page);
  const byRoute = new Map<string, { title: string; text: string[] }>();
  const unanchored: string[] = [];
  for (const member of members) {
    const anchor = anchors.get(`${member.kind}:${member.name}`);
    if (anchor === undefined) {
      unanchored.push(member.text);
      continue;
    }
    const route = `${page.route}#${anchor}`;
    const record = byRoute.get(route);
    if (record) record.text.push(member.text);
    else byRoute.set(route, { title: qualify(page.namespace, member.name), text: [member.text] });
  }
  return [
    {
      route: page.route,
      title: `${page.namespace} API`,
      text: flatten([...pageText, ...unanchored].join(" ")),
    },
    ...[...byRoute].map(([route, { title, text }]) => ({
      route,
      title,
      text: flatten(text.join(" ")),
    })),
  ];
}

export function toPlainText(markdown: string): string {
  return (
    markdown
      // drop fenced code blocks entirely — search indexes prose, not code
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/~~~[\s\S]*?~~~/g, " ")
      // images, then links: keep the visible label, drop the URL
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // inline code, emphasis, heading and list markers
      .replace(/`+/g, "")
      .replace(/[*~]+/g, "")
      // underscores only as emphasis delimiters, never intra-word (keeps snake_case symbols searchable)
      .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}[-+*]\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * A page record per API page holding its intro, plus one record per member or
 * type heading holding that entry's signatures and prose, routed at the heading's
 * anchor.
 */
export function apiSearchRecords(pages: ApiPage[]): SearchRecord[] {
  return pages
    .flatMap((page) => {
      const { head, sections } = apiModuleSections(page, page.translations);
      return pageSearchRecords(
        page,
        [toPlainText(head)],
        sections.map(({ kind, name, markdown }) => ({ kind, name, text: toPlainText(markdown) })),
      );
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

/** One record per guide, holding its prose. */
export function guideSearchRecords(guides: Guide[]): SearchRecord[] {
  return guides.map(({ route, title, markdown }) => ({
    route,
    title,
    text: toPlainText(markdown),
  }));
}

/** One record per untyped library listing, holding what its page tells a reader. */
export function listingSearchRecords(listings: LibraryListing[]): SearchRecord[] {
  return listings
    .map((listing) => ({
      route: listing.route,
      title: `${listing.owner}/${listing.repo}`,
      text: flatten(
        [listing.ships, ...listing.steps, listing.engineApis ?? ""].map(toPlainText).join(" "),
      ),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}
