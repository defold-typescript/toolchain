import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { SITE_NAME, toc } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One page whose body the shared renderer already turned into HTML (a library
 * API page or a listing). The HTML carries its own `h1`, so the page
 * adds no title block; the table of contents comes from the same headings.
 */
export function HtmlPage({ title, html }: { title: string; html: string }) {
  return (
    <DocsPage toc={toc(html)}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        <article
          data-page-body=""
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML comes from the repo's own renderer
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <PageScripts key={title} />
      </DocsBody>
    </DocsPage>
  );
}
