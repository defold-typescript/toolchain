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

// The paths `toSSG` requests for one dynamic route: the `ssgParams` list the
// route's middleware records when asked for the pattern itself, substituted into
// it. Nothing renders, so a route with many costly pages is cheap to enumerate;
// whether each path answers 200 is a separate check. Test-only, like the above.
export async function ssgParamPaths(app: Hono, pattern: string): Promise<string[]> {
  const request = new Request(new URL(pattern, "http://localhost"));
  await app.fetch(request);
  const params = (request as Request & { ssgParams?: Record<string, string>[] }).ssgParams ?? [];
  return params
    .map((param) => pattern.replace(/:(\w+)/g, (match, key: string) => param[key] ?? match))
    .sort();
}
