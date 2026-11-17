import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { SITE_NAME, toc } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One page whose body the shared renderer already turned into HTML (a guide page
 * or an API namespace). The HTML carries its own `h1`, so the page adds no title
 * block; the table of contents comes from the same headings.
 */
export function HtmlPage({ title, html }: { title: string; html: string }) {
  return (
    <DocsPage toc={toc(html)}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: HTML comes from the repo's own renderer */}
        <article data-page-body="" dangerouslySetInnerHTML={{ __html: html }} />
        <PageScripts key={title} />
      </DocsBody>
    </DocsPage>
  );
}
