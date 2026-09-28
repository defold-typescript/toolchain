import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalApiPages } from "./api-content";
import { buildSymbolIndex } from "./symbol-index";

const routesByTypesDir = new Map<string, ReadonlyMap<string, string>>();

/**
 * Symbol key -> `/api/<namespace>#<anchor>` for every member the canonical API
 * reference documents: the same pages the shared `symbol-index.json` is built
 * from. Bare namespace keys (`go`) are left out, as `symbolLinkifier` leaves
 * them out: a whole-page destination is too broad for an inline mention. Prefixless globals (`hash`) keep their member
 * route, and global types (`Hash`) keep their page route, since that page is
 * the type's own entry rather than a namespace of members.
 *
 * The API trees are the guide's sibling packages (`packages/docs/guide` next to
 * `packages/types`), resolved from the guide directory rather than the process
 * cwd so a test rendering the real guide from the repo root reads the same
 * reference the site build does. A guide directory with no sibling types tree
 * (a fixture corpus) links nothing.
 */
export function guideSymbolRoutes(guideDir: string): ReadonlyMap<string, string> {
  const typesDir = resolve(guideDir, "../../types");
  let routes = routesByTypesDir.get(typesDir);
  if (!routes) {
    routes = existsSync(typesDir)
      ? buildRoutes(typesDir, join(typesDir, "../library-types"))
      : new Map();
    routesByTypesDir.set(typesDir, routes);
  }
  return routes;
}

function buildRoutes(typesDir: string, libraryTypesDir: string): ReadonlyMap<string, string> {
  const pages = canonicalApiPages(typesDir, libraryTypesDir);
  const bareNamespaces = new Set(
    pages
      .filter((page) => !page.namespace.includes(".") && page.category !== "global-type")
      .map((page) => page.namespace),
  );
  return new Map(
    Object.entries(buildSymbolIndex(pages))
      .filter(([key]) => !bareNamespaces.has(key))
      .map(([key, entry]) => [key, entry.route]),
  );
}
