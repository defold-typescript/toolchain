import { withBase } from "@defold-typescript/docs-render/base";
import { faviconLinks } from "@defold-typescript/docs-render/favicon";
import { PRELOAD_FONT_FILES } from "@defold-typescript/docs-render/generated/fonts";
import type { Heading } from "@defold-typescript/docs-render/headings";
import { THEME_TOKENS } from "@defold-typescript/docs-render/theme-tokens";
import githubIconRaw from "@phosphor-icons/core/duotone/github-logo-duotone.svg?raw";
import { jsxRenderer } from "hono/jsx-renderer";
import { Script } from "honox/server";
import { SidebarItems } from "../components/sidebar";
import { ToolchainLink } from "../components/toolchain-link";
import CodeCopy from "../islands/code-copy";
import Search from "../islands/search";
import SidebarToggle from "../islands/sidebar-toggle";
import SidebarTooltip from "../islands/sidebar-tooltip";
import SymbolTooltip from "../islands/symbol-tooltip";
import ThemeToggle from "../islands/theme-toggle";
import Toc from "../islands/toc";
import UiTooltip from "../islands/ui-tooltip";
import { apiPages, libraryNavGroups } from "../lib/api-content";
import { guides } from "../lib/guides";
import { buildNav, type NavCategory } from "../lib/nav";
import { buildPager, type Pager as PagerData, type PagerLink } from "../lib/pager";

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
 * The script that scrolls the sidebar's active entry into view on load. The
 * site is statically generated with no client router, so every navigation is a
 * full load that starts the sidebar at scrollTop 0; in long categories the
 * active entry sits below the fold and stays hidden. The script runs after the
 * sidebar DOM is parsed and, only when the active entry is not already fully
 * visible, jumps the container (never the window) instantly to center it.
 * Already-visible entries are a no-op — the scroll position is left untouched.
 *
 * The jump is always instant (no smooth animation), so it positions before
 * first paint on every load with no flash or motion. There is no click
 * tracking or `prefers-reduced-motion` branch: instant is the only path.
 *
 * The arithmetic mirrors `sidebarScrollTop` in `app/lib/sidebar-scroll.ts` —
 * keep the two in sync; the helper's unit tests are the source of truth. An
 * inline script cannot import a module, hence the duplication.
 */
const SIDEBAR_SCROLL_INIT = `(function(){try{var c=document.querySelector('[data-sidebar-scroll]');if(!c)return;var a=c.querySelector('[aria-current="page"]');if(!a)return;var cr=c.getBoundingClientRect(),ar=a.getBoundingClientRect();var tt=ar.top-cr.top+c.scrollTop,th=ar.height,vt=c.scrollTop,vh=c.clientHeight,ms=c.scrollHeight-c.clientHeight;if(tt>=vt&&tt+th<=vt+vh)return;c.scrollTop=Math.max(0,Math.min(tt-vh/2+th/2,ms));}catch(e){}})();`;

/**
 * The script that publishes the real header height as the `--topbar-height`
 * custom property, so anchored-heading `scroll-margin-top` and the sticky
 * sidebar/TOC offsets track the bar instead of a baked 56px constant. Below
 * `lg` the topbar wraps onto a second row and grows taller; the fixed offsets
 * would let headings land behind it.
 *
 * It runs directly after the header closes, once the head's render-blocking
 * stylesheets have loaded, so the first measurement is the painted height. It
 * also runs before any heading is parsed, so a cold `/page#heading` load never
 * scrolls with the `3.5rem` fallback. A `ResizeObserver` keeps the value current
 * across font swap, viewport resize, and `lg` breakpoint crossings. The
 * observer lives for the page's lifetime; there is nothing to disconnect.
 */
