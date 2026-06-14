import { createRoute } from "honox/factory";
import { guidePages, renderGuide } from "../lib/content";

export default createRoute(async (c) => {
  const index = guidePages().find((page) => page.isIndex);
  if (!index) return c.notFound();
  const html = await renderGuide(index);
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "Overview",
  });
});
