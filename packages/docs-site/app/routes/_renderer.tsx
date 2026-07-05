import githubIconRaw from "@phosphor-icons/core/duotone/github-logo-duotone.svg?raw";
import { jsxRenderer } from "hono/jsx-renderer";
import { Script } from "honox/server";
import CodeCopy from "../islands/code-copy";
import Search from "../islands/search";
import SidebarToggle from "../islands/sidebar-toggle";
import SidebarTooltip from "../islands/sidebar-tooltip";
import SymbolTooltip from "../islands/symbol-tooltip";
import ThemeToggle from "../islands/theme-toggle";
import Toc from "../islands/toc";
import { apiPages, apiPagesForVersion, apiVersions, libraryDirs } from "../lib/api-content";
import { withBase } from "../lib/base";
import { guidePages } from "../lib/content";
import { faviconLinks } from "../lib/favicon";
import type { Heading } from "../lib/headings";
import { activeCategoryId, buildNav, type NavCategory, type NavLink } from "../lib/nav";
import { buildPager, type Pager as PagerData, type PagerLink } from "../lib/pager";
import { buildVersionSwitcher, type VersionSwitcherEntry } from "../lib/version-switch";

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
 * It runs at the end of `<body>` — the header is already parsed and the
 * critical + render-blocking Tailwind CSS have settled, so the first
 * measurement is the painted height. A `ResizeObserver` keeps the value current
 * across font swap, viewport resize, and `lg` breakpoint crossings. The
 * observer lives for the page's lifetime; there is nothing to disconnect.
 */
const TOPBAR_HEIGHT_INIT = `(function(){try{var h=document.querySelector('[data-topbar]');if(!h)return;var set=function(){document.documentElement.style.setProperty('--topbar-height',h.offsetHeight+'px');};set();if(typeof ResizeObserver==='function'){new ResizeObserver(set).observe(h);}}catch(_){}})();`;

/**
 * The script that centers the active top-level topic in the horizontally
 * scrollable mobile topbar and marks whether more topics are available off each
 * side. Desktop keeps the non-scrolling nav untouched; below `lg`, every page
 * load starts with the current topic visible instead of hidden past the edge.
 */
