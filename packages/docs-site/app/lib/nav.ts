import { isExternalUrl, LIBRARY_DOCS_URL } from "./base";
import { GET_STARTED_SLUGS } from "./get-started";
import type { GuidePage } from "./guide";
import { GUIDE_GROUPS } from "./guide-groups";

export interface NavLink {
  label: string;
  labelHtml: string;
  route?: string;
  children?: NavLink[];
  // Combined-only sidebar count pills (pre-rendered HTML), appended after the
  // label; stripped when the nav is rewritten onto an exact-version surface.
  badgeHtml?: string;
}

export interface NavCategory {
  id: string;
  label: string;
  route?: string;
  links: NavLink[];
  // Sidebar-only links to pages another category owns. Kept apart from `links`
  // so the pager and the active-tab match never see them.
  shortcuts?: NavLink[];
}

interface CategorySpec {
  id: string;
  label: string;
  /** Landing ("root node") route, making the sidebar header a selectable link. */
  route?: string;
  /** Flat page membership; omitted for `guides`, which nests via GUIDE_GROUPS. */
  slugs?: string[];
  /** Pages listed under the sidebar's Shortcuts header without joining the category. */
  shortcutSlugs?: string[];
}

export interface Namespace {
  label: string;
  route: string;
  // Pre-rendered Combined-only count-pill HTML for this namespace's sidebar leaf.
  badgeHtml?: string;
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
    route: "/get-started",
    // Same shared list that seeds the /get-started landing (Overview first).
    slugs: [...GET_STARTED_SLUGS],
    shortcutSlugs: ["changelog"],
  },
  {
    id: "guides",
    label: "Guides",
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

function toNavLink(label: string, route: string, badgeHtml?: string): NavLink {
  return {
    label: stripBackticks(label),
    labelHtml: renderNavLabel(label),
    route,
    ...(badgeHtml ? { badgeHtml } : {}),
  };
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
  reference: ReferenceGroups = {
    globals: [],
    globalTypes: [],
    luaStdlib: [],
    engine: [],
  },
): NavCategory[] {
  const bySlug = new Map(pages.map((page) => [page.slug, page]));
  const claimed = new Set<string>();

  const categories: NavCategory[] = CATEGORY_MAP.map((spec) => {
    if (spec.id === "guides") {
      const links = GUIDE_GROUPS.map((group) => {
        const children: NavLink[] = [];
        for (const slug of group.slugs) {
          const page = bySlug.get(slug);
          if (!page) continue;
          claimed.add(slug);
          children.push(linkFor(page));
        }
        return toNavGroup(group.label, children);
      });
      return { id: spec.id, label: spec.label, route: "/guides", links };
    }
    const links: NavLink[] = [];
    for (const slug of spec.slugs ?? []) {
      const page = bySlug.get(slug);
      if (!page) continue;
      claimed.add(slug);
      links.push(linkFor(page));
    }
    const shortcuts = (spec.shortcutSlugs ?? []).flatMap((slug) => {
      const page = bySlug.get(slug);
      return page ? [linkFor(page)] : [];
    });
    return {
      id: spec.id,
      label: spec.label,
      links,
      ...(spec.route ? { route: spec.route } : {}),
      ...(shortcuts.length > 0 ? { shortcuts } : {}),
    };
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
        namespaces.map(({ label, route, badgeHtml }) => toNavLink(label, route, badgeHtml)),
      ),
    );
  categories.push({ id: "api", label: "API", route: "/api", links: referenceLinks });

  // Libraries have their own docs site, so this tab leaves this one and has no
  // pages to list.
  categories.push({ id: "libraries", label: "Libraries", route: LIBRARY_DOCS_URL, links: [] });

  return categories;
}

export function activeCategoryId(route: string, nav: NavCategory[]): string | undefined {
  let best: { id: string; length: number } | undefined;
  const consider = (id: string, rawCandidate: string | undefined) => {
    if (!rawCandidate || isExternalUrl(rawCandidate)) return;
    // A rewritten API route carries the active window's `?since=`; `route` is the
    // bare pathname, so the query is dropped before matching.
    const candidate = rawCandidate.split("?")[0] as string;
    const matches = route === candidate || (candidate !== "/" && route.startsWith(`${candidate}/`));
    if (matches && (!best || candidate.length > best.length)) {
      best = { id, length: candidate.length };
    }
  };
  const visit = (id: string, link: NavLink) => {
    consider(id, link.route);
    for (const child of link.children ?? []) visit(id, child);
  };
  for (const category of nav) {
    consider(category.id, category.route);
    for (const link of category.links) visit(category.id, link);
  }
  // Unmatched /api routes (versioned pages and the /api/<version> index have no
  // nav link) still belong to the engine API category.
  if (!best && (route === "/api" || route.startsWith("/api/"))) {
    return nav.find((c) => c.id === "api")?.id;
  }
  return best?.id;
}
