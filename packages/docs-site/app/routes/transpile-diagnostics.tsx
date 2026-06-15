import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "transpile-diagnostics.md",
    slug: "transpile-diagnostics",
    route: "/transpile-diagnostics",
    isIndex: false,
  });
  return c.render(<article class="prose" dangerouslySetInnerHTML={{ __html: html }} />, {
    title: "transpile-diagnostics",
    headings: pageHeadings(html),
  });
});
