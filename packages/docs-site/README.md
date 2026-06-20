# @defold-typescript/docs-site

Private documentation site for defold-typescript. It renders every `packages/docs/guide/*.md`
to a Shiki-highlighted static HTML page using [HonoX](https://github.com/honojs/honox)
and `@hono/vite-ssg`, deployable to Cloudflare Pages.

This package is `private` and is never part of the coordinated npm release.

The chrome is a top bar that groups the guide pages plus the API reference into four
categories (Get started, Guides, Language, Reference), a per-category left sidebar, a
right-side scroll-spy table of contents, and a flash-free dark/light theme toggle over
self-hosted Inter / JetBrains Mono fonts. Tailwind v4 powers the design tokens and
utility classes.

## Develop

```sh
bun --filter @defold-typescript/docs-site run dev
```

## Build

```sh
bun --filter @defold-typescript/docs-site run build
```

`bun run build` first calls `scripts/build-search-index.ts` to materialise the prose
search index, then `scripts/build-symbol-index.ts`, and finally the two-pass Vite build
(`--mode client` + SSG). The static site is prerendered to `dist/`, one HTML file per
guide page (`dist/getting-started.html`, `dist/index.html` from the guide `README.md`,
...), the API index (`dist/api.html`), and one per API namespace under `dist/api/`.
Guide pages are served by the single dynamic `app/routes/[slug].tsx` route, whose
`ssgParams` enumerates every non-index `packages/docs/guide/*.md` slug so each prerenders to
`dist/<slug>.html` — no per-slug route files to keep in sync.

## Test the responsive chrome (Playwright)

The narrow-screen chrome — the topic nav wrapping to a second row and the left
sidebar collapsing into an off-canvas drawer — is the one surface a real browser
must assert, so it lives in an opt-in Playwright spec kept out of root `ci`
(which stays browser-free). The spec is named `*.e2e.ts` so Bun's `bun test`
runner never picks it up.

One-time, install the chromium browser binary:

```sh
bunx playwright install chromium
```

Then run the responsive spec (it boots `bun run dev` on port 5173 automatically):

```sh
bun --filter @defold-typescript/docs-site run test:e2e
```

## Deploy (Cloudflare Pages)

`wrangler.jsonc` sets `pages_build_output_dir` to `dist`. After a build:

```sh
bunx wrangler pages deploy dist
```

CI automation for deploys is a later slice.

## Layout

- `app/lib/markdown.ts` — `renderMarkdown`: Markdown to HTML with a singleton Shiki
  highlighter. Emits the **dual** `github-light` / `github-dark` themes so code blocks
  re-theme cleanly when the page switches themes.
- `app/lib/guide.ts` — `listGuidePages`: enumerate the guide files and their routes.
- `app/lib/content.ts` — bridges the libs to the `packages/docs/guide/` directory.
- `app/lib/nav.ts` — `buildNav` / `activeCategoryId`: group the guide pages plus
  `/api` into the four nav categories.
- `app/lib/headings.ts` — `pageHeadings`: extract h2/h3 headings with slugs from a
  rendered HTML body, used by the right-side TOC.
- `app/lib/api-surface.ts` + `app/lib/api-content.ts` — load the Defold reference
  surface from `packages/types/fixtures/`, with a graceful empty-state page for
  namespaces whose fixture has no elements yet.
- `app/routes/_renderer.tsx` — the page shell: top bar, left sidebar, main content,
  right TOC. Ships a tiny critical-CSS block in `<head>` so the page is laid out
  correctly before the Tailwind stylesheet arrives (no FOUC logo splash).
- `app/routes/index.tsx` (the guide `README.md` homepage) and `app/routes/[slug].tsx`
  (one dynamic route prerendering every other guide page via `ssgParams`).
- `app/routes/api.tsx` and `app/routes/api/[namespace].tsx` — the API index
  and per-namespace reference pages.
- `app/islands/theme-toggle.tsx` — the hydrated dark/light switch (system fallback,
  localStorage, no flash on reload).
- `app/islands/sidebar-toggle.tsx` + `app/islands/sidebar-state.ts` — the `<lg`
  sidebar-drawer toggle. The island flips `html[data-sidebar]` (the `data-theme`
  cross-island precedent) and CSS in `styles.css` reveals the off-canvas drawer;
  the pure open/close helpers live in `sidebar-state.ts` and are unit-tested.
- `app/islands/search.tsx` — the client-side prose search.
- `app/islands/toc.tsx` — the right-side table of contents with scroll-spy.
- `app/styles.css` — Tailwind v4 entry plus the custom `.prose` styles, design
  tokens, and Shiki theme variables.
- `scripts/build-search-index.ts` / `scripts/build-symbol-index.ts` — materialise the
  prose search index and the API symbol index the `build` script consumes.
