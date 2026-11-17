"use client";
import { navLeafBadgeHtml } from "../../app/lib/nav-badges";
import { useActiveWindowKey } from "./surface-state";

/**
 * One engine namespace's sidebar count pills, for the window the layout makes
 * active: the window the path states while hydrating, the stored one after.
 */
export function NavPills({
  namespace,
  row,
}: {
  namespace: string;
  row: Record<string, readonly [number, number, number]>;
}) {
  const html = navLeafBadgeHtml({ [namespace]: row }, namespace, useActiveWindowKey());
  if (!html) return null;
  // biome-ignore lint/security/noDangerouslySetInnerHtml: markup from the repo's own renderer
  return <span className="contents" dangerouslySetInnerHTML={{ __html: html }} />;
}
