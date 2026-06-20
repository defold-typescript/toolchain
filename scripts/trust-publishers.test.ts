import { describe, expect, test } from "bun:test";
import { PACKAGES } from "./release-pack-proof.ts";
import { listCommand, parseRepoSlug, trustCommand } from "./trust-publishers.ts";

describe("parseRepoSlug", () => {
  test("reads owner/repo from an https remote with .git", () => {
    expect(parseRepoSlug("https://github.com/defold-typescript/toolchain.git")).toBe(
      "defold-typescript/toolchain",
    );
  });

  test("reads owner/repo from an https remote without .git", () => {
    expect(parseRepoSlug("https://github.com/defold-typescript/toolchain")).toBe(
      "defold-typescript/toolchain",
    );
  });

  test("reads owner/repo from an ssh remote", () => {
    expect(parseRepoSlug("git@github.com:defold-typescript/toolchain.git")).toBe(
      "defold-typescript/toolchain",
    );
  });

  test("tolerates surrounding whitespace from git output", () => {
    expect(parseRepoSlug("  https://github.com/defold-typescript/toolchain.git\n")).toBe(
      "defold-typescript/toolchain",
    );
  });

  test("throws on a non-GitHub remote", () => {
    expect(() => parseRepoSlug("https://example.com/foo/bar.git")).toThrow();
  });
});

describe("trustCommand", () => {
  test("builds the npm trust github invocation for a scoped package", () => {
    expect(trustCommand("cli", "defold-typescript/toolchain")).toEqual([
      "npm",
      "trust",
      "github",
      "@defold-typescript/cli",
      "--file",
      ".github/workflows/release.yml",
      "--repo",
      "defold-typescript/toolchain",
      "--allow-publish",
      "--yes",
    ]);
  });

  test("covers every coordinated package with the same repo and workflow", () => {
    for (const pkg of PACKAGES) {
      const cmd = trustCommand(pkg, "defold-typescript/toolchain");
      expect(cmd).toContain(`@defold-typescript/${pkg}`);
      expect(cmd).toContain(".github/workflows/release.yml");
      expect(cmd.at(-1)).toBe("--yes");
    }
  });
});

describe("listCommand", () => {
  test("builds the npm trust list invocation", () => {
    expect(listCommand("types")).toEqual(["npm", "trust", "list", "@defold-typescript/types"]);
  });
});
