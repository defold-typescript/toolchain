# @defold-typescript/docs-site

Private documentation site for defold-typescript. It renders every `docs/guide/*.md`
to a Shiki-highlighted static HTML page using [HonoX](https://github.com/honojs/honox)
and `@hono/vite-ssg`, deployable to Cloudflare Pages.

This package is `private` and is never part of the coordinated npm release.

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
- `app/routes/` — HonoX file-based routes: the index (guide `README.md`) and the `[slug]` guide pages.
- `app/routes/_renderer.tsx` — the page layout and sidebar navigation.
