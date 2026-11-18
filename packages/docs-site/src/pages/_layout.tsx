import { withBase } from "@defold-typescript/docs-render/base";
import { deviconMono } from "@defold-typescript/docs-render/devicon";
import { MountedSidebarFolder } from "@defold-typescript/docs-render/sidebar-folder";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { ReactNode } from "react";
import { TYPES_DIR } from "../../app/lib/api-content";
import { RangePicker } from "../components/range-picker";
import { SectionDropdown } from "../components/section-dropdown";
import { SidebarTooltips } from "../components/sidebar-tooltips";
import { SurfaceDocsLayout } from "../components/surface-docs-layout";
import {
  apiSurfaceConfig,
  linkTabs,
  NPM_URL,
  REPO_URL,
  SITE_NAME,
  surfaceTrees,
} from "../lib/site";

// GitHub is a plain icon link rather than `githubUrl`, which Fumadocs would place
// after every other link.
const GITHUB_ICON = deviconMono("github/github-original", "");
const NPM_ICON = deviconMono("npm/npm-plain", "");

// Fumadocs' docs grid with the section tabs moved up to sit right under the
// header, above the page outline bar that narrower screens show. The columns
// are Fumadocs' own; only the row order differs.
const GRID_TABS_FIRST = `"sidebar sidebar header toc toc"
"sidebar sidebar tabs toc toc"
"sidebar sidebar toc-popover toc toc"
"sidebar sidebar main toc toc" 1fr / minmax(min-content, 1fr) var(--fd-sidebar-col) minmax(0, calc(var(--fd-layout-width,97rem) - var(--fd-sidebar-width) - var(--fd-toc-width))) var(--fd-toc-width) minmax(min-content, 1fr)`;

export default function Layout({ children }: { children: ReactNode }) {
  // Each sidebar pill carries its own row of the badge table, so the copy the
  // browser receives leaves the table out.
  const config = { ...apiSurfaceConfig(), badgeCounts: {} };
  return (
    <SurfaceDocsLayout
      trees={surfaceTrees()}
      config={config}
      nav={{
        title: (
          <>
            <img src={withBase("/logo-ver-classic.svg")} alt="" width={24} height={24} />
            {SITE_NAME}
          </>
        ),
      }}
      tabMode="top"
      linkTabs={linkTabs()}
      containerProps={{ style: { gridTemplate: GRID_TABS_FIRST } }}
      links={[
        { text: "Changelog", url: "/changelog" },
        {
          type: "icon",
          text: "GitHub",
          label: "GitHub",
          url: REPO_URL,
          external: true,
          icon: (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the Devicon asset from the repo's own dependency
            <span className="contents" dangerouslySetInnerHTML={{ __html: GITHUB_ICON }} />
          ),
        },
        {
          type: "icon",
          text: "npm",
          label: "npm package",
          url: NPM_URL,
          external: true,
          icon: (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the Devicon asset from the repo's own dependency
            <span className="contents" dangerouslySetInnerHTML={{ __html: NPM_ICON }} />
          ),
        },
      ]}
      sidebar={{
        banner: (
          <>
            <SectionDropdown />
            <RangePicker versions={apiVersions(TYPES_DIR)} config={config} />
          </>
        ),
        components: { Folder: MountedSidebarFolder },
      }}
    >
      {children}
      <SidebarTooltips />
    </SurfaceDocsLayout>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
