import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "pinning-defold-version.md",
    slug: "pinning-defold-version",
    route: "/pinning-defold-version",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "pinning-defold-version",
    headings: pageHeadings(html),
  });
});
