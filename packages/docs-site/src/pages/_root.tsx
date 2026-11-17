import { withBase } from "@defold-typescript/docs-render/base";
import { faviconLinks } from "@defold-typescript/docs-render/favicon";
import { THEME_TOKENS } from "@defold-typescript/docs-render/theme-tokens";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { ReactNode } from "react";
import { TYPES_DIR } from "../../app/lib/api-content";
import { rangePrepaintScript } from "../../app/lib/range-prepaint";
import { Provider } from "../components/provider";
import { apiSurfaceConfig } from "../lib/site";
import "../styles/globals.css";

declare const __DOCS_BASE__: string;
const BASE_PATH = typeof __DOCS_BASE__ !== "undefined" ? __DOCS_BASE__ : "/";

export default async function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The shared renderer's type scale and color tokens, then its unlayered
            rules, which win over the layered typography for the markup it
            writes (signatures, heading anchors). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from the repo */}
        <style dangerouslySetInnerHTML={{ __html: THEME_TOKENS }} />
        {/* The reader's stored API window, applied before first paint. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: built from the repo's own functions */}
        <script dangerouslySetInnerHTML={{ __html: rangePrepaintScript(apiSurfaceConfig()) }} />
        <link rel="stylesheet" href={`${BASE_PATH}critical.css`} />
        {faviconLinks().map((link) => (
          <link
            key={link.rel + link.href}
            rel={link.rel}
            type={link.type}
            sizes={link.sizes}
            href={withBase(link.href)}
          />
        ))}
      </head>
      <body className="flex flex-col min-h-screen">
        <Provider versionIds={apiVersions(TYPES_DIR).map((version) => version.id)}>
          {children}
        </Provider>
      </body>
    </html>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
