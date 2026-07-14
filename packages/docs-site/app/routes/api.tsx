import { createRoute } from "honox/factory";
import { CombinedIndex } from "../components/api-index";
import { canonicalApiPages, combinedSurface } from "../lib/api-content";
import { namespaceBadgeCounts } from "../lib/combined-surface";

// `/api` is the canonical Combined index: the union of every tracked version's
// namespaces at their unprefixed `/api/<ns>` routes, grouped like the sidebar
// (Globals, Global types, Lua standard, Defold engine). Libraries are reached
// through `/libraries`; the exact-version indexes live at `/api/defold-<version>`.
export default createRoute((c) => {
  const pages = canonicalApiPages().filter((page) => page.category !== "library");
  const badgeCounts = new Map(
    combinedSurface().namespaces.map((ns) => [ns.namespace, namespaceBadgeCounts(ns)]),
  );
  return c.render(
    <CombinedIndex pages={pages} versions={combinedSurface().versions} badgeCounts={badgeCounts} />,
    { title: "API reference" },
  );
});