const TOPBAR_HEIGHT_INIT = `(function(){try{var h=document.querySelector('[data-topbar]');if(!h)return;var set=function(){document.documentElement.style.setProperty('--topbar-height',h.offsetHeight+'px');};set();if(typeof ResizeObserver==='function'){new ResizeObserver(set).observe(h);}}catch(_){}})();`;

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
function clientStyles(): { stylesheets: string[]; fonts: string[]; script?: string } {
  for (const mod of Object.values(CLIENT_MANIFEST)) {
    const manifest = mod.default;
    if (!manifest) continue;
    const entry = manifest["app/client.ts"];
    const stylesheets = (entry?.css ?? []).map((file) => withBase(file));
    const fonts = Object.entries(manifest)
      .filter(([key]) => PRELOAD_FONT_FILES.some((file) => key.endsWith(file)))
      .map(([, e]) => withBase(e.file));
    // honox's <Script> resolves the hashed entry but does not apply the deploy
    // base (the server bundle never sees Vite's base), so under a subpath the
    // client script would 404. Emit a base-aware tag from the manifest instead.
    const result: { stylesheets: string[]; fonts: string[]; script?: string } = {
      stylesheets,
      fonts,
    };
    if (entry) result.script = withBase(entry.file);
    return result;
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
  const nav = buildNav(libraryNavGroups(apiPages()), guides());
  const activeCategory = nav[0];
  const tocHeadings = headings ?? [];
  const showToc = tocHeadings.length > 0;
  const styles = clientStyles();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>
          {title ? `${title} — defold-typescript libraries` : "defold-typescript libraries"}
        </title>
        {faviconLinks().map((l) => (
          <link
            key={l.rel + l.href}
            rel={l.rel}
            type={l.type}
            sizes={l.sizes}
            href={withBase(l.href)}
          />
        ))}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <style dangerouslySetInnerHTML={{ __html: THEME_TOKENS }} />
        {styles.fonts.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossorigin="" />
        ))}
        <link rel="stylesheet" href={withBase("/critical.css")} />
        {/* Dev has no built bundle: link the source stylesheet so vite serves the
            full Tailwind CSS render-blocking, instead of letting the async client
            script inject it after first paint (which snapped the unstyled layout
            into place — a full-viewport shift on every navigation). */}
        {import.meta.env.DEV ? <link rel="stylesheet" href={withBase("/app/styles.css")} /> : null}
        {styles.stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {import.meta.env.DEV ? (
          <Script src="/app/client.ts" async />
        ) : styles.script ? (
          <script type="module" async src={styles.script} />
        ) : null}
      </head>
      <body class="min-h-screen bg-bg text-text antialiased">
        <header
          data-topbar
          class="topbar-critical sticky top-0 z-30 flex items-center gap-6 border-b border-border bg-bg/85 px-6 backdrop-blur"
        >
          <div class="mx-auto flex w-full flex-wrap items-center gap-x-2 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:gap-x-6 lg:gap-y-0 lg:py-0">
            <SidebarToggle />
            {/* Wordmark uses font-medium (Barlow 500), which is preloaded, not
                font-semibold (600, not preloaded): a non-preloaded weight here
                swaps a beat after first paint and shifts the flex-1 nav to its
                right on every navigation. */}
            <a
              class="flex items-center gap-2 text-[15px] font-medium tracking-tight"
              href={withBase("/")}
              aria-label="defold-typescript libraries"
            >
              <img
                src={withBase("/logo-ver-classic.svg")}
                alt=""
                width="24"
                height="24"
                class="logo-mark h-6 w-6"
              />
              {/* Title hides below sm so very narrow viewports show only the mark;
                  the aria-label above keeps the link named for assistive tech. */}
              <span data-testid="logo-title" class="hidden sm:inline">
                defold-typescript libraries
              </span>
            </a>
            <div class="ml-auto flex items-center gap-2">
              <Search placeholder="Search libraries…" label="Search library documentation" />
              <ToolchainLink />
              <GithubLink />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <script dangerouslySetInnerHTML={{ __html: TOPBAR_HEIGHT_INIT }} />

        <div class="mx-auto flex w-full gap-10 px-6">
          <aside id="sidebar" data-testid="sidebar" class="sidebar-drawer w-60 shrink-0">
            <div
              data-sidebar-scroll
              class="sticky top-[var(--topbar-height,3.5rem)] max-h-[calc(100vh-var(--topbar-height,3.5rem)-1rem)] overflow-y-auto py-8 pr-2"
            >
              <SidebarNav category={activeCategory} path={path} />
            </div>
            <SidebarTooltip />
          </aside>
          <div data-testid="sidebar-backdrop" class="sidebar-backdrop" aria-hidden="true" />

          <main class="min-w-0 flex-1">
            <div class="flex gap-10 py-10">
              <article class={`min-w-0 flex-1 ${contentClass ?? ""}`}>
                {showToc ? <InlineToc headings={tocHeadings} /> : null}
                {children}
                <Pager pager={buildPager(nav, path)} />
              </article>
              {showToc ? (
                <aside data-testid="toc-rail" class="hidden xl:block">
                  <div class="sticky top-[calc(var(--topbar-height,3.5rem)+1.5rem)] max-h-[calc(100vh-var(--topbar-height,3.5rem)-2.5rem)] w-56 overflow-y-auto overflow-x-hidden">
                    <Toc headings={tocHeadings} />
                  </div>
                </aside>
              ) : null}
            </div>
          </main>
        </div>
        <UiTooltip />
        <SymbolTooltip />
        <CodeCopy />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCROLL_INIT }} />
      </body>
    </html>
  );
});

