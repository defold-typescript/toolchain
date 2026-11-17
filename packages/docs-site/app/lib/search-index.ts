import {
  type ApiPage,
  apiModuleSections,
  qualify,
} from "@defold-typescript/docs-render/api-surface";
import {
  type CombinedEntry,
  type CombinedNamespace,
  type CombinedSurface,
  combinedNamespaceToApiPage,
} from "@defold-typescript/docs-render/combined-surface";
import { allPageHeadings } from "@defold-typescript/docs-render/headings";
import type { SearchRecord } from "@defold-typescript/docs-render/search-route";
import { memberAnchors } from "@defold-typescript/docs-render/symbol-index";
import { htmlToDocText } from "@defold-typescript/types";
import type { GuidePage } from "./guide";

export interface SearchIndexVersion {
  id: string;
  isDefault: boolean;
}

export interface VersionSearchIndex {
  version: string;
  records: SearchRecord[];
}

interface VersionSearchIndexDeps {
  versions: SearchIndexVersion[];
  pagesForVersion: (typesDir: string, versionId: string) => ApiPage[];
  /**
   * The version-independent reference pages (core value types, Lua stdlib)
   * shared across every version, each already at its canonical
   * `/api/<ns>` route. Composed into every version index so a lookup from a
   * version page still finds shared reference content without a version-prefixed
   * copy. Loaded once by the caller and passed to every version output.
   */
  sharedPages: ApiPage[];
}

// Flat prose for a Combined search record: the friendly availability label for a
// symbol that is not present in every tracked version, plus its curated
// lifecycle facts. Empty when the entry is universal and carries no fact.
function combinedEntryProse(entry: CombinedEntry): string {
  const parts: string[] = [];
  if (entry.label.kind !== "all") parts.push(entry.label.label);
  if (entry.deprecatedSince) parts.push(`Deprecated since ${entry.deprecatedSince}`);
  if (entry.box2d && entry.box2d.length > 0) parts.push(`Box2D: ${entry.box2d.join(", ")}`);
  if (entry.replacement) parts.push(`Replaced by ${entry.replacement.name}`);
  return parts.length > 0 ? `${parts.join(". ")}.` : "";
}

function combinedEntryText(entry: CombinedEntry): string {
  const signature = entry.authoritativeSignature || entry.identity.name;
  const prose = combinedEntryProse(entry);
  return prose ? `${signature} ${prose}` : signature;
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

/**
 * Search records for every Combined namespace, sourced entirely from the shared
 * {@link CombinedSurface} projection — authoritative signatures and availability
 * prose, never a re-walk of the raw per-version surfaces. Each namespace yields
 * a page record at the canonical unprefixed `/api/<namespace>` holding the module
 * intro, plus one record per member heading anchored on that page, so a hit lands
 * on the member it matched.
 */
export function combinedSearchRecords(combined: CombinedSurface): SearchRecord[] {
  return combined.namespaces
    .flatMap((ns: CombinedNamespace) =>
      pageSearchRecords(
        combinedNamespaceToApiPage(ns),
        [htmlToDocText(ns.module.description || ns.module.brief)],
        ns.entries.map((entry) => ({
          kind: entry.identity.kind === "TYPEDEF" ? "type" : entry.identity.kind.toLowerCase(),
          name: entry.identity.name,
          text: combinedEntryText(entry),
        })),
      ),
    )
    .sort((a, b) => a.route.localeCompare(b.route));
}

// One record set per tracked version, the current (default) version included: the
// guide records, the shared version-independent reference records (at their
// canonical `/api/<ns>` routes), and that version's own engine pages (at their
// `/api/<id>/<ns>` prefixed routes). The version file no longer borrows the
// unversioned `search-index.json` (now the Combined canonical index); it composes
// its own engine surface with the shared reference content so an in-page lookup
// resolves both.
export function versionSearchIndexRecords(
  typesDir: string,
  guideRecords: SearchRecord[],
  deps: VersionSearchIndexDeps,
): VersionSearchIndex[] {
  const sharedRecords = apiSearchRecords(deps.sharedPages);
  return deps.versions.map((version) => ({
    version: version.id,
    records: [
      ...guideRecords,
      ...sharedRecords,
      ...apiSearchRecords(deps.pagesForVersion(typesDir, version.id)),
    ],
  }));
}

function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

// An `h2`/`h3` element carrying the id the page renders: where a guide section starts.
const SECTION_HEADING = /<h([23])\b[^>]*\sid="[^"]*"[^>]*>[\s\S]*?<\/h\1>/gi;
const FIRST_H1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/i;
// Code blocks with their titled frame, inline SVG, and an admonition's `Tip` label
// carry no prose to search.
const NOT_PROSE =
  /<(pre|svg)\b[\s\S]*?<\/\1>|<figure class="code-block">[\s\S]*?<\/figure>|<span class="admonition-title">[\s\S]*?<\/span><\/span>/gi;
// A block element runs into the next one's text once its tags are stripped.
const BLOCK_END = /<\/(?:h[1-6]|li|dt|dd|t[dhr]|div|blockquote|figcaption)>/gi;

function sectionText(html: string): string {
  return toPlainText(htmlToDocText(html.replace(NOT_PROSE, " ").replace(BLOCK_END, "$& ")));
}

// A rendered guide page's records: the text before its first `h2`/`h3` at the
// page route, then one record per `h2`/`h3` section at `<route>#<heading id>`.
// Deeper headings stay inside their section.
function guidePageRecords(page: GuidePage, html: string): SearchRecord[] {
  const sections = [...html.matchAll(SECTION_HEADING)].flatMap((match) => {
    const heading = allPageHeadings(match[0])[0];
    return heading ? [{ heading, start: match.index, end: match.index + match[0].length }] : [];
  });
  const head = html.slice(0, sections[0]?.start ?? html.length);
  const title =
    allPageHeadings(html).find((heading) => heading.level === 1)?.text ??
    humanize(page.isIndex ? "overview" : page.slug);
  return [
    { route: page.route, title, text: sectionText(head.replace(FIRST_H1, " ")) },
    ...sections.map(({ heading, end }, i) => ({
      route: `${page.route}#${heading.id}`,
      title: heading.text,
      text: sectionText(html.slice(end, sections[i + 1]?.start ?? html.length)),
    })),
  ];
}

export async function buildSearchIndex(
  pages: GuidePage[],
  renderPage: (page: GuidePage) => Promise<string>,
): Promise<SearchRecord[]> {
  const rendered = await Promise.all(
    pages.map(async (page) => guidePageRecords(page, await renderPage(page))),
  );
  return rendered.flat().sort((a, b) => a.route.localeCompare(b.route));
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
