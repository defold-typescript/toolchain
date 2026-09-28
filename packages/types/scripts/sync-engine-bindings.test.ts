import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  bindingsDir,
  type EngineBindingManifest,
  selectBindingPaths,
  sha256,
  vendoredTargets,
} from "./sync-engine-bindings";

const TREE_FIXTURE = resolve(
  import.meta.dir,
  "..",
  "test",
  "fixtures",
  "defold-1.13.1-engine-cpp-tree.txt",
);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

describe("selectBindingPaths", () => {
  const selected = selectBindingPaths(readFileSync(TREE_FIXTURE, "utf8").trim().split("\n"));

  test("keeps every binding source vendored for 1.13.1", () => {
    const target = vendoredTargets().find((t) => t.id === "defold-1.13.1");
    if (!target) throw new Error("defold-1.13.1 is not a vendored target");
    const manifest = JSON.parse(
      readFileSync(join(bindingsDir(target), "manifest.json"), "utf8"),
    ) as EngineBindingManifest;
    const vendored = manifest.files.map((file) => file.path);
    expect(vendored.length).toBeGreaterThan(0);
    expect(vendored.filter((path) => !selected.includes(path))).toEqual([]);
  });

  test("drops test sources and platform stubs", () => {
    expect(selected.filter((path) => path.includes("/test/"))).toEqual([]);
    expect(selected.filter((path) => /_(null|android)\.cpp$/.test(path))).toEqual([]);
    expect(selected).not.toContain("engine/profiler/src/profiler_null.cpp");
    expect(selected).not.toContain("engine/crash/src/script_crash_null.cpp");
  });
});

describe("vendored engine bindings", () => {
  for (const target of vendoredTargets()) {
    test(`${target.id} files match manifest.json`, () => {
      const dir = bindingsDir(target);
      const manifest = JSON.parse(
        readFileSync(join(dir, "manifest.json"), "utf8"),
      ) as EngineBindingManifest;
      expect(manifest.tag).toBe(target.id.replace(/^defold-/, ""));
      const onDisk = listFiles(dir)
        .filter((path) => path !== "manifest.json")
        .sort();
      expect(onDisk).toEqual(manifest.files.map((file) => file.path).sort());
      for (const file of manifest.files) {
        expect({ path: file.path, sha256: sha256(readFileSync(join(dir, file.path))) }).toEqual({
          path: file.path,
          sha256: file.sha256,
        });
      }
    });
  }
});
