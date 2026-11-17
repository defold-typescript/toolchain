"use client";
import { withBase } from "@defold-typescript/docs-render/base";
import { searchIndexFileForRoute } from "@defold-typescript/docs-render/search-route";
import { RootProvider } from "fumadocs-ui/provider/waku";
import type { ReactNode } from "react";
import { useRouter } from "waku";

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
      search={{ options: { type: "static", api } }}
    >
      {children}
    </RootProvider>
  );
}
