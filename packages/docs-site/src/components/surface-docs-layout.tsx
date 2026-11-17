"use client";
import type { Root } from "fumadocs-core/page-tree";
import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
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
  ...props
}: Omit<DocsLayoutProps, "tree"> & {
  trees: Record<string, Root>;
  config: ApiSurfaceConfig;
  /** Tabs after the section tabs for categories that leave the site. */
  linkTabs: LayoutTab[];
}) {
  const { path } = useRouter();
  const surface = useClientSurface();
  const search = surface?.search ?? "";
  const stored = surface?.stored ?? null;
  const range = readStoredRange(path, search, stored, config);
  const tree = trees[surfaceKey(path, stored, config)] ?? (trees[CANONICAL_SURFACE] as Root);
  const tabs = useMemo(() => [...sectionTabs(tree), ...linkTabs], [tree, linkTabs]);
  const href = useCallback(
    (link: string) => carryStatedSince(link, search, config),
    [search, config],
  );
  return (
    <ActiveWindowKey value={`${range.from}|${range.to}`}>
      <SurfaceHref value={href}>
        <DocsLayout {...props} tree={tree} tabs={tabs} />
      </SurfaceHref>
    </ActiveWindowKey>
  );
}
