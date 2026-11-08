import { NO_TYPED_API_ICON } from "./no-typed-api-icon";

export interface NavLink {
  label: string;
  labelHtml: string;
  route?: string;
  children?: NavLink[];
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

export interface Namespace {
  label: string;
  route: string;
}

/** A library namespace's GitHub origin — the `<owner>/<repo>` it is published from. */
export interface LibraryOrigin {
  owner: string;
  repo: string;
  // The origin repo URL the page and listing routes are built from. Absent only
  // on the namespace-shaped fallback a page with no recorded origin gets.
  url?: string;
  // Set only for a library read from Defold's own extension manifest, never from
  // the owner's name, so a third party publishing as `defold` stays unmarked.
  official?: true;
}

// Whether an untyped library registers nothing a script calls (`none`) or
// registers Lua functions upstream never describes in a `.script_api` (`untyped`).
export type LibraryApiKind = "none" | "untyped";

// How a reader adopts an untyped library: add its archive as a dependency
// (`standard`), fork it first because upstream asks for a fork (`fork`), or not at
// all because the repository holds nothing to use yet (`unavailable`).
export type LibraryAdoption = "standard" | "fork" | "unavailable";

// A library with no typed API: it ships no `.script_api`, so instead of an `/api/`
// page it gets a `/libraries/<owner>/<repo>` page built from an authored summary.
// The summary's sections arrive split: `ships` leads the page, `steps` follow the
// rendered add-the-dependency step (or stand alone when `adoption` is not
// `standard`), and `engineApis` closes it when authored. A Defold Asset Portal
// library carries no summary: its portal description is the lead, it has no
// steps beyond the dependency, and `portal` links its portal entry.
export interface LibraryListing extends LibraryOrigin {
  url: string;
  ref: string;
  pinKind: "release" | "tag" | "commit";
  // The Defold version current when a dated release or tag pin was cut: a hint
  // about the pin's age, not a compatibility claim.
  releaseEra?: string;
  description: string;
  route: string;
  api: LibraryApiKind;
  adoption: LibraryAdoption;
  ships: string;
  steps: string[];
  engineApis?: string;
  portal?: { id: string; url: string };
}

/** One upstream repo: its `modules` render as namespace leaves under a route-less repo header. */
export interface LibraryGroup {
  repo: string;
  label: string;
  modules: Namespace[];
  // Set only for an untyped library, which has no modules and links its own page.
  listing?: { route: string; api: LibraryApiKind };
}

export interface LibraryOwnerGroup {
  owner: string;
  label: string;
  official?: true;
  libraries: LibraryGroup[];
}

/** The dimmed marker rendered beside an official owner's label; never part of the label itself. */
export const OFFICIAL_NOTE = "(official)";
const OFFICIAL_NOTE_CLASS = "text-text-faint font-normal";

// Official owners lead, then owners read alphabetically. The sidebar and the
// Libraries index both sort with this, so the two lists cannot disagree.
export function compareLibraryOwners(
  a: { owner: string; official?: true },
  b: { owner: string; official?: true },
): number {
  if (a.official !== b.official) return a.official ? -1 : 1;
  return a.owner.localeCompare(b.owner, undefined, { sensitivity: "base" });
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

// The site's one category: the guides, then every library, owner first. Official
// owners lead.
export function buildNav(
  libraries: LibraryOwnerGroup[],
  guides: { title: string; route: string }[],
): NavCategory[] {
  const libraryLinks = libraries.map((owner) => {
    const group = toNavGroup(
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
        if (lib.listing) {
          const link = moduleLink(lib.label, "", lib.listing.route);
          return { ...link, labelHtml: `${link.labelHtml} ${NO_TYPED_API_ICON}` };
        }
        const only = lib.modules.length === 1 ? lib.modules[0] : undefined;
        if (only) return moduleLink(lib.label, only.label, only.route);
        return toNavGroup(
          lib.label,
          lib.modules.map(({ label, route }) => moduleLink(label, label, route)),
        );
      }),
    );
    if (!owner.official) return group;
    return {
      ...group,
      labelHtml: `${group.labelHtml} <span class="${OFFICIAL_NOTE_CLASS}">${OFFICIAL_NOTE}</span>`,
    };
  });
  const guideGroup = toNavGroup(
    "Guides",
    guides.map(({ title, route }) => toNavLink(title, route)),
  );
  return [
    { id: "libraries", label: "Libraries", route: "/", links: [guideGroup, ...libraryLinks] },
  ];
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
// Untyped listings join their owner as module-less repos, sorted among the typed
// ones; the sidebar and the Libraries index both read this one grouping.
export function libraryOwnerGroups(
  pages: LibraryNavPage[],
  origins: Map<string, LibraryOrigin>,
  listings: LibraryListing[],
): LibraryOwnerGroup[] {
  const byOwner = new Map<string, Map<string, Namespace[]>>();
  const listingByRepo = new Map<string, LibraryGroup["listing"]>();
  const officialOwners = new Set<string>();
  const libraryRepos = (owner: string): Map<string, Namespace[]> => {
    const libraries = byOwner.get(owner) ?? new Map<string, Namespace[]>();
    byOwner.set(owner, libraries);
    return libraries;
  };
  for (const page of pages) {
    const { owner, repo, official } = libraryLineage(page.namespace, origins);
    const libraries = libraryRepos(owner);
    const modules = libraries.get(repo) ?? [];
    modules.push({ label: page.namespace, route: page.route });
    libraries.set(repo, modules);
    if (official) officialOwners.add(owner);
  }
  for (const listing of listings) {
    const libraries = libraryRepos(listing.owner);
    if (listing.official) officialOwners.add(listing.owner);
    if (libraries.has(listing.repo)) continue;
    libraries.set(listing.repo, []);
    listingByRepo.set(`${listing.owner}/${listing.repo}`, {
      route: listing.route,
      api: listing.api,
    });
  }

  return [...byOwner.entries()]
    .map(
      ([owner, libraries]): LibraryOwnerGroup => ({
        owner,
        label: owner,
        ...(officialOwners.has(owner) ? { official: true as const } : {}),
        libraries: [...libraries.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([repo, modules]): LibraryGroup => {
            const listing = listingByRepo.get(`${owner}/${repo}`);
            return {
              repo,
              label: repo,
              modules: modules.sort((a, b) => a.label.localeCompare(b.label)),
              ...(listing ? { listing } : {}),
            };
          }),
      }),
    )
    .sort(compareLibraryOwners);
}
