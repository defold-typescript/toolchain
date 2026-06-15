import { jsxRenderer } from "hono/jsx-renderer";
import { Script } from "honox/server";
import Search from "../islands/search";
import ThemeToggle from "../islands/theme-toggle";
import Toc from "../islands/toc";
import { guidePages } from "../lib/content";
import { activeCategoryId, buildNav, type NavCategory, type NavLink } from "../lib/nav";
import type { Heading } from "../lib/headings";

declare module "hono" {
  // Must stay an interface: module augmentation merges into hono's ContextRenderer.
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: interface merging requires the interface form
    (
      content: string | Promise<string>,
      props?: { title?: string; headings?: Heading[]; contentClass?: string },
    ): Response | Promise<Response>;
  }
}

/**
 * The pre-paint script that picks the active theme and applies it before the
 * first style recompute. Runs synchronously in <head> so the page never flashes
 * the wrong theme.
 *
 *   1. Honour the user's explicit choice in localStorage.
 *   2. Fall back to the system preference.
 *   3. Default to light if neither is set.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

/**
 * The design tokens, inlined so they are available before the Tailwind
 * stylesheet (and `public/critical.css`) load. Without this, `var(--color-text)`
 * in critical.css would be undefined at first paint and the body would briefly
 * render with the wrong color. Tailwind v4's `@theme` block in
 * `app/styles.css` redefines the same tokens; that later definition
 * supersedes these because the cascade is per-property and the @theme
 * block is a higher-specificity origin.
 *
 * Keep this list in sync with the `@theme` block in `app/styles.css` and
 * the dark override below it.
 */
const THEME_TOKENS = `
:root {
  --font-sans: "Inter Variable", "Inter Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono Fallback", ui-monospace, SFMono-Regular, Menlo, monospace;
  --color-bg: #ffffff;
  --color-surface: #f7f7f8;
  --color-surface-2: #f0f0f2;
  --color-border: #e6e6e9;
  --color-border-strong: #d0d0d5;
  --color-text: #1c1c1f;
  --color-text-muted: #5b5b62;
  --color-text-faint: #8a8a92;
  --color-accent: #1f6feb;
  --color-accent-soft: rgba(31, 111, 235, 0.08);
  --color-accent-strong: #1858c4;
  --color-code-bg: #f6f6f7;
}
[data-theme="dark"] {
  --color-bg: #0e0e10;
  --color-surface: #161618;
  --color-surface-2: #1d1d20;
  --color-border: #2a2a2e;
  --color-border-strong: #3a3a40;
  --color-text: #ececef;
  --color-text-muted: #a4a4ad;
  --color-text-faint: #6f6f78;
  --color-accent: #79a8ff;
  --color-accent-soft: rgba(121, 168, 255, 0.12);
  --color-accent-strong: #a9c4ff;
  --color-code-bg: #161618;
}
`;

interface ViteManifestEntry {
  file: string;
  css?: string[];
}
type ViteManifest = Record<string, ViteManifestEntry>;

/**
 * The Vite manifest, loaded at build time so the compiled client assets can be
 * resolved to their hashed filenames. The glob matches nothing in dev (no
 * manifest yet), and the PROD guard keeps a stale manifest from a previous
 * build from leaking hashed links into the dev server.
 */
const CLIENT_MANIFEST = import.meta.env.PROD
  ? import.meta.glob<{ default: ViteManifest }>("/dist/.vite/manifest.json", { eager: true })
  : {};

/**
 * The compiled stylesheet and primary font files for `app/client.ts`.
 *
 * The Tailwind bundle and every `@font-face` rule are imported through
 * `app/client.ts`, so without an explicit `<link>` they only take effect once
 * the async client script executes. Each navigation would then paint first with
 * `critical.css`, then reflow (and swap fonts) when the bundle arrives — the
 * layout shift / blink. Emitting the bundle as a render-blocking `<link>` and
 * preloading the Latin font subsets makes the full stylesheet and font faces
 * present at first paint, so navigation no longer flashes.
 */
