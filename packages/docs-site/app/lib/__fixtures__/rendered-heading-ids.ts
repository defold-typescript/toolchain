import { apiPageMarkdown } from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { allPageHeadings } from "@defold-typescript/docs-render/headings";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";

// The heading ids a page renders through the same markdown and highlight path the
// `/api` routes use, so an anchor test checks what a browser can scroll to.
export async function renderedHeadingIds(
  page: ApiPage,
  opts: Parameters<typeof apiPageMarkdown>[2],
): Promise<Set<string>> {
  const html = await renderMarkdown(
    apiPageMarkdown(page, (text) => text, opts),
    {
      highlightSignatureHeadings: true,
    },
  );
  return new Set(allPageHeadings(html).map((heading) => heading.id));
}
