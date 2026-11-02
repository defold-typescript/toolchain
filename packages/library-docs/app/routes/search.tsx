import { createRoute } from "honox/factory";
import SearchResults from "../islands/search-results";

export default createRoute((c) => {
  // SSG cannot bake per-query results, so the page prerenders as a stable shell
  // and the island reads `?q=` and renders the matches in the browser.
  return c.render(
    <article class="prose">
      <h1>Search</h1>
      <SearchResults />
    </article>,
    { title: "Search" },
  );
});
