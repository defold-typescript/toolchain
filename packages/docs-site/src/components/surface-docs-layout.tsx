"use client";
import type { Root } from "fumadocs-core/page-tree";
import { DocsLayout, type DocsLayoutProps } from "fumadocs-ui/layouts/docs";
import { useRouter } from "waku";
import {
  type ApiSurfaceConfig,
  CANONICAL_SURFACE,
  readStoredRange,
  surfaceKey,
} from "../../app/lib/api-surface-pref";
import { ActiveWindowKey, useClientSurface } from "./surface-state";

/**
 * The docs layout with the sidebar tree for the current API surface. A Waku
 * layout receives no route, so the server hands over every tree and this picks
 * one from the path and the stored window, and publishes the active window for
 * the sidebar pills.
 */
export function SurfaceDocsLayout({
  trees,
  config,
  ...props
}: Omit<DocsLayoutProps, "tree"> & {
  trees: Record<string, Root>;
  config: ApiSurfaceConfig;
}) {
  const { path } = useRouter();
  const surface = useClientSurface();
  const stored = surface?.stored ?? null;
  const range = readStoredRange(path, surface?.search ?? "", stored, config);
  const tree = trees[surfaceKey(path, stored, config)] ?? (trees[CANONICAL_SURFACE] as Root);
  return (
    <ActiveWindowKey value={`${range.from}|${range.to}`}>
      <DocsLayout {...props} tree={tree} />
    </ActiveWindowKey>
  );
}
