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
    id: "typescript",
    label: "TypeScript",
    subtitle: "Writing TypeScript for this toolchain and how it lowers to Lua.",
    slugs: ["typescript-vs-lua", "typescript-gotchas", "data-structures"],
  },
  {
    id: "core-concepts",
    label: "Core concepts",
    subtitle: "How Defold's script model works in TypeScript.",
    slugs: ["script-lifecycle", "messages", "script-state", "vector-math"],
  },
  {
    id: "cli",
    label: "CLI",
    subtitle: "The command-line verbs you run day to day.",
    slugs: ["init", "watch", "build", "run", "bob", "wall", "resolve"],
  },
  {
    id: "toolchain-workflow",
    label: "Toolchain & workflow",
    subtitle: "Build, inspect, and drive the transpiler.",
    slugs: ["transpile-diagnostics", "debugging", "agent-runbooks", "helper-scripts"],
  },
  {
    id: "project-configuration",
    label: "Project configuration",
    subtitle: "Pin the engine and add native code.",
    slugs: [
      "pinning-defold-target",
      "upgrading",
      "upgrading-to-defold-1-13-0",
      "extensions",
      "authoring-luals-library-types",
    ],
  },
  {
    id: "migration",
    label: "Migration",
    subtitle: "Comparing surfaces and moving off ts-defold.",
    slugs: ["api-docs-vs-ts-defold", "migrating-from-ts-defold"],
  },
  {
    id: "releases",
    label: "Releases",
    subtitle: "What changed in each published toolchain version.",
    slugs: ["changelog"],
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
