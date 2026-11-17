import { isExternalUrl, withBase } from "@defold-typescript/docs-render/base";
import {
  type BadgeCountTable,
  buildBadgeCountTable,
} from "@defold-typescript/docs-render/combined-surface";
import { type Heading, pageHeadings } from "@defold-typescript/docs-render/headings";
import { EXTERNAL_LINK_ICON } from "@defold-typescript/docs-render/phosphor";
import {
  apiVersions,
  canonicalApiPages,
  combinedSurface,
} from "@defold-typescript/docs-render/toolchain-surface";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import type { TOCItemType } from "fumadocs-core/toc";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { createElement, Fragment, type ReactNode } from "react";
import { TYPES_DIR, versionNamespaceAtom } from "../../app/lib/api-content";
import {
  type ApiSurfaceConfig,
  apiNavForPath,
  CANONICAL_SURFACE,
  canonicalLinkPath,
} from "../../app/lib/api-surface-pref";
import { guidePages } from "../../app/lib/content";
import type { GuidePage } from "../../app/lib/guide";
import { buildNav, type NavCategory, type NavLink } from "../../app/lib/nav";
import { NavPills } from "../components/nav-pills";
import { OutlineChip } from "../components/outline-chip";

export const SITE_NAME = "defold-typescript";
export const REPO_URL = "https://github.com/defold-typescript/toolchain";
export const NPM_URL = "https://www.npmjs.com/package/@defold-typescript/cli";

export function apiPages(typesDir: string = TYPES_DIR) {
  return canonicalApiPages(typesDir);
}

export function guidePage(slug: string): GuidePage | undefined {
  return guidePages().find((page) => !page.isIndex && page.slug === slug);
}

export function indexPage(): GuidePage | undefined {
  return guidePages().find((page) => page.isIndex);
}

export function guideTitle(page: GuidePage): string {
  return page.tocTitle ?? page.title ?? page.slug;
}

const surfaceConfigs = new Map<string, ApiSurfaceConfig>();

/**
 * What the range picker, the pre-paint script and the sidebar pills read to map
 * a path and a stored window to each other. Built once: the badge table tallies
 * every selectable window of every namespace.
 */
export function apiSurfaceConfig(typesDir: string = TYPES_DIR): ApiSurfaceConfig {
  const cached = surfaceConfigs.get(typesDir);
  if (cached) return cached;
  const versions = apiVersions(typesDir);
  const versionIds = versions.map((version) => version.id);
  const config: ApiSurfaceConfig = {
    base: withBase("/").replace(/\/$/, ""),
    versionIds,
    defaultVersionId: versions.find((version) => version.isDefault)?.id ?? versionIds[0] ?? "",
    namespacesByVersion: Object.fromEntries(
      versionIds.map((id) => [id, versionNamespaceAtom(id, typesDir)]),
    ),
    badgeCounts: buildBadgeCountTable(combinedSurface(typesDir).namespaces, versionIds),
  };
  surfaceConfigs.set(typesDir, config);
  return config;
}

/**
 * The canonical URL of an API route: a default-version page duplicates the bare
 * `/api` route of the same name, so it points search engines there. `null` for
 * every other route.
 */
export function apiCanonicalHref(route: string, typesDir: string = TYPES_DIR): string | null {
  const config = apiSurfaceConfig(typesDir);
  return canonicalLinkPath(withBase(route), config, config.defaultVersionId);
}

export function navCategories(
  typesDir: string = TYPES_DIR,
  pages: GuidePage[] = guidePages(),
): NavCategory[] {
  const all = apiPages(typesDir);
  const toNamespace = (p: (typeof all)[number]) => ({ label: p.namespace, route: p.route });
  return buildNav(pages, {
    globals: all.filter((p) => p.namespace === "globals").map(toNamespace),
    globalTypes: all.filter((p) => p.category === "global-type").map(toNamespace),
    luaStdlib: all.filter((p) => p.category === "lua-stdlib").map(toNamespace),
    engine: all
      .filter((p) => p.category === "engine" && p.namespace !== "globals")
      .map(toNamespace),
  });
}

/**
 * The top-row tabs for nav categories that leave this site (Libraries), which
 * have no pages to put in the sidebar. Each carries the external-link mark and
 * follows the section tabs.
 */
export function linkTabs(nav: NavCategory[] = navCategories()): LayoutTab[] {
  return nav.flatMap((category) =>
    category.links.length === 0 && category.route && isExternalUrl(category.route)
      ? [
          {
            title: createElement(
              Fragment,
              null,
              category.label,
              createElement("span", {
                className: "inline-flex",
                // biome-ignore lint/security/noDangerouslySetInnerHtml: the Phosphor asset from the repo's own dependency
                dangerouslySetInnerHTML: { __html: EXTERNAL_LINK_ICON },
              }),
            ),
            url: category.route,
          },
        ]
      : [],
  );
}

