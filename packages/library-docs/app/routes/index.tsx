/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for `bun test`; the tsconfig's own setting only reaches tsc.
import { createRoute } from "honox/factory";
import { LibraryIndex } from "../components/api-index";
import { apiPages, libraryOrigins, untypedListings } from "../lib/api-content";
import type { LibraryDirs } from "../lib/api-surface-loader";

export function createLibrariesRoute(dirs?: LibraryDirs) {
  return createRoute((c) => {
    return c.render(
      <LibraryIndex
        pages={apiPages(dirs)}
        origins={libraryOrigins(dirs)}
        listings={untypedListings(dirs)}
      />,
      {
        title: "Libraries",
      },
    );
  });
}

export default createLibrariesRoute();
