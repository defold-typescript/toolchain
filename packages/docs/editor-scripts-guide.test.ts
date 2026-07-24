import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const PAGE = resolve(PKG_DIR, "guide", "editor-scripts.md");

describe("editor-scripts guide page", () => {
  test("page exists and documents the factory and artifact suffix", () => {
    expect(existsSync(PAGE)).toBe(true);
    const body = readFileSync(PAGE, "utf8");
    expect(body).toContain("defineEditorScript");
    expect(body).toContain(".ts.editor_script");
  });

  test("carries a worked ts snippet that calls the factory", () => {
    const body = readFileSync(PAGE, "utf8");
    const blocks = [...body.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
    expect(blocks.some((block) => block.includes("defineEditorScript("))).toBe(true);
  });

  test("does not reference the non-existent editor-script types entrypoint", () => {
    const body = readFileSync(PAGE, "utf8");
    expect(body).not.toContain("@defold-typescript/types/editor-script");
  });
});
