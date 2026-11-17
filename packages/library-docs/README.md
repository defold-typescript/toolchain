# @defold-typescript/library-docs

Private documentation site for the libraries in `packages/library-types/data`. It renders
each typed library's API page, a page for each library with no typed API, and the guides
under `guides/` to static HTML with [Waku](https://waku.gg) and
[Fumadocs](https://fumadocs.dev), and is published to the
[library data repo's Pages site](https://defold-typescript.github.io/library-data).

This package is `private` and is never part of the coordinated npm release.

Fumadocs supplies the layout: the sidebar with the guides and every library grouped by owner,
the Toolchain docs and GitHub links, the right-side table of contents, the dark/light switch
and the search dialog. Page bodies come from the shared renderer in `packages/docs-render`,
so Shiki highlighting, symbol links and the API page markup match the toolchain docs.

## Develop

```sh
bun --filter @defold-typescript/library-docs run dev
```

## Build

```sh
bun --filter @defold-typescript/library-docs run build:site
```

`build:site` first runs `build` (the library model from the newest data folder, critical
CSS, the search and symbol indexes), then `waku build`. Every page is prerendered, so
`dist/public/` is a plain static site: one `index.html` per route
(`dist/public/api/github.com/insality/druid/druid/index.html`,
`dist/public/libraries/github.com/defold/asset-pbr/index.html`, ...), the client-navigation
payloads under `RSC/`, and `search-index.json` and `symbol-index.json`.

Set `DOCS_BASE` to serve from a subpath (`DOCS_BASE=/library-data/`); it feeds Waku's
`basePath` and the shared renderer's `__DOCS_BASE__` constant.

## Deploy

`.github/workflows/library-data-publish.yml` builds with `DOCS_BASE=/library-data/` and
pushes `dist/public` to the data repo's `gh-pages` branch.

## Layout

- `waku.config.ts` — base path, the `__DOCS_BASE__` define, Tailwind, and bundling the
  TypeScript-source `types` and `docs-render` packages.
- `src/pages/_root.tsx` — the HTML shell: theme tokens, `critical.css`, the Fumadocs provider.
- `src/pages/_layout.tsx` — the Fumadocs docs layout around every page.
- `src/pages/index.tsx` — the Libraries index: one section of cards per owner.
- `src/pages/api/[host]/[owner]/[repo]/[namespace].tsx` — a typed library's API page.
- `src/pages/libraries/[host]/[owner]/[repo].tsx` — a library with no typed API.
- `src/pages/guides/[slug].tsx` — a guide page.
- `src/lib/site.ts` — the sidebar tree (from `app/lib/nav.ts`) and table of contents.
- `src/components/page-scripts.tsx` — copy buttons and the symbol and UI tooltips.
- `app/lib/library-routes.ts` — each page's HTML and the static paths, shared with the tests.
- `app/lib/` — library data loading, navigation and search records.
- `app/styles.css` — the no-typed-API mark and the upstream badge hue.
