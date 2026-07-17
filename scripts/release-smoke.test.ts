import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PACKAGES } from "./release-pack-proof";
import {
  internalCliDeps,
  overridesFor,
  pinnedTypeScriptSpec,
  tarballForExact,
} from "./release-smoke";

const REPO_ROOT = resolve(import.meta.dir, "..");

function readManifest(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, rel), "utf8"));
}

const fakeTarballs = PACKAGES.map((pkg) => `/tmp/pack/defold-typescript-${pkg}-0.0.0.tgz`);

describe("release-smoke override derivation", () => {
  test("internalCliDeps returns the sorted @defold-typescript deps of the real CLI manifest", () => {
    const cli = readManifest("packages/cli/package.json");
    expect(internalCliDeps(cli)).toEqual([
      "@defold-typescript/docs",
      "@defold-typescript/library-types",
      "@defold-typescript/transpiler",
      "@defold-typescript/types",
    ]);
  });

  test("overridesFor has a file: entry for every internal CLI dep", () => {
    const cli = readManifest("packages/cli/package.json");
    const deps = internalCliDeps(cli);
    const overrides = overridesFor(deps, fakeTarballs);
    for (const dep of deps) {
      expect(overrides[dep]).toBeDefined();
      expect(overrides[dep]?.startsWith("file:")).toBe(true);
    }
    expect(Object.keys(overrides).sort()).toEqual([...deps].sort());
  });

  test("overridesFor throws when a required internal dep has no matching tarball", () => {
    const deps = ["@defold-typescript/docs"];
    expect(() => overridesFor(deps, [])).toThrow();
  });

  test("tarballForExact matches at a name boundary, so types does not match library-types", () => {
    const tarballs = [
      "/tmp/pack/defold-typescript-types-0.0.0.tgz",
      "/tmp/pack/defold-typescript-library-types-0.0.0.tgz",
    ];
    expect(tarballForExact(tarballs, "types")).toBe("/tmp/pack/defold-typescript-types-0.0.0.tgz");
    expect(tarballForExact(tarballs, "library-types")).toBe(
      "/tmp/pack/defold-typescript-library-types-0.0.0.tgz",
    );
  });

  test("overridesFor keeps types and library-types on their own tarballs", () => {
    const overrides = overridesFor(
      ["@defold-typescript/types", "@defold-typescript/library-types"],
      fakeTarballs,
    );
    expect(overrides["@defold-typescript/types"]).toBe(
      "file:/tmp/pack/defold-typescript-types-0.0.0.tgz",
    );
    expect(overrides["@defold-typescript/library-types"]).toBe(
      "file:/tmp/pack/defold-typescript-library-types-0.0.0.tgz",
    );
  });

  test("pinnedTypeScriptSpec returns the repo-pinned typescript spec", () => {
    const root = readManifest("package.json");
    expect(pinnedTypeScriptSpec(root)).toBe("typescript@6.0.2");
  });

  test("pinnedTypeScriptSpec throws when typescript is absent from devDependencies", () => {
    expect(() => pinnedTypeScriptSpec({ devDependencies: {} })).toThrow();
  });
});
