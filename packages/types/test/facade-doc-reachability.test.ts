import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { extractSurface } from "./doc-surface-extract";
import { offGridLines } from "./jsdoc-wellformed";

const SRC = resolve(import.meta.dir, "..", "src");

const FACADE_FILES = [
  "msg-overloads.d.ts",
  "go-overloads.d.ts",
  "message-guard.d.ts",
  "message-dispatch.d.ts",
];

async function readFacade(file: string): Promise<string> {
  return await Bun.file(resolve(SRC, file)).text();
}

describe("facade doc reachability — hand-authored .d.ts surface is documented", () => {
  test.each(FACADE_FILES)("%s: every extracted symbol has a description", async (file) => {
    const surface = extractSurface(await readFacade(file));
    expect(surface.size).toBeGreaterThan(0);
    const undocumented = [...surface].filter(([, doc]) => !doc.hasDescription).map(([key]) => key);
    expect(undocumented).toEqual([]);
  });

  test("isMessage carries documented params and an @example", async () => {
    const surface = extractSurface(await readFacade("message-guard.d.ts"));
    const doc = surface.get("isMessage");
    expect(doc).toBeDefined();
    expect(doc?.hasDescription).toBe(true);
    expect(doc?.paramNames).toEqual(new Set(["message_id", "message", "expected"]));
    expect(doc?.hasExample).toBe(true);
  });

  test("onMessage carries documented params and an @example", async () => {
    const surface = extractSurface(await readFacade("message-dispatch.d.ts"));
    const doc = surface.get("onMessage");
    expect(doc).toBeDefined();
    expect(doc?.hasDescription).toBe(true);
    expect(doc?.paramNames).toEqual(new Set(["handlers"]));
    expect(doc?.hasExample).toBe(true);
  });

  test.each(FACADE_FILES)("%s: every line inside a /** */ block begins with *", async (file) => {
    const offending = offGridLines(await readFacade(file));
    if (offending.length > 0) {
      const sample = offending
        .slice(0, 5)
        .map((o) => `  line ${o.line}: ${JSON.stringify(o.text)}`)
        .join("\n");
      throw new Error(`${offending.length} off-grid JSDoc continuation line(s):\n${sample}`);
    }
    expect(offending).toEqual([]);
  });

  const LIFECYCLE_FACTORIES = ["defineScript", "defineGuiScript", "defineRenderScript"];

  test.each(
    LIFECYCLE_FACTORIES,
  )("lifecycle.ts: %s carries a description, a documented `hooks` param, and an @example", async (factory) => {
    const surface = extractSurface(await readFacade("lifecycle.ts"));
    const doc = surface.get(factory);
    expect(doc).toBeDefined();
    expect(doc?.hasDescription).toBe(true);
    expect(doc?.hasExample).toBe(true);
    expect(doc?.paramNames.has("hooks")).toBe(true);
  });

  test("lifecycle.ts: every line inside a /** */ block begins with *", async () => {
    const offending = offGridLines(await readFacade("lifecycle.ts"));
    if (offending.length > 0) {
      const sample = offending
        .slice(0, 5)
        .map((o) => `  line ${o.line}: ${JSON.stringify(o.text)}`)
        .join("\n");
      throw new Error(`${offending.length} off-grid JSDoc continuation line(s):\n${sample}`);
    }
    expect(offending).toEqual([]);
  });
});
