import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "typescript-gotchas.md",
    slug: "typescript-gotchas",
    route: "/typescript-gotchas",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "typescript-gotchas", headings: pageHeadings(html) },
  );
});
