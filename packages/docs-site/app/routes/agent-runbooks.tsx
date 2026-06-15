import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "agent-runbooks.md",
    slug: "agent-runbooks",
    route: "/agent-runbooks",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "agent-runbooks", headings: pageHeadings(html) },
  );
});
