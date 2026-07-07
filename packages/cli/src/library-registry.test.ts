import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadVendoredLibraryRegistry, resolveLibraryTypesPackageRoot } from "./library-registry";

describe("resolveLibraryTypesPackageRoot", () => {
  test("resolves the installed @defold-typescript/library-types root in this workspace", () => {
    const root = resolveLibraryTypesPackageRoot();
    expect(root).not.toBeNull();
    expect(existsSync(join(root as string, "package.json"))).toBe(true);
    expect(existsSync(join(root as string, "generated"))).toBe(true);
  });
});

describe("loadVendoredLibraryRegistry", () => {
  test("builds a non-empty registry from the real corpus and points generatedDir at generated/", () => {
    const { registry, generatedDir } = loadVendoredLibraryRegistry();
    expect(registry.length).toBeGreaterThan(0);
    for (const library of registry) {
      expect(typeof library.sourceId).toBe("string");
      expect(library.sourceId.length).toBeGreaterThan(0);
      expect(library.modules.length).toBeGreaterThan(0);
    }
    expect(generatedDir).not.toBeNull();
    expect(generatedDir as string).toEndWith("generated");
    expect(existsSync(generatedDir as string)).toBe(true);
  });

  test("returns the empty fallback when the package root cannot be resolved", () => {
    expect(loadVendoredLibraryRegistry(null)).toEqual({ registry: [], generatedDir: null });
  });

  test("returns the empty fallback when the registry JSONs are absent under the given root", () => {
    expect(loadVendoredLibraryRegistry("/nonexistent/library-types-root")).toEqual({
      registry: [],
      generatedDir: null,
    });
  });
});
