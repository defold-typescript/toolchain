import type { GuidePage } from "./guide";

export interface NavLink {
  label: string;
  labelHtml: string;
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
  links?: { label: string; route: string }[];
}

const FALLBACK_CATEGORY_ID = "guides";

const CATEGORY_MAP: CategorySpec[] = [
  {
    id: "get-started",
    label: "Get started",
    slugs: [
      "",
      "getting-started",
      "init-templates",
      "add-typescript",
      "editor-setup",
      "defold-editor",
    ],
  },
  {
    id: "guides",
    label: "Guides",
    slugs: [
      "transpile-diagnostics",
      "debugging",
      "pinning-defold-version",
      "extensions",
      "advanced-cli",
      "agent-runbooks",
    ],
  },
  {
    id: "language",
    label: "Language",
    slugs: [
      "typescript-vs-lua",
      "script-lifecycle",
      "vector-math",
      "typescript-gotchas",
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderNavLabel(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function stripBackticks(text: string): string {
  return text.replace(/`/g, "");
}

function toNavLink(label: string, route: string): NavLink {
  return { label: stripBackticks(label), labelHtml: renderNavLabel(label), route };
}

function linkFor(page: GuidePage): NavLink {
  const base = page.tocTitle ?? (page.isIndex ? "Overview" : humanize(page.slug));
  return toNavLink(base, page.route);
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
    if (spec.links) links.push(...spec.links.map((link) => toNavLink(link.label, link.route)));
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
