import type { GuidePage } from "./guide";

export interface GuideGroup {
  id: string;
  label: string;
  subtitle: string;
  slugs: string[];
}

// Single source of truth for the Guides subgroups: drives both the sidebar
// subgroup headers (`buildNav`) and the `/guides` landing sections, so the two
// cannot drift. Ordered most-important-to-learn first, most-subtle last.
export const GUIDE_GROUPS: GuideGroup[] = [
  {
    id: "tutorial",
    label: "Tutorial",
    subtitle: "Build a complete game to see the whole workflow end to end.",
    slugs: ["tetris-tutorial"],
  },
  {
    id: "core-concepts",
    label: "Core concepts",
    subtitle: "How TypeScript maps onto Defold's Lua runtime.",
    slugs: [
      "typescript-vs-lua",
      "script-lifecycle",
      "messages",
      "script-state",
      "data-structures",
      "vector-math",
    ],
  },
  {
    id: "toolchain-workflow",
    label: "Toolchain & workflow",
    subtitle: "Build, inspect, and drive the transpiler.",
    slugs: ["transpile-diagnostics", "debugging", "advanced-cli", "agent-runbooks"],
  },
  {
    id: "project-configuration",
    label: "Project configuration",
    subtitle: "Pin the engine and add native code.",
    slugs: ["pinning-defold-version", "extensions"],
  },
  {
    id: "pitfalls-migration",
    label: "Pitfalls & migration",
    subtitle: "Sharp edges and moving off ts-defold.",
    slugs: ["typescript-gotchas", "api-docs-vs-ts-defold", "migrating-from-ts-defold"],
  },
];

export interface GuideGroupPages {
  id: string;
  label: string;
  subtitle: string;
  pages: GuidePage[];
}

/** Resolve each group's declared slugs to pages, dropping any slug with no page. */
export function groupGuidePages(pages: GuidePage[]): GuideGroupPages[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  return GUIDE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    subtitle: group.subtitle,
    pages: group.slugs
      .map((slug) => bySlug.get(slug))
      .filter((page): page is GuidePage => page !== undefined),
  }));
}
