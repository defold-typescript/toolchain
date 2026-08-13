import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as editor from "../src/editor";
import * as lifecycle from "../src/lifecycle";

const GUIDE = resolve(import.meta.dir, "..", "..", "docs", "guide");

// The names come off the real module objects, so a rename lands here as a
// changed export list rather than as a string this file would have to be
// edited to keep in step.
const FACTORIES = [...Object.keys(lifecycle), ...Object.keys(editor)]
  .filter((name) => name.startsWith("define"))
  .sort();

// `defineScriptType` in a guide's `import type { defineScript as … }` line is a
// local alias, not a claimed export, so the identifier must end at `Script` (or
// at `Command`, the editor-command factory's suffix).
const GUIDE_FACTORY_RE = /\bdefine\w*(?:Script|Command)\b/g;

function guidePages(): { page: string; body: string }[] {
  return readdirSync(GUIDE)
    .filter((f) => f.endsWith(".md"))
    .map((page) => ({ page, body: readFileSync(join(GUIDE, page), "utf8") }));
}

describe("docs/guide lifecycle factory names", () => {
  test("the export list is derived and non-trivial", () => {
    expect(FACTORIES.length).toBeGreaterThan(1);
    const modules: Record<string, unknown>[] = [
      lifecycle as unknown as Record<string, unknown>,
      editor as unknown as Record<string, unknown>,
    ];
    for (const name of FACTORIES) {
      const impl = modules.map((m) => m[name]).find((value) => value !== undefined);
      expect(typeof impl).toBe("function");
    }
  });

  test("every exported factory is taught by at least one guide page", () => {
    const pages = guidePages();
    const untaught = FACTORIES.filter(
      (name) => !pages.some(({ body }) => new RegExp(`\\b${name}\\b`).test(body)),
    );
    expect(untaught).toEqual([]);
  });

  test("every factory name the guide teaches is a real export", () => {
    const unknown: { page: string; name: string }[] = [];
    for (const { page, body } of guidePages()) {
      for (const match of body.matchAll(GUIDE_FACTORY_RE)) {
        const name = match[0];
        if (!FACTORIES.includes(name)) unknown.push({ page, name });
      }
    }
    if (unknown.length > 0) {
      throw new Error(
        `guide pages teach factories the toolchain does not export:\n${unknown
          .map((u) => `  ${u.page} -> ${u.name}`)
          .join("\n")}`,
      );
    }
    expect(unknown).toEqual([]);
  });

  test("the guard actually read factory names out of the guide", () => {
    const seen = new Set<string>();
    for (const { body } of guidePages()) {
      for (const match of body.matchAll(GUIDE_FACTORY_RE)) seen.add(match[0]);
    }
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen].every((name) => FACTORIES.includes(name))).toBe(true);
  });
});
