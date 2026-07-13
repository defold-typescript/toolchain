import { htmlToDocText } from "@defold-typescript/types";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
import { type CombinedSurface, combinedApiPages } from "./combined-surface";
import { slugify } from "./headings";

export interface SymbolEntry {
  /** Plain-text brief for the tooltip body. */
  brief: string;
  /**
   * The `/api/<namespace>` page the symbol documents, with a `#anchor` for
   * members so a tooltip or cross-link can jump straight to the symbol's
   * heading. The bare-namespace entry has no anchor.
   */
  route: string;
}

// Functions/constants come namespace-qualified (`go.get_position`), properties
// come bare (`position`); only prefix when the name is not already qualified.
// The synthetic `globals` page documents prefixless ambient symbols (`hash`),
// so its members are keyed bare.
function qualify(namespace: string, name: string): string {
  if (namespace === "globals") return name;
  return name.startsWith(`${namespace}.`) ? name : `${namespace}.${name}`;
}

/**
 * Flat lookup registry from an inline-code key to the symbol it documents,
 * derived from the already-parsed API surface. The namespace itself (`go`) and
 * every function/variable/constant/property (`go.get_position`) become keys.
 * Member routes carry the heading-slug anchor so a same-page cross-reference
 * (e.g. `camera.screen_to_world` mentioned inside `camera.world_to_screen`)
 * jumps to the right section rather than the top of the page.
 */
export function buildSymbolIndex(pages: ApiPage[]): Record<string, SymbolEntry> {
  const index: Record<string, SymbolEntry> = {};
  for (const page of pages) {
    const { namespace, route, module } = page;
    index[namespace] = { brief: htmlToDocText(module.description || module.brief), route };
    for (const symbol of apiModuleSymbols(page, page.translations, page.signatures)) {
      const key = qualify(namespace, symbol.name);
      const anchor = slugify(symbol.signature);
      index[key] = { brief: symbol.docMarkdown, route: `${route}#${anchor}` };
    }
  }
  return index;
}

/**
 * The single Combined symbol index, derived from the shared
 * {@link CombinedSurface} projection rather than a re-walk of raw surfaces. Every
 * key routes to its canonical `/api/<namespace>` page (members carry the heading
 * anchor), so a tooltip on a canonical page resolves against the union surface.
 * The projection carries the `/api/combined/<ns>` compat identity, so the routes
 * are re-mapped onto the canonical unprefixed surface here.
 */
export function combinedSymbolIndexRecords(combined: CombinedSurface): Record<string, SymbolEntry> {
  const canonicalPages = combinedApiPages(combined).map((page) => ({
    ...page,
    route: `/api/${page.namespace}`,
  }));
  return buildSymbolIndex(canonicalPages);
}

const DEFAULT_SYMBOL_INDEX_FILE = "symbol-index.json";

/**
 * The symbol-index file the client tooltip must fetch for a given page route,
 * mirroring {@link searchIndexFileForRoute}: a `/api/defold-<version>/...` route
 * (the current version included) resolves to `symbol-index-<version-id>.json` so
 * same-name symbols whose signatures differ across releases tool-tip against the
 * page's own version; a canonical unprefixed route (or an unknown prefix)
 * resolves to the shared Combined `symbol-index.json`. The `/api/combined/*`
 * compat route is not a tracked version id, so it falls through to that shared
 * canonical index. The tooltip must never load the shared index on a version page.
 */
export function symbolIndexFileForRoute(route: string, versionIds: readonly string[]): string {
  const path = route.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  const apiIndex = segments.indexOf("api");
  const candidate = apiIndex >= 0 ? segments[apiIndex + 1] : undefined;
  return candidate && versionIds.includes(candidate)
    ? `symbol-index-${candidate}.json`
    : DEFAULT_SYMBOL_INDEX_FILE;
}

// Minimal version shape, declared locally rather than imported from
// `api-surface-loader` so the client tooltip's import graph stays node-free
// (mirrors `SearchIndexVersion` in `search-index.ts`).
export interface SymbolIndexVersion {
  id: string;
  isDefault: boolean;
}

export interface VersionSymbolIndex {
  version: string;
  index: Record<string, SymbolEntry>;
}

/**
 * One version-correct symbol index per version, the current (default) version
 * included, built from that version's own prefixed pages so no entry silently
 * points at a canonical route. The default no longer borrows the flat
 * `symbol-index.json` (now the Combined canonical index); it gets its own
 * `symbol-index-<version-id>.json` like every other version.
 */
export function versionSymbolIndexRecords(
  versions: readonly SymbolIndexVersion[],
  pagesForVersion: (versionId: string) => ApiPage[],
): VersionSymbolIndex[] {
  return versions.map((version) => ({
    version: version.id,
    index: buildSymbolIndex(pagesForVersion(version.id)),
  }));
}
