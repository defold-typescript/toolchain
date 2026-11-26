import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { apiPages, libraryLinkers, linkPages } from "./api-content";
import { type LibraryDirs, loadLibraryPageSources } from "./api-surface-loader";

const FIXTURE_ROOT = join(import.meta.dir, "__fixtures__", "library-display");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// A copy of the display fixture; `demo.two`'s module is renamed when given, so
// two copies hold different page sets.
function fixtureDirs(demoTwoNamespace?: string): LibraryDirs {
  const root = mkdtempSync(join(tmpdir(), "library-docs-api-content-"));
  roots.push(root);
  cpSync(FIXTURE_ROOT, root, { recursive: true });
  if (demoTwoNamespace) {
    const path = join(root, "api-doc", "demo.two.json");
    const doc = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(
      path,
      JSON.stringify({ ...doc, info: { ...doc.info, namespace: demoTwoNamespace } }),
    );
  }
  return { dataDir: join(root, "data", "0.61.0"), modelDir: join(root, "api-doc") };
}

const loaded = (dirs: LibraryDirs): ApiPage[] =>
  loadLibraryPageSources(dirs).map((source) => source.page);

describe("page set, link set and linkers per dirs object", () => {
  const first = fixtureDirs();
  const second = fixtureDirs("demo.three");

  test("one dirs object returns the same page set, link set and linkers on every call", () => {
    expect(apiPages(first)).toBe(apiPages(first));
    expect(linkPages(first)).toBe(linkPages(first));
    expect(libraryLinkers(first)).toBe(libraryLinkers(first));
  });

  test("a second dirs object reads its own folder", () => {
    expect(loaded(second)).not.toEqual(loaded(first));
    expect(apiPages(first)).toEqual(loaded(first));
    expect(apiPages(second)).toEqual(loaded(second));
    expect(linkPages(second)).toEqual(loaded(second));
    expect(libraryLinkers(second)).not.toBe(libraryLinkers(first));
  });
});
