"use client";
import { withBase } from "@defold-typescript/docs-render/base";
import { RootProvider } from "fumadocs-ui/provider/waku";
import { lazy, type ReactNode } from "react";

const DocsSearchDialog = lazy(() => import("@defold-typescript/docs-render/search-dialog"));

// Fumadocs styles key dark mode off the `dark` class; the shared renderer's
// stylesheet keys it off `data-theme`. Setting both keeps the two in step.
// Search reads the prebuilt index `scripts/build-search-index.ts` writes, since
// GitHub Pages runs no server.
export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{ attribute: ["class", "data-theme"] }}
      search={{ SearchDialog: DocsSearchDialog, options: { api: withBase("/search-index.json") } }}
    >
      {children}
    </RootProvider>
  );
}
