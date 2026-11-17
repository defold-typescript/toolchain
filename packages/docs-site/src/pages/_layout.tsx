import { LIBRARY_DOCS_URL, withBase } from "@defold-typescript/docs-render/base";
import { deviconMono } from "@defold-typescript/docs-render/devicon";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { ReactNode } from "react";
import { TYPES_DIR } from "../../app/lib/api-content";
import { RangePicker } from "../components/range-picker";
import { SidebarTooltips } from "../components/sidebar-tooltips";
import { SurfaceDocsLayout } from "../components/surface-docs-layout";
import { apiSurfaceConfig, NPM_URL, REPO_URL, SITE_NAME, surfaceTrees } from "../lib/site";

// GitHub is a plain icon link rather than `githubUrl`, which Fumadocs would place
// after every other link.
const GITHUB_ICON = deviconMono("github/github-original", "");
const NPM_ICON = deviconMono("npm/npm-plain", "");

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
      links={[
        { text: "Changelog", url: "/changelog" },
        { text: "Libraries", url: LIBRARY_DOCS_URL, external: true },
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
      sidebar={{ banner: <RangePicker versions={apiVersions(TYPES_DIR)} config={config} /> }}
    >
      {children}
      <SidebarTooltips />
    </SurfaceDocsLayout>
  );
}

export async function getConfig() {
  return { render: "static" } as const;
}
