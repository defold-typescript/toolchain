import { DocumentHead } from "@defold-typescript/docs-render/document-head";
import type { ReactNode } from "react";
import { Provider } from "../components/provider";
import "../styles/globals.css";

declare const __DOCS_BASE__: string;
const BASE_PATH = typeof __DOCS_BASE__ !== "undefined" ? __DOCS_BASE__ : "/";

export default async function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <DocumentHead basePath={BASE_PATH} />
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
