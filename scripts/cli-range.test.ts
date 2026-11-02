import { describe, expect, test } from "bun:test";
import { checkedVersions, parseScope, readersOf } from "./cli-range.ts";

describe("readersOf", () => {
  test("gives each release to the highest folder at or below it", () => {
    const versions = ["0.54.0", "0.55.0", "0.57.3", "0.59.9", "0.60.0", "0.61.0"];
    expect(readersOf(["0.55.0", "0.60.0"], versions)).toEqual(
      new Map([
        ["0.55.0", ["0.55.0", "0.57.3", "0.59.9"]],
        ["0.60.0", ["0.60.0", "0.61.0"]],
      ]),
    );
  });

  test("leaves a prerelease out", () => {
    expect(readersOf(["0.55.0"], ["0.55.0", "0.60.0-rc.1"])).toEqual(
      new Map([["0.55.0", ["0.55.0"]]]),
    );
  });

  test("gives a folder above every release no entry", () => {
    expect(readersOf(["0.55.0", "0.60.0"], ["0.55.0", "0.59.0"])).toEqual(
      new Map([["0.55.0", ["0.55.0", "0.59.0"]]]),
    );
  });

  test("compares folders and versions numerically, whatever order they arrive in", () => {
    expect(readersOf(["0.10.0", "0.9.0"], ["0.11.0", "0.9.1", "0.10.0", "0.9.0"])).toEqual(
      new Map([
        ["0.9.0", ["0.9.0", "0.9.1"]],
        ["0.10.0", ["0.10.0", "0.11.0"]],
      ]),
    );
  });
});

describe("checkedVersions", () => {
  const readers = new Map([
    ["0.55.0", ["0.55.0", "0.57.0", "0.59.0"]],
    ["0.60.0", ["0.60.0"]],
  ]);

  test("ends gives each folder's oldest and newest, naming a lone reader once", () => {
    expect(checkedVersions(readers, "ends")).toEqual(["0.55.0", "0.59.0", "0.60.0"]);
  });

  test("all gives every reader", () => {
    expect(checkedVersions(readers, "all")).toEqual(["0.55.0", "0.57.0", "0.59.0", "0.60.0"]);
  });

  test("refuses to give no version, which would pass on nothing", () => {
    expect(() => checkedVersions(new Map(), "ends")).toThrow(
      "no published CLI reads any data folder",
    );
  });
});

describe("parseScope", () => {
  test("--ends and --all select their scope", () => {
    expect(parseScope(["--ends"])).toBe("ends");
    expect(parseScope(["--all"])).toBe("all");
  });

  test("no flag, an unknown flag or both flags print the usage", () => {
    for (const args of [[], ["--every"], ["--ends", "--all"]]) {
      expect(() => parseScope(args)).toThrow("usage: cli-range.ts --ends | --all");
    }
  });
});
