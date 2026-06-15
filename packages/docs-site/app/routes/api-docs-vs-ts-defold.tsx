import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "api-docs-vs-ts-defold.md",
    slug: "api-docs-vs-ts-defold",
    route: "/api-docs-vs-ts-defold",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "api-docs-vs-ts-defold", headings: pageHeadings(html) },
  );
});
