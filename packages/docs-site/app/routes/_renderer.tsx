import { jsxRenderer } from "hono/jsx-renderer";
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
      </head>
      <body>
        <nav class="sidebar">
          <a class="brand" href="/">
            defold-typescript
          </a>
          <ul>
            {pages.map((page) => (
              <li>
                <a href={page.route}>{page.isIndex ? "Overview" : humanize(page.slug)}</a>
              </li>
            ))}
          </ul>
        </nav>
        <main class="content">{children}</main>
      </body>
    </html>
  );
});
