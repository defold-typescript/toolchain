import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { LIBRARY_DIR, packZipEntries, vendoredManifest } from "./pack.ts";

function walkRelative(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    out.push(relative(root, abs).split(sep).join("/"));
  }
  return out.sort();
}

describe("vendoredManifest", () => {
  test("matches the committed library tree exactly — no extra, no missing", () => {
    const manifest = [...vendoredManifest()].sort();
    expect(manifest).toEqual(walkRelative(LIBRARY_DIR));
  });

  test("lists the expected five payload entries", () => {
    expect([...vendoredManifest()].sort()).toEqual([
      "LICENSE",
      "README.md",
      "game.project",
      "lldebugger/debug.lua",
      "lldebugger/debug.lua.map",
    ]);
  });
});

describe("vendored game.project", () => {
  test("carries the load-bearing [library] include_dirs = lldebugger", () => {
    const text = readFileSync(join(LIBRARY_DIR, "game.project"), "utf8");
    expect(text).toContain("[library]");
    expect(text).toMatch(/include_dirs\s*=\s*lldebugger/);
  });
});

describe("vendored LICENSE", () => {
  test("is non-empty and preserves the MIT attribution", () => {
    const text = readFileSync(join(LIBRARY_DIR, "LICENSE"), "utf8");
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("MIT");
  });
});

describe("packZipEntries", () => {
  test("yields entries whose paths match the manifest", () => {
    const paths = packZipEntries().map(([path]) => path);
    expect(paths).toEqual(vendoredManifest());
  });

  test("reads debug.lua bytes equal to the committed file", () => {
    const committed = new Uint8Array(readFileSync(join(LIBRARY_DIR, "lldebugger/debug.lua")));
    const entry = packZipEntries().find(([path]) => path === "lldebugger/debug.lua");
    expect(entry).toBeDefined();
    expect(entry?.[1]).toEqual(committed);
  });
});
