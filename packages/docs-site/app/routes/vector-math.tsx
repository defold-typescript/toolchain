import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "vector-math.md",
    slug: "vector-math",
    route: "/vector-math",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "vector-math", headings: pageHeadings(html) },
  );
});
