import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefoldEngineReleases, releaseEra } from "./defold-release-era";

// Deliberately unordered, so taking the first or last entry is observable.
const RELEASES = [
  { version: "1.9.0", date: "2024-06-25T11:35:28Z" },
  { version: "1.10.0", date: "2025-04-01T09:00:00Z" },
  { version: "1.2.1", date: "2012-08-03T16:39:43Z" },
  { version: "1.9.1", date: "2024-07-22T08:00:00Z" },
];

describe("releaseEra", () => {
  test("names the newest release dated on or before the pin", () => {
    expect(releaseEra("2024-07-01T00:00:00Z", RELEASES)).toBe("1.9.0");
    expect(releaseEra("2025-06-01T00:00:00Z", RELEASES)).toBe("1.10.0");
    expect(releaseEra("2013-01-01T00:00:00Z", RELEASES)).toBe("1.2.1");
  });

  test("a release dated exactly at the pin counts", () => {
    expect(releaseEra("2024-07-22T08:00:00Z", RELEASES)).toBe("1.9.1");
  });

  test("compares instants, not strings, across offsets", () => {
    expect(releaseEra("2024-07-22T09:00:00+02:00", RELEASES)).toBe("1.9.0");
  });

  test("a pin older than every release has no era", () => {
    expect(releaseEra("2010-01-01T00:00:00Z", RELEASES)).toBeUndefined();
    expect(releaseEra("2024-07-01T00:00:00Z", [])).toBeUndefined();
  });
});

describe("loadDefoldEngineReleases", () => {
  test("reads the committed releases list and treats an absent file as none", () => {
    const dir = mkdtempSync(join(tmpdir(), "defold-engine-releases-"));
    expect(loadDefoldEngineReleases(dir)).toEqual([]);
    writeFileSync(
      join(dir, "defold-engine-releases.json"),
      `${JSON.stringify({ releases: RELEASES }, null, 2)}\n`,
    );
    expect(loadDefoldEngineReleases(dir)).toEqual(RELEASES);
  });
});
