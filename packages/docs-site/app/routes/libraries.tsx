/** @jsxImportSource hono/jsx */
// Root `bun test` transpiles this file via the cwd (root) tsconfig, which
// intentionally carries no JSX config so non-docs workspaces are not coupled to
// hono/jsx; this pragma pins the JSX dialect for this file.
import { createRoute } from "honox/factory";
import { LibraryIndex } from "../components/api-index";
import { apiPages, defoldListings, libraryOrigins } from "../lib/api-content";
import type { ApiSurfaceDirs } from "./api/[namespace]";

export function createLibrariesRoute(dirs: ApiSurfaceDirs = {}) {
  return createRoute((c) => {
    return c.render(
      <LibraryIndex
        pages={apiPages(dirs.typesDir, dirs.libraryTypesDir)}
        origins={libraryOrigins(dirs.libraryTypesDir)}
        listings={defoldListings(dirs.libraryTypesDir)}
      />,
      {
        title: "Libraries",
      },
    );
  });
}

export default createLibrariesRoute();
