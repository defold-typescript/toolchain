# @defold-typescript/docs-site

Private documentation site for defold-typescript. It renders every `docs/guide/*.md`
to a Shiki-highlighted static HTML page using [HonoX](https://github.com/honojs/honox)
and `@hono/vite-ssg`, deployable to Cloudflare Pages.

This package is `private` and is never part of the coordinated npm release.

The chrome is a top bar that groups the guide pages plus the API reference into four
categories (Get started, Guides, Language, Reference), a per-category left sidebar, and a
flash-free dark/light theme toggle over self-hosted Inter / JetBrains Mono fonts.

## Develop

```sh
bun --filter @defold-typescript/docs-site run dev
```

## Build

```sh
bun --filter @defold-typescript/docs-site run build
```

The static site is prerendered to `dist/`, one HTML file per guide page
(`dist/getting-started.html`, `dist/index.html` from the guide `README.md`, ...).

## Deploy (Cloudflare Pages)

`wrangler.jsonc` sets `pages_build_output_dir` to `dist`. After a build:

```sh
bunx wrangler pages deploy dist
```

CI automation for deploys is a later slice.

## Layout

- `app/lib/markdown.ts` — `renderMarkdown`: Markdown to HTML with a singleton Shiki highlighter.
- `app/lib/guide.ts` — `listGuidePages`: enumerate the guide files and their routes.
- `app/lib/content.ts` — bridges the libs to the repo-root `docs/guide/` directory.
- `app/lib/nav.ts` — `buildNav` / `activeCategoryId`: group the guide pages plus `/api` into the four nav categories.
- `app/routes/` — HonoX file-based routes: the index (guide `README.md`) and the `[slug]` guide pages.
- `app/routes/_renderer.tsx` — the page shell: top-bar categories, per-category sidebar, and theme toggle.
- `app/islands/theme-toggle.tsx` — the hydrated dark/light switch.
