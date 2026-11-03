import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ISLANDS_DIR = import.meta.dir;
const PACKAGES_DIR = join(import.meta.dir, "../../..");
const SITES = ["docs-site", "library-docs"] as const;

const SHARED_ISLANDS = readdirSync(ISLANDS_DIR)
  .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
  .map((file) => file.slice(0, -".tsx".length))
  .sort();

async function defaultExport(path: string): Promise<unknown> {
  const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
  return mod.default;
}

describe("site islands", () => {
  test("the shared package holds islands", () => {
    expect(SHARED_ISLANDS.length).toBeGreaterThan(0);
  });

  // HonoX hydrates only modules under a site's own `app/islands/`, so each site
  // mounts a shared island through a file there. That file must hand back the
  // shared component itself, not a copy of it.
  test("every shared island is the component both sites mount", async () => {
    const mismatches: string[] = [];
    for (const name of SHARED_ISLANDS) {
      const shared = await defaultExport(join(ISLANDS_DIR, `${name}.tsx`));
      for (const site of SITES) {
        const mounted = await defaultExport(
          join(PACKAGES_DIR, site, "app/islands", `${name}.tsx`),
        ).catch(() => undefined);
        if (mounted === undefined) mismatches.push(`${site} does not mount ${name}`);
        else if (mounted !== shared) mismatches.push(`${site} mounts its own ${name}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
