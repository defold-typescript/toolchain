import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { libraryDataFromFlag } from "./data-folder-flag";

describe("libraryDataFromFlag", () => {
  let base: string;
  let empty: string;

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "library-data-flag-"));
    for (const folder of ["0.1.0", "0.2.0"]) {
      mkdirSync(join(base, folder));
    }
    empty = mkdtempSync(join(tmpdir(), "library-data-flag-empty-"));
  });

  afterAll(() => {
    rmSync(base, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  });

  test("reads the highest data folder at or below the CLI version", () => {
    expect(libraryDataFromFlag(base, "/unused", "0.1.5")).toEqual({ dir: join(base, "0.1.0") });
  });

  test("an unversioned CLI reads the newest data folder", () => {
    expect(libraryDataFromFlag(base, "/unused", "0.0.0")).toEqual({ dir: join(base, "0.2.0") });
  });

  test("a relative directory resolves against cwd", () => {
    expect(libraryDataFromFlag(basename(base), dirname(base), "0.1.5")).toEqual({
      dir: join(base, "0.1.0"),
    });
  });

  test("a directory with no data folder for the version is an error naming both", () => {
    const result = libraryDataFromFlag(empty, "/unused", "0.1.5");

    expect("error" in result).toBe(true);
    const { error } = result as { error: string };
    expect(error).toContain(empty);
    expect(error).toContain("0.1.5");
  });
});
