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
  /** Renders the row in the accent colour — set on library rows that link to a module page. */
  accent?: boolean;
  // Hover-tooltip text, when the row's own label is not the whole story. A
  // library row shows its full `owner/repo/namespace` path here, so a collapsed
  // repo row still reveals the namespace it imports as.
  tooltip?: string;
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
  /** Landing ("root node") route, making the sidebar header a selectable link. */
  route?: string;
  /** Flat page membership; omitted for `guides`, which nests via GUIDE_GROUPS. */
  slugs?: string[];
}

export interface Namespace {
  label: string;
  route: string;
  // Pre-rendered Combined-only count-pill HTML for this namespace's sidebar leaf.
  badgeHtml?: string;
}

/** A library namespace's GitHub origin — the `<owner>/<repo>` it is published from. */
export interface LibraryOrigin {
  owner: string;
  repo: string;
}

/** One upstream repo: its `modules` render as namespace leaves under a route-less repo header. */
export interface LibraryGroup {
  repo: string;
  label: string;
  modules: Namespace[];
}

export interface LibraryOwnerGroup {
  owner: string;
  label: string;
  libraries: LibraryGroup[];
}

export interface ReferenceGroups {
  globals: Namespace[];
  globalTypes: Namespace[];
  luaStdlib: Namespace[];
  engine: Namespace[];
  libraries: LibraryOwnerGroup[];
}

const FALLBACK_CATEGORY_ID = "guides";

const CATEGORY_MAP: CategorySpec[] = [
  {
    id: "get-started",
    label: "Get started",
    route: "/get-started",
    // Same shared list that seeds the /get-started landing (Overview first).
    slugs: [...GET_STARTED_SLUGS],
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
    libraries: [],
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
    return { id: spec.id, label: spec.label, links, ...(spec.route ? { route: spec.route } : {}) };
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

  // Third-party libraries live in their own top-level tab after API, so engine
  // reference and community libraries read as distinct sections.
  if (reference.libraries.length > 0) {
    const libraryLinks = reference.libraries.map((owner) =>
      toNavGroup(
        owner.label,
        owner.libraries.map((lib) => {
          // A row that reaches a module page takes the accent, matching the
          // segment the page's own heading accents; the owner and repo rows above
          // it only group, so they stay muted. Its tooltip is the full path the
          // page titles itself with, so a row whose label omits a segment — a
          // collapsed repo row, or a namespace row read out of its owner's
          // context — still shows the whole lineage on hover.
          const moduleLink = (label: string, namespace: string, route: string): NavLink => ({
            ...toNavLink(label, route),
            accent: true,
            tooltip: libraryPathSegments(owner.label, lib.label, namespace).join("/"),
          });
          // A repo publishing a single module has nothing to expand: the module
          // takes the repo's own label, so the tree never renders a one-child
          // expander. The label names what the row points at either way — a repo
          // when the row groups, a repo-titled page when it links.
          const only = lib.modules.length === 1 ? lib.modules[0] : undefined;
          if (only) return moduleLink(lib.label, only.label, only.route);
          return toNavGroup(
            lib.label,
            lib.modules.map(({ label, route }) => moduleLink(label, label, route)),
          );
        }),
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

// The grouping key for an authored-here library (absent from `moduleDir`): its
// top namespace segment. Same-repo LuaLS/script_api modules share a top segment
// (e.g. `saver.saver`/`saver.storage`), so they collapse into one library group;
// single-segment namespaces (`druid`, `event`, …) return themselves unchanged.
export function libraryGroupKey(namespace: string): string {
  return namespace.split(".")[0] ?? namespace;
}

// A namespace's `owner/repo` lineage, resolved the one way every library surface
// resolves it: the GitHub origin its own manifest records. A namespace with no
// recorded origin stands in for its own owner and repo with its top namespace
// segment, so it nests under a named group rather than a blank one. The library
// page heading, the Libraries tree, and the index cards share this so a page
// cannot title itself `britzl/in` while its own card reads `britzl/defold-input`.
export function libraryLineage(
  namespace: string,
  origins: Map<string, LibraryOrigin>,
): LibraryOrigin {
  const fallback = libraryGroupKey(namespace);
  return origins.get(namespace) ?? { owner: fallback, repo: fallback };
}

// The `owner/repo/namespace` path a library identifies itself by. A segment equal
// to the one before it collapses away, so a repo whose namespace repeats its own
// name reads `8bitskull/dicebag` rather than `8bitskull/dicebag/dicebag`, while a
// repo that renames its module keeps both
// (`whiteboxdev/library-defold-persist/persist`). The page heading styles these
// segments and the sidebar joins them into each row's hover tooltip, so the two
// always name a library the same way.
export function libraryPathSegments(owner: string, repo: string, namespace: string): string[] {
  return [owner, repo, namespace].filter(
    (segment, index, all) => segment !== "" && segment !== all[index - 1],
  );
}

// Group library pages by GitHub owner, then repo, then namespace for the
// Libraries tab. Labels stay slash-free: owner handle, repo name, and namespace.
export function libraryOwnerGroups(
  pages: LibraryNavPage[],
  origins: Map<string, LibraryOrigin>,
): LibraryOwnerGroup[] {
  const byOwner = new Map<string, Map<string, Namespace[]>>();
  for (const page of pages) {
    const { owner, repo } = libraryLineage(page.namespace, origins);
    const libraries = byOwner.get(owner) ?? new Map<string, Namespace[]>();
    const modules = libraries.get(repo) ?? [];
    modules.push({ label: page.namespace, route: page.route });
    libraries.set(repo, modules);
    byOwner.set(owner, libraries);
  }

  return [...byOwner.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([owner, libraries]) => ({
      owner,
      label: owner,
      libraries: [...libraries.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([repo, modules]) => ({
          repo,
          label: repo,
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
