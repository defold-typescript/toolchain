"use client";
import { usePathname } from "fumadocs-core/framework";
import type { Folder } from "fumadocs-core/page-tree";
import {
  SidebarFolder,
  SidebarFolderLink,
  SidebarFolderTrigger,
  useFolder,
  useFolderDepth,
} from "fumadocs-ui/components/sidebar/base";
import { useTreePath } from "fumadocs-ui/contexts/tree";
import type { ReactNode } from "react";

// The folder styling of fumadocs-ui's docs layout, which keeps it internal: `itemVariants`,
// `getItemOffset` and the folder parts in `dist/layouts/docs/slots/sidebar.js` (16.19.3).
// Re-sync these classes when an upgrade restyles sidebar folders there.
const ITEM =
  "relative flex flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground wrap-anywhere [&_svg]:size-4 [&_svg]:shrink-0";
const ITEM_BUTTON =
  "transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 hover:transition-none";
const ITEM_LINK = `${ITEM_BUTTON} data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary data-[active=true]:hover:transition-colors`;
const ITEM_HIGHLIGHT =
  "data-[active=true]:before:content-[''] data-[active=true]:before:bg-fd-primary data-[active=true]:before:absolute data-[active=true]:before:w-px data-[active=true]:before:inset-y-2.5 data-[active=true]:before:inset-s-2.5";
const CONTENT_GUIDE_LINE =
  "before:content-[''] before:absolute before:w-px before:inset-y-1 before:bg-fd-border before:inset-s-2.5";

function classes(...names: (string | false)[]): string {
  return names.filter(Boolean).join(" ");
}

function itemOffset(depth: number): string {
  return `calc(${2 + 3 * depth} * var(--spacing))`;
}

function normalize(url: string): string {
  return url.length > 1 && url.endsWith("/") ? url.slice(0, -1) : url;
}

function FolderLabel({ item }: { item: Folder }) {
  const folder = useFolder();
  const depth = useFolderDepth();
  const pathname = usePathname();
  const label = (
    <>
      {item.icon}
      {item.name}
    </>
  );
  if (item.index) {
    return (
      <SidebarFolderLink
        href={item.index.url}
        {...(item.index.external === undefined ? {} : { external: item.index.external })}
        active={normalize(item.index.url) === normalize(pathname)}
        className={classes(ITEM, ITEM_LINK, depth > 1 && ITEM_HIGHLIGHT, "w-full")}
        style={{ paddingInlineStart: itemOffset(depth - 1) }}
      >
        {label}
      </SidebarFolderLink>
    );
  }
  return (
    <SidebarFolderTrigger
      className={classes(ITEM, folder?.collapsible !== false && ITEM_BUTTON, "w-full")}
      style={{ paddingInlineStart: itemOffset(depth - 1) }}
    >
      {label}
    </SidebarFolderTrigger>
  );
}

// Radix collapsible content renders its children only while open, so a closed folder would leave
// its links out of the static HTML. This content keeps them and hides them instead.
function FolderContent({ children }: { children: ReactNode }) {
  const folder = useFolder();
  const depth = useFolderDepth();
  return (
    <div
      className={classes("relative", depth === 1 && CONTENT_GUIDE_LINE)}
      hidden={folder?.open === false}
    >
      <div className="flex flex-col gap-0.5 pt-0.5">{children}</div>
    </div>
  );
}

/**
 * A sidebar folder for fumadocs' `sidebar.components.Folder` that keeps its links in the page
 * while closed, under `hidden`, so a page's static HTML holds its whole sidebar tree.
 */
export function MountedSidebarFolder({ item, children }: { item: Folder; children: ReactNode }) {
  const path = useTreePath();
  return (
    <SidebarFolder
      collapsible={item.collapsible ?? true}
      active={path.includes(item)}
      {...(item.defaultOpen === undefined ? {} : { defaultOpen: item.defaultOpen })}
    >
      <FolderLabel item={item} />
      <FolderContent>{children}</FolderContent>
    </SidebarFolder>
  );
}
