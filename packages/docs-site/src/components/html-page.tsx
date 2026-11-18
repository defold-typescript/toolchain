import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { TYPES_DIR } from "../../app/lib/api-content";
import { apiSurfaceConfig, SITE_NAME, toc } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One page whose body the shared renderer already turned into HTML (an API
 * namespace). The HTML carries its own `h1`, so the page adds no title
 * block; the table of contents comes from the same headings.
 */
export function HtmlPage({ title, html }: { title: string; html: string }) {
  return (
    <DocsPage toc={toc(html)}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        {/* The pre-paint script hides the symbols the stored window excludes
            before React hydrates this HTML. */}
        <article
          data-page-body=""
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML comes from the repo's own renderer
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <PageScripts
          key={title}
          versionIds={apiVersions(TYPES_DIR).map((version) => version.id)}
          surface={{ ...apiSurfaceConfig(), badgeCounts: {} }}
        />
      </DocsBody>
    </DocsPage>
  );
}
