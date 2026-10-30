import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectDataFolder } from "./data-folder";

describe("selectDataFolder", () => {
  let base: string;

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "library-data-folders-"));
    for (const folder of ["0.9.0", "0.10.0", "0.55.0", "scratch"]) {
      mkdirSync(join(base, folder));
    }
    writeFileSync(join(base, "0.60.0"), "");
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
  });

  test("reads the highest data folder at or below the CLI version, compared numerically", () => {
    expect(selectDataFolder(base, "0.54.2")).toBe(join(base, "0.10.0"));
  });

  test("a release and its prereleases read the release's own folder", () => {
    expect(selectDataFolder(base, "0.55.0")).toBe(join(base, "0.55.0"));
    expect(selectDataFolder(base, "0.55.0-rc.1")).toBe(join(base, "0.55.0"));
  });

  test("an unversioned CLI reads the newest data folder", () => {
    expect(selectDataFolder(base, "0.0.0")).toBe(join(base, "0.55.0"));
  });

  test("a CLI older than every data folder reads none", () => {
    expect(selectDataFolder(base, "0.8.0")).toBeNull();
  });

  test("a base that does not exist holds no data folder", () => {
    expect(selectDataFolder(join(base, "missing"), "0.55.0")).toBeNull();
  });
});
