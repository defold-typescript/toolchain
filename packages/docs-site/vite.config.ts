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

export default defineConfig(({ mode }) => {
  // Pass 1 (`--mode client`): honox bundles the client entry + islands and
  // writes the Vite manifest, emptying dist first. Pass 2 (SSG) renders the
  // HTML and must NOT empty dist, so the client assets + manifest survive for
  // the `<Script>` manifest lookup.
  if (mode === "client") {
    return { plugins: [honox(), tailwindcss()], customLogger: quietLogger };
  }
  return {
    plugins: [honox(), tailwindcss(), ssg({ entry })],
    build: { emptyOutDir: false },
    customLogger: quietLogger,
  };
});
