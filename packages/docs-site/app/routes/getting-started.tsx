import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "getting-started.md",
    slug: "getting-started",
    route: "/getting-started",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "getting-started",
    headings: pageHeadings(html),
  });
});
