import ssg from "@hono/vite-ssg";
import tailwindcss from "@tailwindcss/vite";
import honox from "honox/vite";
import { defineConfig } from "vite";

const entry = "./app/server.ts";

export default defineConfig(({ mode }) => {
  // Pass 1 (`--mode client`): honox bundles the client entry + islands and
  // writes the Vite manifest, emptying dist first. Pass 2 (SSG) renders the
  // HTML and must NOT empty dist, so the client assets + manifest survive for
  // the `<Script>` manifest lookup.
  if (mode === "client") {
    return { plugins: [honox(), tailwindcss()] };
  }
  return {
    plugins: [honox(), tailwindcss(), ssg({ entry })],
    build: { emptyOutDir: false },
  };
});
