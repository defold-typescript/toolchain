import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "debugging.md",
    slug: "debugging",
    route: "/debugging",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "debugging", headings: pageHeadings(html) },
  );
});
