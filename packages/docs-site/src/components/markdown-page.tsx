import type { DocsMarkdown } from "@defold-typescript/docs-render/docs-markdown";
import { MarkdownBody } from "@defold-typescript/docs-render/markdown-body";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { TYPES_DIR } from "../../app/lib/api-content";
import { apiSurfaceConfig, guideOutline, SITE_NAME } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One page the shared Markdown pipeline processed (a guide page). Its body
 * carries its own `h1`, so the page adds no title block. Fumadocs' code block
 * brings its own copy button, so the page scripts add none.
 */
export function MarkdownPage({ title, page }: { title: string; page: DocsMarkdown }) {
  return (
    <DocsPage toc={guideOutline(page)}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        <article data-page-body="">
          <MarkdownBody hast={page.hast} />
        </article>
        <PageScripts
          key={title}
          versionIds={apiVersions(TYPES_DIR).map((version) => version.id)}
          surface={{ ...apiSurfaceConfig(), badgeCounts: {} }}
        />
      </DocsBody>
    </DocsPage>
  );
}
