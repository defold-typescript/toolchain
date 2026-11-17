import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "waku/config";

// Subpath hosting (GitHub Pages project sites serve at `/<repo>/`) is opt-in via
// DOCS_BASE; unset means the domain root `/` (dev, tests).
//
// Waku's `basePath` prefixes its own routes and assets. The shared renderer in
// `packages/docs-render` writes links into prebuilt HTML strings, so it reads the
// same value from the `__DOCS_BASE__` compile-time constant (see
// `packages/docs-render/src/base.ts`).
const base = process.env.DOCS_BASE ?? "/";

// The shared rendering package ships TypeScript source, which only a bundled
// build can load; bundling also applies `define`'s `__DOCS_BASE__` to its `base.ts`.
const noExternal = ["@defold-typescript/docs-render"];

export default defineConfig({
  basePath: base,
  vite: {
    define: { __DOCS_BASE__: JSON.stringify(base) },
    resolve: { dedupe: ["waku"] },
    ssr: { noExternal },
    environments: {
      rsc: { resolve: { noExternal } },
      ssr: { resolve: { noExternal } },
    },
    plugins: [tailwindcss()],
  },
});
