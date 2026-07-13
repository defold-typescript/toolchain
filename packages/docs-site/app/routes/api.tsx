import { createRoute } from "honox/factory";
import { CombinedIndex } from "../components/api-index";
import { canonicalApiPages, combinedSurface } from "../lib/api-content";

// `/api` is the canonical Combined index: the union of every tracked version's
// engine namespaces at their unprefixed `/api/<ns>` routes. Version-independent
// categories (global types, Lua stdlib, libraries) are reached through the
// sidebar; the exact-version indexes live at `/api/defold-<version>`.
export default createRoute((c) => {
  const pages = canonicalApiPages().filter((page) => page.category === "engine");
  return c.render(<CombinedIndex pages={pages} versions={combinedSurface().versions} />, {
    title: "API reference",
  });
});
