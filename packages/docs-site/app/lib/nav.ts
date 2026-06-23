import type { GuidePage } from "./guide";

export interface NavLink {
  label: string;
  labelHtml: string;
  route?: string;
  children?: NavLink[];
}

export interface NavCategory {
  id: string;
  label: string;
  links: NavLink[];
}

interface CategorySpec {
  id: string;
  label: string;
  slugs: string[];
}

export interface Namespace {
  label: string;
  route: string;
}

export interface ReferenceGroups {
  globals: Namespace[];
  globalTypes: Namespace[];
  luaStdlib: Namespace[];
  engine: Namespace[];
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
      "script-state",
      "data-structures",
      "vector-math",
      "typescript-gotchas",
      "api-docs-vs-ts-defold",
      "migrating-from-ts-defold",
    ],
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

function toNavGroup(label: string, children: NavLink[]): NavLink {
  return { label, labelHtml: renderNavLabel(label), children };
}

function linkFor(page: GuidePage): NavLink {
  const base = page.tocTitle ?? (page.isIndex ? "Overview" : humanize(page.slug));
  return toNavLink(base, page.route);
}

export function buildNav(
  pages: GuidePage[],
  reference: ReferenceGroups = { globals: [], globalTypes: [], luaStdlib: [], engine: [] },
): NavCategory[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const claimed = new Set<string>();

  const categories: NavCategory[] = CATEGORY_MAP.map((spec) => {
    const links: NavLink[] = [];
    for (const slug of spec.slugs) {
      const page = bySlug.get(slug);
      if (!page) continue;
      claimed.add(slug);
      links.push(linkFor(page));
    }
    return { id: spec.id, label: spec.label, links };
  });

  const fallback = categories.find((category) => category.id === FALLBACK_CATEGORY_ID);
  if (fallback) {
    for (const page of pages) {
      if (claimed.has(page.slug)) continue;
      fallback.links.push(linkFor(page));
    }
  }

  const groupSpecs: [string, Namespace[]][] = [
    ["Globals", reference.globals],
    ["Global types", reference.globalTypes],
    ["Lua Standard", reference.luaStdlib],
    ["Defold", reference.engine],
  ];
  const referenceLinks = groupSpecs
    .filter(([, namespaces]) => namespaces.length > 0)
    .map(([label, namespaces]) =>
      toNavGroup(
        label,
        namespaces.map(({ label, route }) => toNavLink(label, route)),
      ),
    );
  categories.push({ id: "reference", label: "Reference", links: referenceLinks });

  return categories;
}

export function activeCategoryId(route: string, nav: NavCategory[]): string | undefined {
  let best: { id: string; length: number } | undefined;
  const consider = (id: string, candidate: string | undefined) => {
    if (!candidate) return;
    const matches = route === candidate || (candidate !== "/" && route.startsWith(`${candidate}/`));
    if (matches && (!best || candidate.length > best.length)) {
      best = { id, length: candidate.length };
    }
  };
  for (const category of nav) {
    for (const link of category.links) {
      consider(category.id, link.route);
      for (const child of link.children ?? []) {
        consider(category.id, child.route);
      }
    }
  }
  // Unmatched /api routes (versioned pages and the /api/<version> index have no
  // nav link) still belong to the single Reference category.
  if (!best && (route === "/api" || route.startsWith("/api/"))) {
    return nav.find((c) => c.id === "reference")?.id;
  }
  return best?.id;
}
