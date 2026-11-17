import { LIBRARY_DOCS_URL } from "@defold-typescript/docs-render/base";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { SidebarTooltips } from "../components/sidebar-tooltips";
import { pageTree, REPO_URL, SITE_NAME } from "../lib/site";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={pageTree()}
      nav={{ title: SITE_NAME }}
      githubUrl={REPO_URL}
      links={[{ text: "Libraries", url: LIBRARY_DOCS_URL, external: true }]}
    >
      {children}
      <SidebarTooltips />
    </DocsLayout>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
