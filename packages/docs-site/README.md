# @defold-typescript/docs-site

Private documentation site for defold-typescript. It renders every `packages/docs/guide/*.md`
page and the API reference to static HTML with [Waku](https://waku.gg) and
[Fumadocs](https://fumadocs.dev), and deploys to GitHub Pages.

This package is `private` and is never part of the coordinated npm release.

Fumadocs supplies the layout: the sidebar with Get started, Guides and API as switchable
sections, a Libraries link to the [library docs site](https://defold-typescript.github.io/library-data),
the right-side table of contents, the dark/light switch and the search dialog. Page bodies
still come from the shared renderer in `packages/docs-render`, so Shiki highlighting,
symbol links and the API page markup are unchanged.

## Develop

```sh
bun --filter @defold-typescript/docs-site run dev
```

## Build

```sh
bun --filter @defold-typescript/docs-site run build:site
```

`build:site` first runs `build-indexes` (critical CSS, guide images, font fallbacks,
changelog dates, the search and symbol indexes, `llms.txt`), then `waku build`. Every page
is prerendered, so `dist/public/` is a plain static site: one `index.html` per route
(`dist/public/getting-started/index.html`, `dist/public/api/go/index.html`, ...), the
client-navigation payloads under `RSC/`, and the search index at `api/search`.

Set `DOCS_BASE` to serve from a subpath (`DOCS_BASE=/toolchain/`); it feeds Waku's
`basePath` and the shared renderer's `__DOCS_BASE__` constant.

## Deploy

`.github/workflows/deploy-docs.yml` builds with `DOCS_BASE=/<repo>/` and uploads
`dist/public` to GitHub Pages.

## Layout

- `waku.config.ts` — base path, the `__DOCS_BASE__` define, Tailwind, and bundling the
  TypeScript-source `docs-render` package.
- `src/pages/_root.tsx` — the HTML shell: theme tokens, `critical.css`, the Fumadocs provider.
- `src/pages/_layout.tsx` — the Fumadocs docs layout around every page.
- `src/pages/index.tsx`, `src/pages/[slug].tsx` — the guide `README.md` and every other guide page.
- `src/pages/get-started.tsx`, `src/pages/guides.tsx`, `src/pages/api/index.tsx` — section landing pages.
- `src/pages/api/[namespace].tsx` — a canonical namespace page, a version's index, or the
  `/api/combined` redirect; `src/pages/api/[version]/[namespace].tsx` — a namespace at one
  engine version; `src/pages/api/combined/[namespace].tsx` — the old Combined redirects.
- `src/pages/_api/api/search.ts` — the search index, written to a file at build time.
- `src/lib/site.ts` — the sidebar tree (from `app/lib/nav.ts`), table of contents and search entries.
- `src/components/page-scripts.tsx` — copy buttons, code tabs and the state machine demos.
- `app/lib/` — content loading, navigation and API helpers, shared with the tests.
- `app/styles.css` — the state machine demo styles.

## Test the pages in a browser (Playwright)

The specs under `e2e/` are named `*.e2e.ts` so `bun test` skips them. Install the browser once,
then run them (they start `bun run dev` unless a server is already on `PORT`):

```sh
bunx playwright install chromium
bun --filter @defold-typescript/docs-site run test:e2e
```
