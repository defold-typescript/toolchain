import { type ApiPageOptions, renderApiPage } from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { hastHeadings } from "@defold-typescript/docs-render/headings";

// The heading ids a page renders through the same pipeline the `/api` routes use,
// so an anchor test checks what a browser can scroll to.
export async function renderedHeadingIds(
  page: ApiPage,
  opts: ApiPageOptions,
): Promise<Set<string>> {
  const { hast } = await renderApiPage(page, (text) => [{ type: "text", value: text }], opts);
  return new Set(hastHeadings(hast).map((heading) => heading.id));
}
