import { describe, expect, test } from "bun:test";
import { applyChangelogTagDates } from "./changelog-dates";

describe("applyChangelogTagDates", () => {
  test("a tag date replaces the in-file date on a per-patch heading", () => {
    expect(applyChangelogTagDates("## v0.20.4 - 2026-07-17", { "v0.20.4": "2026-07-18" })).toBe(
      "## v0.20.4 - 2026-07-18",
    );
  });

  test("a heading with no in-file date gains the tag date", () => {
    expect(applyChangelogTagDates("## v0.20.4", { "v0.20.4": "2026-07-18" })).toBe(
      "## v0.20.4 - 2026-07-18",
    );
  });

  test("a version absent from the map renders as Unreleased", () => {
    expect(applyChangelogTagDates("## v0.20.4 - 2026-07-17", {})).toBe("## v0.20.4 - Unreleased");
    expect(applyChangelogTagDates("## v0.20.4", {})).toBe("## v0.20.4 - Unreleased");
  });

  test("a rolled-up minor heading is returned byte-identical", () => {
    expect(applyChangelogTagDates("## v0.20.x", { "v0.20.4": "2026-07-18" })).toBe("## v0.20.x");
  });

  test("the literal Unreleased staging heading is returned byte-identical", () => {
    expect(applyChangelogTagDates("## Unreleased", { "v0.20.4": "2026-07-18" })).toBe(
      "## Unreleased",
    );
  });

  test("only ^## v<semver> matches — prose and h3 versions are untouched", () => {
    const body = "See v1.2.3 for details.\n### v1.2.3\ntext v1.2.3 more";
    expect(applyChangelogTagDates(body, { "v1.2.3": "2026-01-01" })).toBe(body);
  });

  test("surrounding body is preserved verbatim", () => {
    const body = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- pending work",
      "",
      "## v0.20.4 - 2026-07-17",
      "",
      "- shipped a thing",
      "",
      "## v0.20.x",
      "",
      "- rollup note",
    ].join("\n");
    const expected = [
      "# Changelog",
      "",
      "## Unreleased",
      "",
      "- pending work",
      "",
      "## v0.20.4 - 2026-07-18",
      "",
      "- shipped a thing",
      "",
      "## v0.20.x",
      "",
      "- rollup note",
    ].join("\n");
    expect(applyChangelogTagDates(body, { "v0.20.4": "2026-07-18" })).toBe(expected);
  });
});
