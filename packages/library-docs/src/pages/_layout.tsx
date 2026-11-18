import { withBase } from "@defold-typescript/docs-render/base";
import { deviconMono } from "@defold-typescript/docs-render/devicon";
import { EXTERNAL_LINK_ICON } from "@defold-typescript/docs-render/phosphor";
import { MountedSidebarFolder } from "@defold-typescript/docs-render/sidebar-folder";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { TOOLCHAIN_DOCS_URL } from "../../app/lib/toolchain-links";
import { SidebarTooltips } from "../components/sidebar-tooltips";
import { navCategories, pageTree, REPO_URL, SITE_NAME } from "../lib/site";

const GITHUB_ICON = deviconMono("github/github-original", "");

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={pageTree(navCategories())}
      sidebar={{ components: { Folder: MountedSidebarFolder } }}
      nav={{
        title: (
          <>
            <img src={withBase("/logo-ver-classic.svg")} alt="" width={24} height={24} />
            {SITE_NAME}
          </>
        ),
      }}
      links={[
        {
          text: (
            <>
              Toolchain docs
              <span
                className="inline-flex"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: the Phosphor asset from the repo's own dependency
                dangerouslySetInnerHTML={{ __html: EXTERNAL_LINK_ICON }}
              />
            </>
          ),
          url: TOOLCHAIN_DOCS_URL,
          external: true,
        },
        {
          type: "icon",
          text: "GitHub",
          label: "GitHub repository",
          url: REPO_URL,
          external: true,
          icon: (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the Devicon asset from the repo's own dependency
            <span className="contents" dangerouslySetInnerHTML={{ __html: GITHUB_ICON }} />
          ),
        },
      ]}
    >
      {children}
      <SidebarTooltips />
    </DocsLayout>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
