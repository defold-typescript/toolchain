import { ssgParams } from "hono/ssg";
import { createRoute } from "honox/factory";
import { guidePages, renderGuide } from "../lib/content";

export default createRoute(
  ssgParams(() =>
    guidePages()
      .filter((page) => !page.isIndex)
      .map((page) => ({ slug: page.slug })),
  ),
  async (c) => {
    const slug = c.req.param("slug");
    const page = guidePages().find((entry) => !entry.isIndex && entry.slug === slug);
    if (!page) return c.notFound();
    const html = await renderGuide(page);
    return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
      title: page.slug,
    });
  },
);
