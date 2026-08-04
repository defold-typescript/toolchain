import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const PAGE = resolve(PKG_DIR, "guide", "editor-scripts.md");

describe("editor-scripts guide page", () => {
  test("page exists and documents the artifact suffix", () => {
    expect(existsSync(PAGE)).toBe(true);
    const body = readFileSync(PAGE, "utf8");
    expect(body).toContain(".ts.editor_script");
  });
});