const TOPIC_SCROLL_INIT = `(function(){try{var c=document.querySelector('[data-topic-scroll]');if(!c)return;var f=document.querySelector('[data-topic-scroll-frame]')||c.parentElement;var a=c.querySelector('[aria-current="page"]');var isNarrow=function(){return window.matchMedia?window.matchMedia('(max-width: 1023.98px)').matches:c.scrollWidth>c.clientWidth;};var max=function(){return Math.max(0,c.scrollWidth-c.clientWidth);};var update=function(){if(!f)return;var m=max();f.toggleAttribute('data-scroll-left',c.scrollLeft>1);f.toggleAttribute('data-scroll-right',c.scrollLeft<m-1);};var center=function(){if(!a||!isNarrow())return;var cr=c.getBoundingClientRect(),ar=a.getBoundingClientRect(),left=ar.left-cr.left+c.scrollLeft;c.scrollLeft=Math.max(0,Math.min(left-c.clientWidth/2+ar.width/2,max()));};center();update();c.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',function(){center();update();},{passive:true});if(typeof ResizeObserver==='function'){new ResizeObserver(function(){center();update();}).observe(c);}}catch(_){}})();`;

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
  --font-sans: "Barlow", "Barlow Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-heading: "Ubuntu", "Ubuntu Fallback", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Spline Sans Mono Variable", "Spline Sans Mono Fallback", ui-monospace, SFMono-Regular, Menlo, monospace;
  /* Prose type scale — single source of truth for both critical.css and
   * styles.css. Defined here (not @theme) because it must be present before
   * either stylesheet paints, and it backs no Tailwind utility. */
  --prose-text-size: 17px;
  --prose-table-size: 17px;
  --prose-h1-size: 1.9rem;
  --prose-h2-size: 1.4rem;
  --prose-h3-size: 1.1rem;
  --prose-h4-size: 0.95rem;
  --prose-code-size: 0.875em;
  --prose-pre-size: 14px;
  --prose-code-title-size: 12px;
  /* Navigation type scale. Top menu is its own knob; the left sidebar and
   * right "on this page" rail share one. */
  --nav-top-size: 0.9rem;
  --nav-side-size: 0.9rem;
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
  --color-text: #c0c0c4;
  --color-text-muted: #a4a4ad;
  --color-text-faint: #4c4c56;
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
function clientStyles(): { stylesheets: string[]; fonts: string[]; script?: string } {
  for (const mod of Object.values(CLIENT_MANIFEST)) {
    const manifest = mod.default;
    if (!manifest) continue;
    const entry = manifest["app/client.ts"];
    const stylesheets = (entry?.css ?? []).map((file) => withBase(file));
    const fonts = Object.entries(manifest)
      .filter(([key]) =>
        /(?:spline-sans-mono-latin-wght-normal|barlow-latin-400-normal|ubuntu-latin-700-normal)\.woff2$/.test(
          key,
        ),
      )
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
  const allApiPages = apiPages();
  const toNamespace = (p: (typeof allApiPages)[number]) => ({ label: p.namespace, route: p.route });

  // Group vendored library pages by their upstream `dir` for the Libraries
  // subgroup: modules of a multi-module library nest under one header, a
  // single-module library becomes a leaf. Libraries and their modules sort
  // alphabetically for stable nav output.
  const moduleDir = libraryDirs();
  const byDir = new Map<string, { label: string; route: string }[]>();
  for (const page of allApiPages.filter((p) => p.category === "library")) {
    const dir = moduleDir.get(page.namespace) ?? page.namespace;
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(toNamespace(page));
    else byDir.set(dir, [toNamespace(page)]);
  }
  const libraries = [...byDir.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, modules]) => ({
      dir,
      label: dir,
      modules: modules.sort((a, b) => a.label.localeCompare(b.label)),
    }));

  const nav = buildNav(guidePages(), {
    globals: allApiPages.filter((p) => p.namespace === "globals").map(toNamespace),
    globalTypes: allApiPages.filter((p) => p.category === "global-type").map(toNamespace),
    luaStdlib: allApiPages.filter((p) => p.category === "lua-stdlib").map(toNamespace),
    engine: allApiPages
      .filter((p) => p.category === "engine" && p.namespace !== "globals")
      .map(toNamespace),
    libraries,
  });
  const activeId = activeCategoryId(path, nav) ?? nav[0]?.id;
  const activeCategory = nav.find((category) => category.id === activeId) ?? nav[0];
  const versions = apiVersions();
  const versionIds = versions.filter((version) => !version.isDefault).map((version) => version.id);
  const namespacesByVersion = Object.fromEntries(
    versions.map((version) => [
      version.id,
      (version.isDefault ? allApiPages : apiPagesForVersion(version.id)).map(
        (page) => page.namespace,
      ),
    ]),
  );
  const versionSwitcher =
    versions.length > 1 ? buildVersionSwitcher({ versions, namespacesByVersion, route: path }) : [];
  const currentVersion = versionSwitcher.find((entry) => entry.isCurrent) ?? versionSwitcher[0];
  const tocHeadings = headings ?? [];
  const showToc = tocHeadings.length > 0;
  const styles = clientStyles();

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} — defold-typescript` : "defold-typescript docs"}</title>
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
          <div class="mx-auto flex w-full flex-wrap items-center gap-x-6 gap-y-2 py-2 lg:h-14 lg:flex-nowrap lg:gap-y-0 lg:py-0">
            <SidebarToggle />
            <a
              class="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
              href={withBase("/")}
              aria-label="defold-typescript"
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
                defold-typescript
              </span>
            </a>
            <div
              data-topic-scroll-frame
              class="topic-scroll-frame order-last w-full min-w-0 basis-full lg:order-none lg:w-auto lg:flex-1 lg:basis-auto"
            >
              <nav
                data-topic-scroll
                class="flex w-full items-center gap-1 overflow-x-auto overflow-y-hidden text-[length:var(--nav-top-size)] leading-5 lg:overflow-visible"
              >
                {nav.map((category) => (
                  <CategoryLink
                    key={category.id}
                    category={category}
                    active={category.id === activeId}
                  />
                ))}
              </nav>
            </div>
            <div class="ml-auto flex items-center gap-2 lg:ml-0">
              {currentVersion ? (
                <VersionSelector entries={versionSwitcher} currentId={currentVersion.id} />
              ) : null}
              <Search versionIds={versionIds} />
              <GithubLink />
              <ThemeToggle />
            </div>
          </div>
        </header>

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
        <SymbolTooltip />
        <CodeCopy />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCROLL_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: TOPBAR_HEIGHT_INIT }} />
        <script dangerouslySetInnerHTML={{ __html: TOPIC_SCROLL_INIT }} />
      </body>
    </html>
  );
});

const REPO_URL = "https://github.com/defold-typescript/toolchain";

function VersionSelector({
  entries,
  currentId,
}: {
  entries: readonly VersionSwitcherEntry[];
  currentId: string;
}) {
  return (
    <details class="group relative">
      <summary class="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-muted transition hover:border-border-strong hover:text-text [&::-webkit-details-marker]:hidden">
        <span>{currentId}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4 text-text-faint transition group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div class="absolute right-0 z-40 mt-2 min-w-40 rounded-lg border border-border bg-bg p-1 text-sm shadow-lg">
        {entries.map((entry) => (
          <a
            key={entry.id}
            href={withBase(entry.route)}
            aria-current={entry.isCurrent ? "page" : undefined}
            class={
              "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-text-muted transition hover:bg-surface hover:text-text " +
              (entry.isCurrent ? "bg-accent-soft text-accent" : "")
            }
          >
            <span>{entry.id}</span>
            {entry.isCurrent ? (
              <span aria-hidden="true" class="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
            ) : null}
          </a>
        ))}
      </div>
    </details>
  );
}

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

function CategoryLink({ category, active }: { category: NavCategory; active: boolean }) {
  const href = category.links[0]?.route ?? category.links[0]?.children?.[0]?.route ?? "/";
  return (
    <a
      href={withBase(href)}
      aria-current={active ? "page" : undefined}
      class={
        "-mb-px inline-flex h-14 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-text-muted transition hover:text-text " +
        (active ? "border-accent text-text" : "border-transparent")
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
      <ul class="space-y-0.5 text-[length:var(--nav-side-size)] leading-5">
        {category.links.map((link) => (
          <li key={link.route ?? link.label}>
            {link.route ? (
              <SidebarLink link={link} active={path === link.route} />
            ) : (
              <p class="mt-3 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                {link.label}
              </p>
            )}
            {link.children && link.children.length > 0 ? (
              <ul class="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-2">
                {link.children.map((child) => (
                  <li key={child.route}>
                    <SidebarLink link={child} active={path === child.route} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  if (!link.route) return null;
  return (
    <a
      href={withBase(link.route)}
      aria-current={active ? "page" : undefined}
      class={
        "block truncate rounded-md px-2 py-1.5 text-text-muted transition hover:bg-surface hover:text-text " +
        (active ? "bg-accent-soft text-accent" : "")
      }
      dangerouslySetInnerHTML={{ __html: link.labelHtml }}
    />
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

// (Headings are imported directly from `app/lib/headings.ts` by routes.)
