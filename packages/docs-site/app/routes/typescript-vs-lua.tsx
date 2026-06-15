import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "typescript-vs-lua.md",
    slug: "typescript-vs-lua",
    route: "/typescript-vs-lua",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "typescript-vs-lua", headings: pageHeadings(html) },
  );
});
