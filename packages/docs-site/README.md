# @defold-typescript/docs-site

Private documentation site for defold-typescript. It renders every `docs/guide/*.md`
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

`bun run build` first calls `scripts/sync-guide-routes.ts` to generate one static
HonoX route file per guide slug under `app/routes/`, then `scripts/build-search-index.ts`
to materialise the prose search index, and finally the two-pass Vite build
(`--mode client` + SSG). The static site is prerendered to `dist/`, one HTML file per
guide page (`dist/getting-started.html`, `dist/index.html` from the guide `README.md`,
...), the API index (`dist/api.html`), and one per API namespace under `dist/api/`.

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
- `app/lib/content.ts` — bridges the libs to the repo-root `docs/guide/` directory.
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
- `app/routes/index.tsx` and the generated `app/routes/<slug>.tsx` files — the guide
  pages.
- `app/routes/api/index.tsx` and `app/routes/api/[namespace].tsx` — the API index
  and per-namespace reference pages.
- `app/islands/theme-toggle.tsx` — the hydrated dark/light switch (system fallback,
  localStorage, no flash on reload).
- `app/islands/search.tsx` — the client-side prose search.
- `app/islands/toc.tsx` — the right-side table of contents with scroll-spy.
- `app/styles.css` — Tailwind v4 entry plus the custom `.prose` styles, design
  tokens, and Shiki theme variables.
- `scripts/sync-guide-routes.ts` — generates one static route file per guide slug
  (the `build` script calls this; run it manually with `bun run sync-routes` after
  adding or renaming a guide file).
