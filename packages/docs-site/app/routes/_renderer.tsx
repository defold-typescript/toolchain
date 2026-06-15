import { jsxRenderer } from "hono/jsx-renderer";
import { Script } from "honox/server";
import Search from "../islands/search";
import { guidePages } from "../lib/content";

declare module "hono" {
  // Must stay an interface: module augmentation merges into hono's ContextRenderer.
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: interface merging requires the interface form
    (content: string | Promise<string>, props?: { title?: string }): Response | Promise<Response>;
  }
}

const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 -apple-system, system-ui, sans-serif; color: #24292e; display: flex; }
.sidebar { width: 260px; min-height: 100vh; border-right: 1px solid #e1e4e8; padding: 1.5rem 1rem; position: sticky; top: 0; align-self: flex-start; }
.sidebar .brand { font-weight: 700; display: block; margin-bottom: 1rem; color: #24292e; text-decoration: none; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 0.15rem 0; }
.sidebar a { color: #0366d6; text-decoration: none; display: block; padding: 0.2rem 0; }
.sidebar a:hover { text-decoration: underline; }
.content { flex: 1; max-width: 820px; padding: 2rem 3rem; overflow-x: auto; }
.prose pre.shiki { padding: 1rem; border-radius: 6px; overflow-x: auto; }
.prose code { font-family: ui-monospace, monospace; }
.prose h1 { border-bottom: 1px solid #e1e4e8; padding-bottom: 0.3rem; }
.search { position: relative; margin-bottom: 1rem; }
.search-input { width: 100%; padding: 0.4rem 0.6rem; border: 1px solid #e1e4e8; border-radius: 6px; font: inherit; }
.search-results { position: absolute; z-index: 1; left: 0; right: 0; margin: 0.25rem 0 0; padding: 0.25rem 0; list-style: none; background: #fff; border: 1px solid #e1e4e8; border-radius: 6px; box-shadow: 0 4px 12px rgba(27, 31, 35, 0.1); }
.search-results li { margin: 0; }
.search-results a { display: block; padding: 0.3rem 0.6rem; color: #0366d6; text-decoration: none; }
.search-results a:hover { background: #f6f8fa; }
.sidebar .nav-divider { margin: 0.75rem 0 0.25rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6a737d; }
.api-index { list-style: none; padding: 0; }
.api-index li { margin: 0.35rem 0; }
.api-index a { font-family: ui-monospace, monospace; }
.api-brief { color: #6a737d; }
`;

function humanize(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default jsxRenderer(({ children, title }) => {
  const pages = guidePages();
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} — defold-typescript` : "defold-typescript docs"}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <Script src="/app/client.ts" async />
      </head>
      <body>
        <nav class="sidebar">
          <a class="brand" href="/">
            defold-typescript
          </a>
          <Search />
          <ul>
            {pages.map((page) => (
              <li>
                <a href={page.route}>{page.isIndex ? "Overview" : humanize(page.slug)}</a>
              </li>
            ))}
          </ul>
          <p class="nav-divider">Reference</p>
          <ul>
            <li>
              <a href="/api">API</a>
            </li>
          </ul>
        </nav>
        <main class="content">{children}</main>
      </body>
    </html>
  );
});
