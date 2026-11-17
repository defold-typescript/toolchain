import { type DocsMarkdown, pageToc } from "@defold-typescript/docs-render/docs-markdown";
import { MarkdownBody } from "@defold-typescript/docs-render/markdown-body";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import { SITE_NAME } from "../lib/site";
import { PageScripts } from "./page-scripts";

/**
 * One page the shared Markdown pipeline processed (a guide). Its body carries its
 * own `h1`, so the page adds no title block. Fumadocs' code block brings its own
 * copy button, so the page scripts add none.
 */
export function MarkdownPage({ title, page }: { title: string; page: DocsMarkdown }) {
  return (
    <DocsPage toc={pageToc(page.toc)}>
      <title>{`${title} | ${SITE_NAME}`}</title>
      <DocsBody>
        <article data-page-body="">
          <MarkdownBody hast={page.hast} />
        </article>
        <PageScripts key={title} copyButtons={false} />
      </DocsBody>
    </DocsPage>
  );
}
