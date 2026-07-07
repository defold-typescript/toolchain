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
  route?: string;
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

/** One upstream library: its `modules` render as namespace leaves under a route-less library header. */
export interface LibraryGroup {
  dir: string;
  label: string;
  modules: Namespace[];
}

export interface LibraryCreatorGroup {
  creator: string;
  label: string;
  libraries: LibraryGroup[];
}

export interface ReferenceGroups {
  globals: Namespace[];
  globalTypes: Namespace[];
  luaStdlib: Namespace[];
  engine: Namespace[];
  libraries: LibraryCreatorGroup[];
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
      "messages",
      "script-state",
      "data-structures",
      "vector-math",
      "typescript-gotchas",
      "api-docs-vs-ts-defold",
      "migrating-from-ts-defold",
    ],
  },
  {
    id: "tutorial",
    label: "Tutorial",
    slugs: ["tetris-tutorial"],
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
  reference: ReferenceGroups = {
    globals: [],
    globalTypes: [],
    luaStdlib: [],
    engine: [],
    libraries: [],
  },
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
  categories.push({ id: "api", label: "API", route: "/api", links: referenceLinks });

  // Vendored third-party libraries live in their own top-level tab after API, so
  // engine reference and community libraries read as distinct sections.
  if (reference.libraries.length > 0) {
    const libraryLinks = reference.libraries.map((creator) =>
      toNavGroup(
        creator.label,
        creator.libraries.map((lib) =>
          toNavGroup(
            lib.label,
            lib.modules.map(({ label, route }) => toNavLink(label, route)),
          ),
        ),
      ),
    );
    categories.push({
      id: "libraries",
      label: "Libraries",
      route: "/libraries",
      links: libraryLinks,
    });
  }

  return categories;
}

/** A library page projected to what the nav model needs: its route and dotted namespace. */
export interface LibraryNavPage {
  namespace: string;
  route: string;
}

// Group vendored library pages by creator, upstream `dir`, then namespace for
// the Libraries tab. Labels stay slash-free: owner handle, dir, and namespace.
export function libraryCreatorGroups(
  pages: LibraryNavPage[],
  moduleDir: Map<string, string>,
  ownerByDir: Map<string, string>,
): LibraryCreatorGroup[] {
  const byCreator = new Map<string, Map<string, Namespace[]>>();
  for (const page of pages) {
    const dir = moduleDir.get(page.namespace) ?? page.namespace;
    const creator = ownerByDir.get(dir) || dir;
    const libraries = byCreator.get(creator) ?? new Map<string, Namespace[]>();
    const modules = libraries.get(dir) ?? [];
    modules.push({ label: page.namespace, route: page.route });
    libraries.set(dir, modules);
    byCreator.set(creator, libraries);
  }

  return [...byCreator.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([creator, libraries]) => ({
      creator,
      label: creator,
      libraries: [...libraries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dir, modules]) => ({
          dir,
          label: dir,
          modules: modules.sort((a, b) => a.label.localeCompare(b.label)),
        })),
    }));
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
  const visit = (id: string, link: NavLink) => {
    consider(id, link.route);
    for (const child of link.children ?? []) visit(id, child);
  };
  for (const category of nav) {
    consider(category.id, category.route);
    for (const link of category.links) visit(category.id, link);
  }
  // Unmatched /api routes (versioned pages and the /api/<version> index have no
  // nav link) still belong to the engine API category. Library pages carry their
  // own nav links, so they match above and resolve to the Libraries category.
  if (!best && (route === "/api" || route.startsWith("/api/"))) {
    return nav.find((c) => c.id === "api")?.id;
  }
  return best?.id;
}