// An engine namespace leaf carries its count pills after the label.
function leafName(link: NavLink, badgeCounts: BadgeCountTable): ReactNode {
  const match = link.route ? /^\/api\/(?:[^/]+\/)?([^/?]+)$/.exec(link.route) : null;
  const namespace = match?.[1];
  const row = namespace ? badgeCounts[namespace] : undefined;
  if (!namespace || !row) return link.label;
  return createElement(Fragment, null, link.label, createElement(NavPills, { namespace, row }));
}

function toNode(link: NavLink, badgeCounts: BadgeCountTable): Node {
  if (link.children) {
    const folder: Folder = {
      type: "folder",
      name: link.label,
      children: link.children.map((child) => toNode(child, badgeCounts)),
    };
    if (link.route) folder.index = { type: "page", name: link.label, url: link.route };
    return folder;
  }
  return { type: "page", name: leafName(link, badgeCounts), url: link.route ?? "/" };
}

/**
 * The sidebar: each top-level nav category (Get started, Guides, API) becomes a
 * Fumadocs root folder, which the layout shows as a switchable sidebar tab. The
 * Libraries category leaves this site, so it is a header link instead.
 */
export function pageTree(nav: NavCategory[], badgeCounts: BadgeCountTable = {}): Root {
  const children: Node[] = nav
    .filter((category) => category.links.length > 0)
    .map((category) => {
      const folder: Folder = {
        type: "folder",
        name: category.label,
        root: true,
        children: category.links.map((link) => toNode(link, badgeCounts)),
      };
      if (category.route) {
        const index: Item = { type: "page", name: category.label, url: category.route };
        folder.index = index;
      }
      return folder;
    });
  return { name: SITE_NAME, children };
}

// Rewriting a nav onto a version leaves an engine namespace outside that
// version's window un-prefixed, a link off the version's surface; the version's
// tree drops it instead.
function withoutUnprefixedEngine(links: NavLink[], engine: ReadonlySet<string>): NavLink[] {
  return links.flatMap((link) => {
    const match = link.route ? /^\/api\/([^/?]+)$/.exec(link.route) : null;
    if (match && engine.has(match[1] as string)) return [];
    if (!link.children) return [link];
    return [{ ...link, children: withoutUnprefixedEngine(link.children, engine) }];
  });
}

/**
 * One sidebar tree per API surface: the canonical tree, whose API links stay
 * un-prefixed, and one per tracked version, whose engine links stay on that
 * version's window. A Waku layout receives no route, so the client picks the
 * tree for the current path with `surfaceKey`.
 */
export function surfaceTrees(
  typesDir: string = TYPES_DIR,
  pages: GuidePage[] = guidePages(),
): Record<string, Root> {
  const config = apiSurfaceConfig(typesDir);
  const nav = navCategories(typesDir, pages);
  const engine = new Set(Object.values(config.namespacesByVersion).flat());
  const trees: Record<string, Root> = {
    [CANONICAL_SURFACE]: pageTree(nav, config.badgeCounts),
  };
  for (const versionId of config.versionIds) {
    const versioned = apiNavForPath(nav, `/api/${versionId}`, "", config).map((category) =>
      category.id === "api"
        ? { ...category, links: withoutUnprefixedEngine(category.links, engine) }
        : category,
    );
    trees[versionId] = pageTree(versioned, config.badgeCounts);
  }
  return trees;
}

// An outline entry reads like its heading: a signature in its syntax colors, an
// overload heading's `N overloads` badge in place of the `...` it stands for,
// followed by the heading's chips.
function outlineTitle(heading: Heading): ReactNode {
  const { badge, markers, markup } = heading;
  if (!badge && !markers && !markup) return heading.text;
  const text = markup
    ? [
        createElement("span", {
          className: "shiki outline-signature",
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the shared renderer's own token spans, which already hold the badge
          dangerouslySetInnerHTML: { __html: markup },
        }),
      ]
    : badge
      ? [
          heading.text.slice(0, badge.start),
          createElement("span", { className: "api-overload-count" }, badge.label),
          heading.text.slice(badge.end),
        ]
      : [heading.text];
  const chips = (markers ?? []).map((marker) =>
    createElement(OutlineChip, { headingId: heading.id, marker }),
  );
  return createElement(Fragment, null, ...text, ...chips);
}

export function toc(html: string): TOCItemType[] {
  return pageHeadings(html).map((heading: Heading) => ({
    title: outlineTitle(heading),
    url: `#${heading.id}`,
    depth: heading.level,
  }));
}
