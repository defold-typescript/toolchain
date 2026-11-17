import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

// Bun's `bun test` discovers `*.spec.ts` / `*.test.ts` repo-wide, so the
// browser specs are named `*.e2e.ts` to stay out of that runner and are matched
// here explicitly. This config is intentionally not folded into root `ci`:
// the green path stays browser-free, and layout, cascade and hydration are the
// surfaces only a real browser can assert. The default port is the one
// `waku dev` listens on.
export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  use: { baseURL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
