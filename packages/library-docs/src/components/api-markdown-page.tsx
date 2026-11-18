import type { RenderedPage } from "@defold-typescript/docs-render/docs-markdown";
import { hastHeadings, outlineHeadings } from "@defold-typescript/docs-render/headings";
import { apiBodyComponents, MarkdownBody } from "@defold-typescript/docs-render/markdown-body";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { outline, SITE_NAME } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * A library API page or listing the shared pipeline processed. Its `h1` is the
 * styled library path, written ahead of the body; the outline reads the body's
 * headings, signatures in their colors. Fumadocs' code block brings its own copy
 * button, so the page scripts add none.
 */
export function ApiMarkdownPage({
  title,
  heading,
  page,
}: {
  title: string;
  heading: string;
  page: RenderedPage;
}) {
  return (
    <DocsPage toc={outline(outlineHeadings(hastHeadings(page.hast)))}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        <article data-page-body="">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the path markup the library routes build */}
          <h1 dangerouslySetInnerHTML={{ __html: heading }} />
          <MarkdownBody hast={page.hast} components={apiBodyComponents} />
        </article>
        <PageScripts key={title} copyButtons={false} />
      </DocsBody>
    </DocsPage>
  );
}
