import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "script-lifecycle.md",
    slug: "script-lifecycle",
    route: "/script-lifecycle",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "script-lifecycle",
    headings: pageHeadings(html),
  });
});
