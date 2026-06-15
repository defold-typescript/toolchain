import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "extensions.md",
    slug: "extensions",
    route: "/extensions",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "extensions", headings: pageHeadings(html) },
  );
});
