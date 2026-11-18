"use client";
import type { Root } from "fumadocs-core/page-tree";
import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { isLayoutTabActive, type LayoutTab, type LinkItemType } from "fumadocs-ui/layouts/shared";
import { useCallback, useMemo } from "react";
import { useRouter } from "waku";
import {
  type ApiSurfaceConfig,
  CANONICAL_SURFACE,
  carryStatedSince,
  readStoredRange,
  surfaceKey,
} from "../../app/lib/api-surface-pref";
import { sectionTabs } from "../lib/section-tabs";
import { ActiveWindowKey, SurfaceHref, useClientSurface } from "./surface-state";

/**
 * The docs layout with the sidebar tree for the current API surface. A Waku
 * layout receives no route, so the server hands over every tree and this picks
 * one from the path and the stored window, builds the section tabs from it, and
 * publishes the active window for the sidebar pills. The trees keep their plain
 * URLs, which Fumadocs matches against the path to mark the current page; the
 * links render with the URL's `since` through {@link SurfaceHref} instead.
 */
export function SurfaceDocsLayout({
  trees,
  config,
  linkTabs,
  sectionEntries,
  sectionLinks,
  links,
  ...props
}: Omit<DocsLayoutProps, "tree"> & {
  trees: Record<string, Root>;
  config: ApiSurfaceConfig;
  /** Tabs after the section tabs for categories that leave the site. */
  linkTabs: LayoutTab[];
  /** By section title, the page its tab opens in place of its landing page. */
  sectionEntries?: Record<string, string>;
  /** By section title, links shown before `links` only while that section is active. */
  sectionLinks?: Record<string, LinkItemType[]>;
}) {
  const { path } = useRouter();
  const surface = useClientSurface();
  const search = surface?.search ?? "";
  const stored = surface?.stored ?? null;
  const range = readStoredRange(path, search, stored, config);
  const tree = trees[surfaceKey(path, stored, config)] ?? (trees[CANONICAL_SURFACE] as Root);
  const sections = useMemo(() => sectionTabs(tree, sectionEntries), [tree, sectionEntries]);
  const tabs = useMemo(() => [...sections, ...linkTabs], [sections, linkTabs]);
  const section = sections.findLast((tab) => isLayoutTabActive(tab, path))?.title;
  const own = typeof section === "string" ? sectionLinks?.[section] : undefined;
  const allLinks = useMemo(() => [...(own ?? []), ...(links ?? [])], [own, links]);
  const href = useCallback(
    (link: string) => carryStatedSince(link, search, config),
    [search, config],
  );
  return (
    <ActiveWindowKey value={`${range.from}|${range.to}`}>
      <SurfaceHref value={href}>
        <DocsLayout {...props} tree={tree} tabs={tabs} links={allLinks} />
      </SurfaceHref>
    </ActiveWindowKey>
  );
}
