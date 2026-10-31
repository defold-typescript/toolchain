import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolve } from "node:path";
import { libraryFolderName } from "../packages/cli/src/library/library-data";
import { writeLibraryTargets } from "../packages/cli/src/library-data-fixture";
import { PACKAGES } from "./release-pack-proof";
import {
  curatedDeclarationPath,
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

  test("curatedDeclarationPath finds a native declaration through the recorded commit", () => {
    const cache = mkdtempSync(path.join(os.tmpdir(), "release-smoke-cache-"));
    const commit = "1111111111111111111111111111111111111111";
    const folder = path.join(cache, "library-data", "commits", commit, "0.0.1");
    mkdirSync(folder, { recursive: true });
    writeLibraryTargets(folder, {
      native: [
        {
          repo: "https://github.com/owner/daabbcc",
          ref: "1.0.0",
          namespace: "daabbcc",
          manifestDir: "daabbcc",
          declaration: "fork/daabbcc.d.ts",
          upstreamSource: "source/upstream/src/extension.cpp",
        },
      ],
    });
    const library = libraryFolderName("https://github.com/owner/daabbcc");
    mkdirSync(path.join(folder, library, "fork"), { recursive: true });
    const declaration = path.join(folder, library, "fork", "daabbcc.d.ts");
    writeFileSync(declaration, "declare namespace daabbcc {}\n");
    const manifest = { "defold-typescript": { libraryData: commit } };

    expect(curatedDeclarationPath(cache, manifest, "daabbcc")).toBe(declaration);
    expect(curatedDeclarationPath(cache, manifest, "other")).toBeNull();
    expect(curatedDeclarationPath(cache, {}, "daabbcc")).toBeNull();
    rmSync(cache, { recursive: true, force: true });
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

  test("overridesFor takes no library-types tarball", () => {
    expect(fakeTarballs.filter((tarball) => tarball.includes("library-types"))).toEqual([]);
    expect(() => overridesFor(["@defold-typescript/library-types"], fakeTarballs)).toThrow();
  });

  test("pinnedTypeScriptSpec returns the repo-pinned typescript spec", () => {
    const root = readManifest("package.json");
    expect(pinnedTypeScriptSpec(root)).toBe("typescript@6.0.2");
  });

  test("pinnedTypeScriptSpec throws when typescript is absent from devDependencies", () => {
    expect(() => pinnedTypeScriptSpec({ devDependencies: {} })).toThrow();
  });
});