const REPO_URL = "https://github.com/defold-typescript/library-data";

function GithubLink() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      title="GitHub repository"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition hover:border-border-strong hover:text-text [&_svg]:size-5"
    >
      <span class="sr-only">GitHub repository</span>
      <span
        aria-hidden="true"
        class="inline-flex"
        dangerouslySetInnerHTML={{ __html: githubIconRaw }}
      />
    </a>
  );
}

/**
 * The narrow-viewport home for the page outline. The sticky right rail is
 * `hidden` below `xl`, so below that width the same `Toc` outline rides inside
 * this collapsible disclosure at the top of the content column (`xl:hidden`, the
 * complement of the rail). It is collapsed by default so it never pushes the
 * prose far down, and reuses the `Toc` island so scroll-spy works when it is
 * open. The `<summary>` carries the "On this page" label, so the embedded
 * outline renders with `showHeading={false}`; it also passes `showTooltip={false}`
 * so truncated entries expose their full text via a native `title` instead of the
 * JS reveal, which sticks on touch (bug-37).
 */
function InlineToc({ headings }: { headings: Heading[] }) {
  return (
    <details
      data-testid="toc-inline"
      class="group mb-8 rounded-lg border border-border bg-surface xl:hidden"
    >
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-text-faint transition hover:text-text [&::-webkit-details-marker]:hidden">
        <span>On this page</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4 transition group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div class="px-2 pb-3">
        <Toc headings={headings} showHeading={false} showTooltip={false} />
      </div>
    </details>
  );
}

function SidebarNav({ category, path }: { category: NavCategory | undefined; path: string }) {
  if (!category) return null;
  return (
    <nav aria-label={`${category.label} navigation`}>
      {category.route ? (
        <a
          href={withBase(category.route)}
          aria-current={path === category.route ? "page" : undefined}
          class={
            "mb-3 block rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition hover:bg-surface hover:text-text " +
            (path === category.route ? "bg-accent-soft text-accent" : "text-text-faint")
          }
        >
          {category.label}
        </a>
      ) : (
        <p class="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
          {category.label}
        </p>
      )}
      <SidebarItems
        links={category.links}
        path={path}
        uppercaseGroupHeaders={category.id !== "libraries"}
      />
    </nav>
  );
}

function PagerCard({ link, side }: { link: PagerLink; side: "prev" | "next" }) {
  const eyebrow = link.crossesTopic ? link.topicLabel : side === "prev" ? "Previous" : "Next";
  const layout = side === "prev" ? "items-start text-left" : "ml-auto items-end text-right";
  const surface = link.crossesTopic
    ? "border-accent bg-accent-soft text-accent"
    : "border-border text-text-muted hover:border-accent hover:text-text";
  return (
    <a
      href={withBase(link.route)}
      class={`flex max-w-[calc(50%-0.5rem)] flex-col gap-1 rounded-lg border px-4 py-3 transition ${layout} ${surface}`}
    >
      <span
        class={`text-[11px] font-semibold uppercase tracking-wider ${
          link.crossesTopic ? "text-accent" : "text-text-faint"
        }`}
      >
        {eyebrow}
      </span>
      <span class="text-sm font-medium" dangerouslySetInnerHTML={{ __html: link.labelHtml }} />
    </a>
  );
}

function Pager({ pager }: { pager: PagerData }) {
  if (!pager.prev && !pager.next) return null;
  return (
    <nav aria-label="Pagination" class="mt-12 flex gap-4 border-t border-border pt-6">
      {pager.prev ? <PagerCard link={pager.prev} side="prev" /> : null}
      {pager.next ? <PagerCard link={pager.next} side="next" /> : null}
    </nav>
  );
}

// (Headings are imported directly from `@defold-typescript/docs-render/headings` by routes.)
