import ssg from "@hono/vite-ssg";
import honox from "honox/vite";
import { defineConfig } from "vite";

const entry = "./app/server.ts";

export default defineConfig({
  plugins: [honox(), ssg({ entry })],
});
