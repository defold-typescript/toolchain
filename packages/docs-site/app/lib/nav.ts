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

/** One upstream library: its `modules` render as leaves, nested under `label` when there are several. */
export interface LibraryGroup {
  dir: string;
  label: string;
  modules: Namespace[];
}

export interface ReferenceGroups {
  globals: Namespace[];
  globalTypes: Namespace[];
  luaStdlib: Namespace[];
  engine: Namespace[];
  libraries: LibraryGroup[];
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
  categories.push({ id: "api", label: "API", links: referenceLinks });

  // Vendored third-party libraries live in their own top-level tab after API, so
  // engine reference and community libraries read as distinct sections.
  if (reference.libraries.length > 0) {
    const libraryLinks = reference.libraries.map((lib) => {
      const [only, ...rest] = lib.modules;
      return only && rest.length === 0
        ? toNavLink(only.label, only.route)
        : toNavGroup(
            lib.label,
            lib.modules.map(({ label, route }) => toNavLink(label, route)),
          );
    });
    categories.push({ id: "libraries", label: "Libraries", links: libraryLinks });
  }

  return categories;
}

/** A library page projected to what the nav model needs: its route, its dotted
 * namespace (the grouping key via `moduleDir` and the leaf fallback label), and
 * the presentation-only author-first `displayName` when one is derived. */
export interface LibraryNavPage {
  namespace: string;
  route: string;
  displayName?: string;
}

// Group vendored library pages by their upstream `dir` for the Libraries
// subgroup: a leaf label is the page's `displayName` (falling back to its
// namespace), while the group header stays the bare `dir`. Libraries and their
// modules sort alphabetically by dir / label for stable nav output. The route
// always stays the dotted namespace slug — the alias is presentation only.
export function libraryNavGroups(
  pages: LibraryNavPage[],
  moduleDir: Map<string, string>,
): LibraryGroup[] {
  const byDir = new Map<string, Namespace[]>();
  for (const page of pages) {
    const dir = moduleDir.get(page.namespace) ?? page.namespace;
    const namespace: Namespace = { label: page.displayName ?? page.namespace, route: page.route };
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(namespace);
    else byDir.set(dir, [namespace]);
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, modules]) => ({
      dir,
      label: dir,
      modules: modules.sort((a, b) => a.label.localeCompare(b.label)),
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
