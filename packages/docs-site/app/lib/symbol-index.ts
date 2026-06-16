import { htmlToDocText } from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";

export interface SymbolEntry {
  /** Plain-text brief for the tooltip body. */
  brief: string;
  /** The `/api/<namespace>` page the symbol documents. */
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
 */
export function buildSymbolIndex(pages: ApiPage[]): Record<string, SymbolEntry> {
  const index: Record<string, SymbolEntry> = {};
  for (const { namespace, route, module } of pages) {
    index[namespace] = { brief: htmlToDocText(module.description || module.brief), route };
    const members = [
      ...module.functions,
      ...module.variables,
      ...module.constants,
      ...module.properties,
    ];
    for (const member of members) {
      index[qualify(namespace, member.name)] = {
        brief: htmlToDocText(member.description || member.brief),
        route,
      };
    }
  }
  return index;
}
