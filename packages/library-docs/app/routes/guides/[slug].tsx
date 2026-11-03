import { pageHeadings } from "@defold-typescript/docs-render/headings";
import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { guides, renderGuideMarkdown } from "../../lib/guides";

export default createRoute(
  ssgParams(() => guides().map(({ slug }) => ({ slug }))),
  async (c) => {
    const guide = guides().find(({ slug }) => slug === c.req.param("slug"));
    if (!guide) return c.notFound();
    const html = await renderGuideMarkdown(guide.markdown);
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: guide.title,
      headings: pageHeadings(html),
    });
  },
);