function clientStyles(): { stylesheets: string[]; fonts: string[] } {
  for (const mod of Object.values(CLIENT_MANIFEST)) {
    const manifest = mod.default;
    if (!manifest) continue;
    const stylesheets = (manifest["app/client.ts"]?.css ?? []).map((file) => `/${file}`);
    const fonts = Object.entries(manifest)
      .filter(([key]) => /(?:inter|jetbrains-mono)-latin-wght-normal\.woff2$/.test(key))
      .map(([, entry]) => `/${entry.file}`);
    return { stylesheets, fonts };
  }
  return { stylesheets: [], fonts: [] };
}

interface RendererProps {
  children?: unknown;
  title?: string;
  /** Headings extracted from the rendered page; feeds the right-side TOC. */
  headings?: Heading[];
  /** Class on the inner content wrapper; lets routes opt into wider layouts. */
  contentClass?: string;
}

export default jsxRenderer(({ children, title, headings, contentClass }: RendererProps, c) => {
  const path = c.req.path;
  const nav = buildNav(guidePages());
  const activeId = activeCategoryId(path, nav) ?? nav[0]?.id;
  const activeCategory = nav.find((category) => category.id === activeId) ?? nav[0];
  const tocHeadings = headings ?? [];
  const showToc = tocHeadings.length > 0;
  const styles = clientStyles();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} — defold-typescript` : "defold-typescript docs"}</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <style dangerouslySetInnerHTML={{ __html: THEME_TOKENS }} />
        {styles.fonts.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossorigin="" />
        ))}
        <link rel="stylesheet" href="/critical.css" />
        {/* Dev has no built bundle: link the source stylesheet so vite serves the
            full Tailwind CSS render-blocking, instead of letting the async client
            script inject it after first paint (which snapped the unstyled layout
            into place — a full-viewport shift on every navigation). */}
        {import.meta.env.DEV ? <link rel="stylesheet" href="/app/styles.css" /> : null}
        {styles.stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        <Script src="/app/client.ts" async />
      </head>
      <body class="min-h-screen bg-bg text-text antialiased">
        <header class="topbar-critical sticky top-0 z-30 flex h-14 items-center gap-6 border-b border-border bg-bg/85 px-6 backdrop-blur">
          <div class="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-6">
            <a class="flex items-center gap-2 text-[15px] font-semibold tracking-tight" href="/">
              <img src="/logo-ver-classic.svg" alt="" width="24" height="24" class="logo-mark h-6 w-6" />
              <span>defold-typescript</span>
            </a>
            <nav class="flex flex-1 items-center gap-1 text-sm">
              {nav.map((category) => (
                <CategoryLink key={category.id} category={category} active={category.id === activeId} />
              ))}
            </nav>
            <div class="flex items-center gap-2">
              <Search />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div class="mx-auto flex w-full max-w-[1400px] gap-10 px-6">
          <aside class="hidden w-60 shrink-0 lg:block">
            <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto py-8 pr-2">
              <SidebarNav category={activeCategory} path={path} />
            </div>
          </aside>

          <main class="min-w-0 flex-1">
            <div class={`flex gap-10 py-10 ${showToc ? "xl:pr-64" : ""}`}>
              <article class={`min-w-0 flex-1 ${contentClass ?? ""}`}>{children}</article>
              {showToc ? (
                <aside class="hidden xl:block">
                  <div class="sticky top-20 w-56">
                    <Toc headings={tocHeadings} />
                  </div>
                </aside>
              ) : null}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
});

function CategoryLink({ category, active }: { category: NavCategory; active: boolean }) {
  const href = category.links[0]?.route ?? "/";
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      class={
        "rounded-md px-3 py-1.5 text-text-muted transition hover:text-text " +
        (active ? "font-semibold text-text" : "")
      }
    >
      {category.label}
    </a>
  );
}

function SidebarNav({ category, path }: { category: NavCategory | undefined; path: string }) {
  if (!category) return null;
  return (
    <nav aria-label={`${category.label} navigation`}>
      <p class="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
        {category.label}
      </p>
      <ul class="space-y-0.5 text-sm">
        {category.links.map((link) => (
          <li key={link.route}>
            <SidebarLink link={link} active={path === link.route} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <a
      href={link.route}
      aria-current={active ? "page" : undefined}
      class={
        "block rounded-md px-2 py-1.5 text-text-muted transition hover:bg-surface hover:text-text " +
        (active ? "bg-accent-soft font-semibold text-accent" : "")
      }
    >
      {link.label}
    </a>
  );
}

// (Headings are imported directly from `app/lib/headings.ts` by routes.)
