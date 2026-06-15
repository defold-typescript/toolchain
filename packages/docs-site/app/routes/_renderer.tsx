import { jsxRenderer } from "hono/jsx-renderer";
import { Script } from "honox/server";
import Search from "../islands/search";
import ThemeToggle from "../islands/theme-toggle";
import { clientStyleHrefs } from "../lib/assets";
import { guidePages } from "../lib/content";
import { activeCategoryId, buildNav } from "../lib/nav";

declare module "hono" {
  // Must stay an interface: module augmentation merges into hono's ContextRenderer.
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: interface merging requires the interface form
    (content: string | Promise<string>, props?: { title?: string }): Response | Promise<Response>;
  }
}

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f6f8fa;
  --text: #1f2328;
  --muted: #59636e;
  --border: #d1d9e0;
  --accent: #1a56c4;
  --accent-soft: rgba(26, 86, 196, 0.1);
  --shadow: rgba(27, 31, 35, 0.08);
}
[data-theme="dark"] {
  --bg: #0d1117;
  --surface: #161b22;
  --text: #e6edf3;
  --muted: #9198a1;
  --border: #30363d;
  --accent: #589bff;
  --accent-soft: rgba(88, 155, 255, 0.14);
  --shadow: rgba(1, 4, 9, 0.5);
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 "Inter Variable", system-ui, sans-serif; color: var(--text); background: var(--bg); }
.topbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 1.5rem; padding: 0.6rem 1.5rem; border-bottom: 1px solid var(--border); background: var(--bg); }
.topbar .brand { font-weight: 700; color: var(--text); text-decoration: none; white-space: nowrap; }
.topnav { display: flex; gap: 0.25rem; flex: 1; }
.topnav a { color: var(--muted); text-decoration: none; padding: 0.35rem 0.7rem; border-radius: 6px; font-weight: 500; }
.topnav a:hover { color: var(--text); background: var(--surface); }
.topnav a[aria-current="page"] { color: var(--accent); background: var(--accent-soft); }
.topbar-right { display: flex; align-items: center; gap: 0.75rem; }
.theme-toggle { font: inherit; font-size: 0.85rem; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.6rem; cursor: pointer; white-space: nowrap; }
.theme-toggle:hover { border-color: var(--accent); }
.shell { display: flex; }
.sidebar { width: 260px; min-height: calc(100vh - 53px); border-right: 1px solid var(--border); padding: 1.5rem 1rem; position: sticky; top: 53px; align-self: flex-start; }
.sidebar ul { list-style: none; margin: 0; padding: 0; }
.sidebar li { margin: 0.1rem 0; }
.sidebar a { color: var(--muted); text-decoration: none; display: block; padding: 0.3rem 0.6rem; border-radius: 6px; }
.sidebar a:hover { color: var(--text); background: var(--surface); }
.sidebar a[aria-current="page"] { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
.content { flex: 1; max-width: 820px; padding: 2rem 3rem; overflow-x: auto; }
.prose pre.shiki { padding: 1rem; border-radius: 6px; overflow-x: auto; }
.prose code { font-family: "JetBrains Mono Variable", ui-monospace, monospace; }
.prose a { color: var(--accent); }
.prose h1 { border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
.search { position: relative; }
.search-input { width: 14rem; max-width: 40vw; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; font: inherit; background: var(--bg); color: var(--text); }
.search-input:focus { outline: none; border-color: var(--accent); }
.search-results { position: absolute; z-index: 3; left: 0; right: 0; margin: 0.25rem 0 0; padding: 0.25rem 0; list-style: none; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 12px var(--shadow); }
.search-results li { margin: 0; }
.search-results a { display: block; padding: 0.3rem 0.6rem; color: var(--accent); text-decoration: none; }
.search-results a:hover { background: var(--surface); }
.api-index { list-style: none; padding: 0; }
.api-index li { margin: 0.35rem 0; }
.api-index a { font-family: "JetBrains Mono Variable", ui-monospace, monospace; color: var(--accent); }
.api-brief { color: var(--muted); }
`;

const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default jsxRenderer(({ children, title }, c) => {
  const path = c.req.path;
  const nav = buildNav(guidePages());
  const activeId = activeCategoryId(path, nav) ?? nav[0]?.id;
  const activeCategory = nav.find((category) => category.id === activeId) ?? nav[0];
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} — defold-typescript` : "defold-typescript docs"}</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        {clientStyleHrefs().map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        <Script src="/app/client.ts" async />
      </head>
      <body>
        <header class="topbar">
          <a class="brand" href="/">
            defold-typescript
          </a>
          <nav class="topnav">
            {nav.map((category) => (
              <a
                href={category.links[0]?.route ?? "/"}
                aria-current={category.id === activeId ? "page" : undefined}
              >
                {category.label}
              </a>
            ))}
          </nav>
          <div class="topbar-right">
            <Search />
            <ThemeToggle />
          </div>
        </header>
        <div class="shell">
          <nav class="sidebar">
            <ul>
              {activeCategory?.links.map((link) => (
                <li>
                  <a href={link.route} aria-current={link.route === path ? "page" : undefined}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <main class="content">{children}</main>
        </div>
      </body>
    </html>
  );
});
