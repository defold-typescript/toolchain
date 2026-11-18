import { expect, test } from "bun:test";
import { join } from "node:path";

// The page scripts mount the symbol tooltips in the browser, and the tooltips
// reach the API surface through the symbol index. The Markdown parser on that
// path fails the browser bundle (`acorn-jsx` has no default export there).
test("the symbol tooltips bundle for the browser without the Markdown parser", async () => {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "tooltip-mounts.ts")],
    target: "browser",
  });
  expect(result.success).toBe(true);
  const [bundle] = result.outputs;
  const text = (await bundle?.text()) ?? "";
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain("micromark");
  expect(text).not.toContain("acorn");
});
