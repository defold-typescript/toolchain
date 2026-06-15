import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "add-typescript.md",
    slug: "add-typescript",
    route: "/add-typescript",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "add-typescript",
    headings: pageHeadings(html),
  });
});
