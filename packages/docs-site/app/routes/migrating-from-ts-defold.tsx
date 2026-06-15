import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "migrating-from-ts-defold.md",
    slug: "migrating-from-ts-defold",
    route: "/migrating-from-ts-defold",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "migrating-from-ts-defold",
    headings: pageHeadings(html),
  });
});
