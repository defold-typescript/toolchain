import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { createRoute } from "honox/factory";
import SearchResults from "../islands/search-results";
import { TYPES_DIR } from "../lib/api-content";

export default createRoute((c) => {
  // Every version, the current one included, owns an explicit prefixed index now,
  // so the island's `?index=` allowlist and route-based selection must see them all.
  const versionIds = apiVersions(TYPES_DIR).map((version) => version.id);
  // SSG cannot bake per-query results, so the page prerenders as a stable shell
  // and the island reads `?q=` and renders the matches in the browser.
  return c.render(
    <article class="prose">
      <h1>Search</h1>
      <SearchResults versionIds={versionIds} />
    </article>,
    { title: "Search" },
  );
});
