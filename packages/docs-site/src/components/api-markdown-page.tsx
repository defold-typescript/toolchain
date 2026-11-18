import type { RenderedPage } from "@defold-typescript/docs-render/docs-markdown";
import { hastHeadings, outlineHeadings } from "@defold-typescript/docs-render/headings";
import { apiBodyComponents, MarkdownBody } from "@defold-typescript/docs-render/markdown-body";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { TYPES_DIR } from "../../app/lib/api-content";
import { apiSurfaceConfig, outline, SITE_NAME } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One API namespace page the shared pipeline processed. Its body carries its own
 * `h1`, so the page adds no title block; the outline reads the same headings,
 * signatures in their colors. The pre-paint script hides the symbols the stored
 * window excludes before React hydrates, which `apiBodyComponents` tolerates.
 * Fumadocs' code block brings its own copy button, so the page scripts add none.
 */
export function ApiMarkdownPage({ title, page }: { title: string; page: RenderedPage }) {
  return (
    <DocsPage toc={outline(outlineHeadings(hastHeadings(page.hast)))}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        <article data-page-body="">
          <MarkdownBody hast={page.hast} components={apiBodyComponents} />
        </article>
        <PageScripts
          key={title}
          versionIds={apiVersions(TYPES_DIR).map((version) => version.id)}
          surface={{ ...apiSurfaceConfig(), badgeCounts: {} }}
          copyButtons={false}
        />
      </DocsBody>
    </DocsPage>
  );
}
