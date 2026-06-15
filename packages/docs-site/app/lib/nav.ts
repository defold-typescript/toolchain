import type { GuidePage } from "./guide";

export interface NavLink {
  label: string;
  route: string;
}

export interface NavCategory {
  id: string;
  label: string;
  links: NavLink[];
}

interface CategorySpec {
  id: string;
  label: string;
  slugs?: string[];
  links?: NavLink[];
}

const FALLBACK_CATEGORY_ID = "guides";

const CATEGORY_MAP: CategorySpec[] = [
  {
    id: "get-started",
    label: "Get started",
    slugs: [
      "",
      "getting-started",
      "add-typescript",
      "init-templates",
      "editor-setup",
      "defold-editor",
    ],
  },
  {
    id: "guides",
    label: "Guides",
    slugs: [
      "advanced-cli",
      "debugging",
      "transpile-diagnostics",
      "pinning-defold-version",
      "extensions",
      "agent-runbooks",
    ],
  },
  {
    id: "language",
    label: "Language",
    slugs: [
      "script-lifecycle",
      "typescript-vs-lua",
      "typescript-gotchas",
      "vector-math",
      "api-docs-vs-ts-defold",
      "migrating-from-ts-defold",
    ],
  },
  {
    id: "reference",
    label: "Reference",
    links: [{ label: "API", route: "/api" }],
  },
];

export function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function linkFor(page: GuidePage): NavLink {
  return { label: page.isIndex ? "Overview" : humanize(page.slug), route: page.route };
}

export function buildNav(pages: GuidePage[]): NavCategory[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const claimed = new Set<string>();

  const categories: NavCategory[] = CATEGORY_MAP.map((spec) => {
    const links: NavLink[] = [];
    if (spec.slugs) {
      for (const slug of spec.slugs) {
        const page = bySlug.get(slug);
        if (!page) continue;
        claimed.add(slug);
        links.push(linkFor(page));
      }
    }
    if (spec.links) links.push(...spec.links);
    return { id: spec.id, label: spec.label, links };
  });

  const fallback = categories.find((category) => category.id === FALLBACK_CATEGORY_ID);
  if (fallback) {
    for (const page of pages) {
      if (claimed.has(page.slug)) continue;
      fallback.links.push(linkFor(page));
    }
  }

  return categories;
}

export function activeCategoryId(route: string, nav: NavCategory[]): string | undefined {
  let best: { id: string; length: number } | undefined;
  for (const category of nav) {
    for (const link of category.links) {
      const matches =
        route === link.route || (link.route !== "/" && route.startsWith(`${link.route}/`));
      if (matches && (!best || link.route.length > best.length)) {
        best = { id: category.id, length: link.route.length };
      }
    }
  }
  return best?.id;
}
