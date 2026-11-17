import { DocumentHead } from "@defold-typescript/docs-render/document-head";
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
      <DocumentHead basePath={BASE_PATH}>
        {/* The reader's stored API window, applied before first paint. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: built from the repo's own functions */}
        <script dangerouslySetInnerHTML={{ __html: rangePrepaintScript(apiSurfaceConfig()) }} />
      </DocumentHead>
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
