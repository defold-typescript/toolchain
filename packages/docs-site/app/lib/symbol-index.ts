import { htmlToDocText } from "@defold-typescript/types";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
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
    for (const symbol of apiModuleSymbols(page, page.translations)) {
      const key = qualify(namespace, symbol.name);
      const anchor = slugify(symbol.signature);
      index[key] = { brief: symbol.docMarkdown, route: `${route}#${anchor}` };
    }
  }
  return index;
}
