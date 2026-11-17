import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "waku/config";

// Subpath hosting (the data repo's GitHub Pages site serves at `/library-data/`)
// is opt-in via DOCS_BASE; unset means the domain root `/` (dev, tests).
//
// Waku's `basePath` prefixes its own routes and assets. The shared renderer in
// `packages/docs-render` writes links into prebuilt HTML strings, so it reads the
// same value from the `__DOCS_BASE__` compile-time constant (see
// `packages/docs-render/src/base.ts`).
const base = process.env.DOCS_BASE ?? "/";

// The published types package and the shared rendering package ship TypeScript
// source, which only a bundled build can load; bundling also applies `define`'s
// `__DOCS_BASE__` to the rendering package's `base.ts`.
const noExternal = ["@defold-typescript/types", "@defold-typescript/docs-render"];

// In dev, Vite pre-bundles dependencies per environment, and a client component
// package pre-bundled in one environment but not another loads twice in the
// browser. Fumadocs' provider and layout then hold different copies of its
// framework context, the layout throws, and React clears the page. Serving the
// Fumadocs packages unbundled keeps one copy. A CommonJS package they import
// still needs pre-bundling: the search client's `micromark` imports `debug` in
// dev, which the browser cannot load as an ES module.
const optimizeDeps = {
  exclude: ["fumadocs-ui", "fumadocs-core"],
  include: ["fumadocs-core > micromark > debug"],
};

export default defineConfig({
  basePath: base,
  vite: {
    define: { __DOCS_BASE__: JSON.stringify(base) },
    resolve: { dedupe: ["waku"] },
    ssr: { noExternal },
    optimizeDeps,
    environments: {
      client: { optimizeDeps },
      rsc: { resolve: { noExternal }, optimizeDeps },
      ssr: { resolve: { noExternal }, optimizeDeps },
    },
    plugins: [tailwindcss()],
  },
});
