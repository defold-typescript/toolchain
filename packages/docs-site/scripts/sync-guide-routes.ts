/**
 * Generates one static HonoX route file per guide slug, plus a script
 * that re-runs the generator. Static routes sidestep the [slug].tsx
 * dynamic route's interaction with HonoX's SSG walker — every guide
 * page becomes a real file route and gets prerendered to dist/<slug>.html.
 *
 * Run with `bun run scripts/sync-guide-routes.ts` whenever a file is
 * added, renamed, or removed from `docs/guide/`. The script writes one
 * thin route file per slug into `app/routes/` and trims any that no
 * longer have a matching markdown source.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");
const ROUTES_DIR = join(import.meta.dir, "../app/routes");

const TEMPLATE = (slug: string) => `import { createRoute } from "honox/factory";
import { renderGuide } from "../lib/content";
import { pageHeadings } from "../lib/headings";

export default createRoute(async (c) => {
  const html = await renderGuide({
    file: "${slug}.md",
    slug: "${slug}",
    route: "/${slug}",
    isIndex: false,
  });
  return c.render(
    <article class="prose" dangerouslySetInnerHTML={{ __html: html }} />,
    { title: "${slug}", headings: pageHeadings(html) },
  );
});
`;

const slugs = readdirSync(GUIDE_DIR)
  .filter((file) => file.endsWith(".md") && file !== "README.md")
  .map((file) => file.replace(/\.md$/, ""))
  .sort();

const generated: string[] = [];
for (const slug of slugs) {
  const path = join(ROUTES_DIR, `${slug}.tsx`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, TEMPLATE(slug));
  generated.push(path);
}

// Trim any generated route whose slug is no longer in the guide dir.
const existing = readdirSync(ROUTES_DIR).filter(
  (file) => file.endsWith(".tsx") && !file.startsWith("_") && !file.startsWith("index") && file !== "[slug].tsx" && !file.includes("/"),
);
let removed = 0;
for (const file of existing) {
  const slug = file.replace(/\.tsx$/, "");
  if (!slugs.includes(slug)) {
    rmSync(join(ROUTES_DIR, file));
    removed++;
  }
}

console.log(`sync-guide-routes: ${generated.length} generated, ${removed} removed`);
