import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  compareSemver,
  parseTopChangelogVersion,
  projectedReleaseVersion,
} from "./changelog-version.ts";

describe("compareSemver", () => {
  test("orders patch < minor < major", () => {
    expect(compareSemver("0.20.4", "0.20.5")).toBeLessThan(0);
    expect(compareSemver("0.20.5", "0.21.0")).toBeLessThan(0);
    expect(compareSemver("0.21.0", "1.0.0")).toBeLessThan(0);
    expect(compareSemver("1.0.0", "0.21.0")).toBeGreaterThan(0);
    expect(compareSemver("0.20.5", "0.20.5")).toBe(0);
  });
});

describe("parseTopChangelogVersion", () => {
  test("returns the first ## vX.Y.Z heading's version, skipping non-version headings above it", () => {
    const body = "# Changelog\n\nintro prose\n\n## v0.20.5\n\n### Fixed\n\n- a fix\n\n## v0.20.4\n";
    expect(parseTopChangelogVersion(body)).toBe("0.20.5");
  });

  test("ignores a later ## v0.20.x rollup and returns the topmost patch version", () => {
    const body = "# Changelog\n\n## v0.20.5\n\n- a bullet\n\n## v0.20.x\n\n- rollup\n";
    expect(parseTopChangelogVersion(body)).toBe("0.20.5");
  });

  test("returns null when no ## vX.Y.Z heading exists", () => {
    const body = "# Changelog\n\nintro prose\n\n## v0.20.x\n\n- rollup only\n";
    expect(parseTopChangelogVersion(body)).toBeNull();
  });
});

describe("projectedReleaseVersion", () => {
  test("returns the top heading version when strictly greater than the latest tag", () => {
    const body = "# Changelog\n\n## v0.20.5\n\n- a bullet\n";
    expect(projectedReleaseVersion(body, "v0.20.4")).toBe("0.20.5");
  });

  test("throws naming both versions when the top heading equals the latest tag", () => {
    const body = "# Changelog\n\n## v0.20.4\n\n- a bullet\n";
    expect(() => projectedReleaseVersion(body, "v0.20.4")).toThrow(/0\.20\.4/);
  });

  test("throws naming both versions when the top heading is less than the latest tag", () => {
    const body = "# Changelog\n\n## v0.20.3\n\n- a bullet\n";
    expect(() => projectedReleaseVersion(body, "v0.20.4")).toThrow(
      /0\.20\.3[\s\S]*0\.20\.4|0\.20\.4[\s\S]*0\.20\.3/,
    );
  });

  test("throws when the body has no version heading", () => {
    const body = "# Changelog\n\n## v0.20.x\n\n- rollup only\n";
    expect(() => projectedReleaseVersion(body, "v0.20.4")).toThrow();
  });

  test("throws when the top heading is malformed (not a plain vX.Y.Z)", () => {
    const body = "# Changelog\n\n## v1.2.3.4\n\n- a bullet\n";
    expect(() => projectedReleaseVersion(body, "v0.20.4")).toThrow();
  });

  test("throws when the latest tag is malformed", () => {
    const body = "# Changelog\n\n## v0.20.5\n\n- a bullet\n";
    expect(() => projectedReleaseVersion(body, "not-a-tag")).toThrow();
  });
});

describe("committed changelog is release-ready", () => {
  const body = readFileSync(
    path.join(import.meta.dir, "..", "packages", "docs", "guide", "changelog.md"),
    "utf8",
  );

  test("projects to 0.20.5 over the latest tag and carries no literal ## Unreleased heading", () => {
    expect(projectedReleaseVersion(body, "v0.20.4")).toBe("0.20.5");
    expect(body).not.toMatch(/^## Unreleased$/m);
  });
});
