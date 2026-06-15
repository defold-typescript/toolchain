import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "defold-editor.md",
    slug: "defold-editor",
    route: "/defold-editor",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "defold-editor",
    headings: pageHeadings(html),
  });
});
