import type { Hono } from "hono";
import { fetchRoutesContent } from "hono/ssg";

// The page set `@hono/vite-ssg` writes for `app`: every route `toSSG` enumerates,
// dynamic ones expanded through their `ssgParams`, kept only when the page
// answers 200 as `toSSG`'s default plugin requires. Test-only; keep it out of
// every client and route import graph.
export async function ssgRoutePaths(app: Hono): Promise<string[]> {
  const paths: string[] = [];
  for (const routeInfo of fetchRoutesContent(
    app,
    undefined,
    (res) => (res.status === 200 ? res : false),
    8,
  )) {
    const pages = await routeInfo;
    if (!pages) continue;
    for (const page of pages) {
      const content = await page;
      if (content) paths.push(content.routePath);
    }
  }
  return paths.sort();
}
