import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { readNativeTargets } from "../packages/library-types/scripts/sync-native-types.ts";
import {
  CURATED_NATIVE_END,
  CURATED_NATIVE_START,
  curatedNativeTable,
  LIBRARY_TYPES_ROOT,
  RESOLVE_GUIDE,
  syncGuideTables,
} from "./sync-guide-tables.ts";

const HEADER = "| Extension | Pinned at | Namespace | Confirmed by        |";
const SEPARATOR = "| --------- | --------- | --------- | ------------------- |";

const TAGGED = {
  repo: "https://github.com/a/defold-x",
  ref: "v1.2",
  namespace: "x",
  manifestDir: "x",
};
const TAGGED_ROW =
  "| [a/defold-x](https://github.com/a/defold-x) | `v1.2` | [`x`](/api/x) | `x/ext.manifest` |";

const COMMIT = {
  repo: "https://github.com/b/defold-y",
  ref: "0123456789abcdef0123456789abcdef01234567",
  refKind: "commit" as const,
  namespace: "y",
  manifestDir: "y/native",
};
const COMMIT_ROW =
  "| [b/defold-y](https://github.com/b/defold-y) | `0123456` | [`y`](/api/y) | `y/native/ext.manifest` |";

describe("curatedNativeTable", () => {
  test("renders the guide's header and separator, then one row per target in input order", () => {
    expect(curatedNativeTable([COMMIT, TAGGED])).toBe(
      [HEADER, SEPARATOR, COMMIT_ROW, TAGGED_ROW].join("\n"),
    );
  });

  test("a tag-pinned target shows its full ref, owner/repo link, api link, and manifest", () => {
    expect(curatedNativeTable([TAGGED]).split("\n")[2]).toBe(TAGGED_ROW);
  });

  test("a commit-pinned target shows the first seven characters of its SHA", () => {
    expect(curatedNativeTable([COMMIT]).split("\n")[2]).toBe(COMMIT_ROW);
  });

  test("the manifest path comes from manifestDir, not the namespace", () => {
    const row = curatedNativeTable([{ ...TAGGED, manifestDir: "x/native" }]).split("\n")[2];
    expect(row).toBe(
      "| [a/defold-x](https://github.com/a/defold-x) | `v1.2` | [`x`](/api/x) | `x/native/ext.manifest` |",
    );
  });
});

describe("syncGuideTables", () => {
  test("replaces only the lines between the markers", () => {
    const text = [
      "# Guide",
      "",
      "Before.",
      "",
      CURATED_NATIVE_START,
      "| stale |",
      CURATED_NATIVE_END,
      "",
      "After.",
      "",
    ].join("\n");

    expect(syncGuideTables(text, [TAGGED])).toBe(
      [
        "# Guide",
        "",
        "Before.",
        "",
        CURATED_NATIVE_START,
        "",
        HEADER,
        SEPARATOR,
        TAGGED_ROW,
        "",
        CURATED_NATIVE_END,
        "",
        "After.",
        "",
      ].join("\n"),
    );
  });

  test("throws naming the start marker when it is absent", () => {
    expect(() => syncGuideTables(`text\n${CURATED_NATIVE_END}\n`, [TAGGED])).toThrow(
      CURATED_NATIVE_START,
    );
  });

  test("throws naming the end marker when it is absent", () => {
    expect(() => syncGuideTables(`${CURATED_NATIVE_START}\ntext\n`, [TAGGED])).toThrow(
      CURATED_NATIVE_END,
    );
  });
});

describe("resolve guide drift guard", () => {
  test("the committed resolve guide lists exactly the shipped native targets", () => {
    const committed = readFileSync(RESOLVE_GUIDE, "utf8");
    const fresh = syncGuideTables(committed, readNativeTargets(LIBRARY_TYPES_ROOT));
    if (committed !== fresh) {
      throw new Error(
        "packages/docs/guide/resolve.md is stale — run `bun scripts/sync-guide-tables.ts --write`",
      );
    }
    expect(committed).toBe(fresh);
  });
});
