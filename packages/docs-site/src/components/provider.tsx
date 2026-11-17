"use client";
import { RootProvider } from "fumadocs-ui/provider/waku";
import type { ReactNode } from "react";

// Fumadocs styles key dark mode off the `dark` class; the shared renderer's
// stylesheet keys it off `data-theme`. Setting both keeps the two in step.
// Search reads a prebuilt index, since GitHub Pages runs no server.
export function Provider({ basePath, children }: { basePath: string; children: ReactNode }) {
  return (
    <RootProvider
      theme={{ attribute: ["class", "data-theme"] }}
      search={{ options: { type: "static", api: `${basePath}api/search` } }}
    >
      {children}
    </RootProvider>
  );
}
