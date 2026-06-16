import ssg from "@hono/vite-ssg";
import tailwindcss from "@tailwindcss/vite";
import honox from "honox/vite";
import { createLogger, defineConfig, type Logger } from "vite";

const entry = "./app/server.ts";

/**
 * Vite (rolldown-vite 8) emits dozens of `Sourcemap for ... points to
 * missing source files` warnings every time it pre-bundles `@orama/orama`
 * and `entities`. Their published sourcemaps reference paths that don't
 * exist in Bun's hoisted node_modules layout, and there is nothing
 * actionable for us to do — the warnings are noise that floods the dev
 * terminal and makes a clean build look broken.
 *
 * The fix: hand Vite a custom logger whose `warn` filters the sourcemap
 * noise and forwards everything else (real warnings, real errors) to
 * the default behavior. Errors pass through untouched.
 */
const SOURCEMAP_NOISE = /Sourcemap for .* (points to missing source|points to a source)/;

function makeQuietLogger(): Logger {
  // The base logger is created with the default "info" level so the
  // startup banner and connection messages still flow through. We rely
  // on the `warn` / `warnOnce` filters below — not the level — to
  // drop the orama/entities sourcemap noise.
  const base = createLogger("info");
  return {
    info: (msg, options) => base.info(msg, options),
    warn: (msg, options) => {
      if (typeof msg === "string" && SOURCEMAP_NOISE.test(msg)) return;
      base.warn(msg, options);
    },
    warnOnce: (msg, options) => {
      if (typeof msg === "string" && SOURCEMAP_NOISE.test(msg)) return;
      base.warnOnce(msg, options);
    },
    error: (msg, options) => base.error(msg, options),
    clearScreen: (type) => base.clearScreen(type),
    hasErrorLogged: (error) => base.hasErrorLogged(error),
    get hasWarned() {
      return base.hasWarned;
    },
  };
}

const quietLogger = makeQuietLogger();

// Subpath hosting (GitHub Pages project sites serve at `/<repo>/`) is opt-in via
// DOCS_BASE; unset means the domain root `/` (dev, tests, Cloudflare Pages).
//
// `base` drives Vite's own asset URLs (hashed chunks, CSS `url()` rewrites). The
// honox SSR render, though, does NOT receive Vite's `import.meta.env.BASE_URL`
// (it stays "" in the server bundle), so the value is also injected as the
// `__DOCS_BASE__` compile-time constant via `define` — applied to both the
// client and server builds — which `app/lib/base.ts` reads. Keeping the two in
// lockstep makes the server-rendered HTML and the hydrated client agree.
const base = process.env.DOCS_BASE ?? "/";
const define = { __DOCS_BASE__: JSON.stringify(base) };

// Vite 8 does not prefix CSS `url()` asset references with `base` (the bundled
// stylesheet is byte-identical at any base), so `@font-face` sources would 404
// under a subpath. `renderBuiltUrl` is the documented hook to author every
// built asset URL ourselves — `static/x.woff2` -> `/toolchain/static/x.woff2`
// (an identity at the `/` root). `filename` arrives without a leading slash and
// `base` is always trailing-slashed, so the join needs no separator.
const experimental = { renderBuiltUrl: (filename: string) => base + filename };

export default defineConfig(({ mode }) => {
  // Pass 1 (`--mode client`): honox bundles the client entry + islands and
  // writes the Vite manifest, emptying dist first. Pass 2 (SSG) renders the
  // HTML and must NOT empty dist, so the client assets + manifest survive for
  // the `<Script>` manifest lookup.
  if (mode === "client") {
    return {
      base,
      define,
      experimental,
      plugins: [honox(), tailwindcss()],
      customLogger: quietLogger,
    };
  }
  return {
    base,
    define,
    experimental,
    plugins: [honox(), tailwindcss(), ssg({ entry })],
    build: { emptyOutDir: false },
    customLogger: quietLogger,
  };
});
