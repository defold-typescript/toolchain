"use client";
import { withBase } from "@defold-typescript/docs-render/base";
import { searchIndexFileForRoute } from "@defold-typescript/docs-render/search-route";
import { RootProvider } from "fumadocs-ui/provider/waku";
import { type ComponentProps, lazy, type ReactNode, useContext } from "react";
import { Link, useRouter } from "waku";
import type { DocsSearchDialogProps } from "./search-dialog";
import { SurfaceHref } from "./surface-state";

type LinkTarget = ComponentProps<typeof Link>["to"];

const DocsSearchDialog = lazy(() => import("./search-dialog"));

// A dialog that stays mounted keeps the query and the results of the index it
// last searched. Keying by the index URL gives each index its own dialog and
// leaves the page mounted.
function SearchDialog(props: DocsSearchDialogProps) {
  return <DocsSearchDialog key={props.api} {...props} />;
}

// Fumadocs' own Waku link, rendering the href the docs layout maps it to, so a
// sidebar link keeps the window the page's URL states.
function SurfaceLink({
  href = "#",
  prefetch = true,
  ...props
}: ComponentProps<"a"> & { prefetch?: boolean }) {
  const toHref = useContext(SurfaceHref);
  return (
    <Link
      to={toHref(href) as LinkTarget}
      {...(prefetch ? { unstable_prefetchOnEnter: { mode: "once" } as const } : {})}
      {...props}
    >
      {props.children}
    </Link>
  );
}

// Fumadocs styles key dark mode off the `dark` class; the shared renderer's
// stylesheet keys it off `data-theme`. Setting both keeps the two in step.
// Search reads a prebuilt index, since GitHub Pages runs no server: a versioned
// API page searches its own version's index, every other page the shared one.
export function Provider({
  versionIds,
  children,
}: {
  versionIds: readonly string[];
  children: ReactNode;
}) {
  const { path } = useRouter();
  // The static dialog downloads its index from `api`.
  const api = withBase(`/${searchIndexFileForRoute(path, versionIds)}`);
  return (
    <RootProvider
      theme={{ attribute: ["class", "data-theme"] }}
      search={{ SearchDialog, options: { api } }}
      components={{ Link: SurfaceLink }}
    >
      {children}
    </RootProvider>
  );
}
