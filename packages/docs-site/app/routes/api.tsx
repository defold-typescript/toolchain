import { namespaceBadgeCounts } from "@defold-typescript/docs-render/combined-surface";
import {
  canonicalApiPages,
  combinedSurface,
} from "@defold-typescript/docs-render/toolchain-surface";
import { createRoute } from "honox/factory";
import { CombinedIndex } from "../components/api-index";
import { TYPES_DIR } from "../lib/api-content";

// `/api` is the canonical Combined index: the union of every tracked version's
// namespaces at their unprefixed `/api/<ns>` routes, grouped like the sidebar
// (Globals, Global types, Lua standard, Defold engine). Libraries are reached
// through the library docs site; the exact-version indexes live at
// `/api/defold-<version>`.
export default createRoute((c) => {
  const pages = canonicalApiPages(TYPES_DIR);
  const badgeCounts = new Map(
    combinedSurface(TYPES_DIR).namespaces.map((ns) => [ns.namespace, namespaceBadgeCounts(ns)]),
  );
  return c.render(
    <CombinedIndex
      pages={pages}
      versions={combinedSurface(TYPES_DIR).versions}
      badgeCounts={badgeCounts}
    />,
    { title: "API reference" },
  );
});
