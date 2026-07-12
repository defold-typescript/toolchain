import { htmlToDocText } from "@defold-typescript/types";
import { type ApiPage, apiModuleMarkdown } from "./api-surface";
import type { CombinedEntry, CombinedNamespace, CombinedSurface } from "./combined-surface";
import type { GuidePage } from "./guide";

export interface SearchRecord {
  route: string;
  title: string;
  text: string;
}

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
}

const DEFAULT_SEARCH_INDEX_FILE = "search-index.json";
// The `/api/combined/*` union surface, like a historical version, has its own
// index so its authoritative-signature search records never bleed into (or get
// masked by) the default surface. It is not a tracked version id, so it needs
// its own recognized segment.
const COMBINED_SEGMENT = "combined";
const COMBINED_SEARCH_INDEX_FILE = "search-index-combined.json";

export function searchIndexFileForRoute(route: string, versionIds: readonly string[]): string {
  const path = route.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  const candidate = apiIndex >= 0 ? segments[apiIndex + 1] : undefined;
  if (candidate === COMBINED_SEGMENT) return COMBINED_SEARCH_INDEX_FILE;
  return candidate && versionIds.includes(candidate)
    ? `search-index-${candidate}.json`
    : DEFAULT_SEARCH_INDEX_FILE;
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

function combinedNamespaceText(ns: CombinedNamespace): string {
  const parts: string[] = [];
  const intro = htmlToDocText(ns.module.description || ns.module.brief);
  if (intro) parts.push(intro);
  for (const entry of ns.entries) {
    const signature = entry.authoritativeSignature || entry.identity.name;
    const prose = combinedEntryProse(entry);
    parts.push(prose ? `${signature} ${prose}` : signature);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * One search record per Combined namespace, sourced entirely from the shared
 * {@link CombinedSurface} projection — authoritative signatures and availability
 * prose, never a re-walk of the raw per-version surfaces. Routed under
 * `/api/combined/<namespace>` so a hit lands on the union page.
 */
export function combinedSearchRecords(combined: CombinedSurface): SearchRecord[] {
  return combined.namespaces
    .map((ns) => ({
      route: `/api/combined/${ns.namespace}`,
      title: `${ns.namespace} API`,
      text: combinedNamespaceText(ns),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function versionSearchIndexRecords(
  typesDir: string,
  guideRecords: SearchRecord[],
  deps: VersionSearchIndexDeps,
): VersionSearchIndex[] {
  return deps.versions
    .filter((version) => !version.isDefault)
    .map((version) => ({
      version: version.id,
      records: [...guideRecords, ...apiSearchRecords(deps.pagesForVersion(typesDir, version.id))],
    }));
}

function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split("\n")) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return undefined;
}

function toPlainText(markdown: string): string {
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

export function buildSearchIndex(
  pages: GuidePage[],
  readPage: (page: GuidePage) => string,
): SearchRecord[] {
  return pages
    .map((page) => {
      const markdown = readPage(page);
      const heading = firstHeading(markdown);
      const title = heading ?? humanize(page.isIndex ? "overview" : page.slug);
      return { route: page.route, title, text: toPlainText(markdown) };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function apiSearchRecords(pages: ApiPage[]): SearchRecord[] {
  return pages
    .map((page) => ({
      route: page.route,
      title: `${page.namespace} API`,
      text: toPlainText(apiModuleMarkdown(page, page.translations)),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}
