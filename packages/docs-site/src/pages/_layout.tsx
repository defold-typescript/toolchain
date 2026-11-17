import { LIBRARY_DOCS_URL } from "@defold-typescript/docs-render/base";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { ReactNode } from "react";
import { TYPES_DIR } from "../../app/lib/api-content";
import { RangePicker } from "../components/range-picker";
import { SidebarTooltips } from "../components/sidebar-tooltips";
import { SurfaceDocsLayout } from "../components/surface-docs-layout";
import { apiSurfaceConfig, REPO_URL, SITE_NAME, surfaceTrees } from "../lib/site";

export default function Layout({ children }: { children: ReactNode }) {
  // Each sidebar pill carries its own row of the badge table, so the copy the
  // browser receives leaves the table out.
  const config = { ...apiSurfaceConfig(), badgeCounts: {} };
  return (
    <SurfaceDocsLayout
      trees={surfaceTrees()}
      config={config}
      nav={{ title: SITE_NAME }}
      githubUrl={REPO_URL}
      links={[{ text: "Libraries", url: LIBRARY_DOCS_URL, external: true }]}
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
