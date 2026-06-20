import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

// Bun's `bun test` discovers `*.spec.ts` / `*.test.ts` repo-wide, so the
// responsive spec is named `*.e2e.ts` to stay out of that runner and is matched
// here explicitly. This config is intentionally not folded into root `ci`:
// the green path stays browser-free, and the visual responsive behavior is the
// one surface a real browser must assert.
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
