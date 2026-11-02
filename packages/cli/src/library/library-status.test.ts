import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionZip } from "../extension-archive";
import type { LibraryReview } from "./library-data";
import {
  archiveFingerprint,
  FINGERPRINT_VERSION,
  type LibraryFingerprint,
  recordReview,
} from "./library-fingerprint";
import { classifyLibraryStatus, newerFolderCovering } from "./library-status";

const GAME_PROJECT = "[project]\ntitle = mylib\n\n[library]\ninclude_dirs = mylib\n";
const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const COMMIT_C = "c".repeat(40);
const LUA_PATH = "mylib/mylib.lua";

function moduleWith(...names: readonly string[]): string {
  const functions = names.map((name) => `function M.${name}()\n  return true\nend\n`);
  return ["local M = {}", "", ...functions, "return M", ""].join("\n");
}

function fingerprintOf(source: string): LibraryFingerprint {
  const contents = new Map([
    ["mylib-main/game.project", GAME_PROJECT],
    [`mylib-main/${LUA_PATH}`, source],
  ]);
  const zip: ExtensionZip = {
    entries: () => ["mylib-main/", ...contents.keys()],
    read: (entry) => contents.get(entry) ?? "",
    bytes: (entry) => new TextEncoder().encode(contents.get(entry) ?? ""),
    comment: () => "",
  };
  return archiveFingerprint(zip);
}

const reviewed = (
  ...records: readonly (readonly [LibraryFingerprint, string | undefined])[]
): LibraryReview[] =>
  records.reduce<LibraryReview[]>(
    (reviews, [fingerprint, commit]) => recordReview(reviews, fingerprint, commit).reviews,
    [],
  );

const memberKey = (name: string) => `${LUA_PATH}#${name}`;
const BASE = fingerprintOf(moduleWith("start", "stop"));
const CHANGED = fingerprintOf(moduleWith("start", "stop", "pause"));

const classify = (input: Partial<Parameters<typeof classifyLibraryStatus>[0]>) =>
  classifyLibraryStatus({
    reviews: [],
    commit: COMMIT_B,
    fingerprint: CHANGED,
    printedFrom: ["archive"],
    newerFolder: null,
    ...input,
  });

describe("classifyLibraryStatus", () => {
  test("a commit any review lists is exact, whatever that review's version or api", () => {
    const [review] = reviewed([BASE, COMMIT_B]);
    const older = { ...(review as LibraryReview), version: FINGERPRINT_VERSION + 1 };

    expect(classify({ reviews: [older], commit: COMMIT_B, fingerprint: CHANGED })).toEqual({
      status: "exact",
      by: "commit",
    });
  });

  test("an unlisted commit whose api a current review holds is exact by api", () => {
    const reviews = reviewed([BASE, COMMIT_A]);

    expect(classify({ reviews, commit: COMMIT_B, fingerprint: BASE })).toEqual({
      status: "exact",
      by: "api",
    });
  });

  test("no commit at all can still be exact by api", () => {
    const reviews = reviewed([BASE, COMMIT_A]);

    expect(classify({ reviews, commit: undefined, fingerprint: BASE })).toEqual({
      status: "exact",
      by: "api",
    });
  });

  test("a matching api on a review of another version does not count", () => {
    const [review] = reviewed([BASE, COMMIT_A]);
    const reviews = [{ ...(review as LibraryReview), version: FINGERPRINT_VERSION + 1 }];

    expect(classify({ reviews, commit: COMMIT_B, fingerprint: BASE })).toEqual({
      status: "generated",
    });
  });

  test("not exact with a newer folder is newer-cli, ahead of every other status", () => {
    for (const input of [
      { reviews: null },
      { printedFrom: ["archive"] as const },
      { printedFrom: ["pinned"] as const },
    ]) {
      expect(classify({ ...input, newerFolder: "0.60.0" })).toEqual({
        status: "newer-cli",
        folder: "0.60.0",
      });
    }
  });

  test("an exact library stays exact when a newer folder also covers it", () => {
    const reviews = reviewed([BASE, COMMIT_A]);

    expect(classify({ reviews, commit: COMMIT_A, newerFolder: "0.60.0" })).toEqual({
      status: "exact",
      by: "commit",
    });
  });

  test("not exact with no recorded reviews is unrecorded, ahead of how it printed", () => {
    for (const from of ["archive", "pinned"] as const) {
      expect(classify({ reviews: null, printedFrom: [from] })).toEqual({ status: "unrecorded" });
    }
  });

  test("not exact with every module printed from the archive is generated", () => {
    expect(classify({ printedFrom: ["archive", "archive"] })).toEqual({ status: "generated" });
  });

  test("not exact with any module printed from the pinned sources is unsupported", () => {
    expect(classify({ printedFrom: ["archive", "pinned"] }).status).toBe("unsupported");
  });

  test("a library this run printed nothing for claims no generated types", () => {
    expect(classify({ printedFrom: [] }).status).toBe("unsupported");
  });

  test("unsupported names the closest review's newest commit and every differing member", () => {
    const far = fingerprintOf(moduleWith("a", "b", "c"));
    const near = fingerprintOf(moduleWith("start", "stop", "extra"));
    const reviews = reviewed([far, COMMIT_A], [near, COMMIT_A], [near, COMMIT_C]);

    expect(classify({ reviews, fingerprint: CHANGED, printedFrom: ["pinned"] })).toEqual({
      status: "unsupported",
      closest: COMMIT_C,
      members: [memberKey("extra"), memberKey("pause")],
    });
  });

  test("members lists a changed key as well as an added and a removed one", () => {
    const changedParams = fingerprintOf(
      [
        "local M = {}",
        "function M.start(speed)\n  return true\nend",
        "function M.pause()\n  return true\nend",
        "return M",
        "",
      ].join("\n"),
    );
    const reviews = reviewed([BASE, COMMIT_A]);

    expect(classify({ reviews, fingerprint: changedParams, printedFrom: ["pinned"] })).toEqual({
      status: "unsupported",
      closest: COMMIT_A,
      members: [memberKey("pause"), memberKey("start"), memberKey("stop")],
    });
  });

  test("the later of two equally close reviews wins", () => {
    const left = fingerprintOf(moduleWith("start", "stop", "left"));
    const right = fingerprintOf(moduleWith("start", "stop", "right"));
    const reviews = reviewed([left, COMMIT_A], [right, COMMIT_C]);

    expect(classify({ reviews, fingerprint: BASE, printedFrom: ["pinned"] })).toEqual({
      status: "unsupported",
      closest: COMMIT_C,
      members: [memberKey("right")],
    });
  });

  test("a review of another version is not comparable", () => {
    const [review] = reviewed([BASE, COMMIT_A]);
    const reviews = [{ ...(review as LibraryReview), version: FINGERPRINT_VERSION + 1 }];

    expect(classify({ reviews, printedFrom: ["pinned"] })).toEqual({
      status: "unsupported",
      closest: null,
      members: [],
    });
  });

  test("unsupported with no reviews at all has no closest and no members", () => {
    expect(classify({ reviews: [], printedFrom: ["pinned"] })).toEqual({
      status: "unsupported",
      closest: null,
      members: [],
    });
  });
});

describe("newerFolderCovering", () => {
  const root = mkdtempSync(join(tmpdir(), "library-status-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function writeReviewed(folder: string, library: string, text: string): void {
    mkdirSync(join(root, folder, library), { recursive: true });
    writeFileSync(join(root, folder, library, "reviewed.json"), text);
  }
  const reviewedJson = (reviews: unknown) => JSON.stringify({ ref: "1.0.0", reviews });

  writeReviewed("0.55.0", "current", reviewedJson(reviewed([BASE, COMMIT_A])));
  writeReviewed("0.60.0", "bycommit", reviewedJson(reviewed([BASE, COMMIT_A])));
  writeReviewed("0.70.0", "bycommit", reviewedJson(reviewed([BASE, COMMIT_A])));
  writeReviewed("0.60.0", "byapi", reviewedJson(reviewed([CHANGED, COMMIT_C])));
  writeReviewed("0.60.0", "broken", "{ not json");
  writeReviewed("0.70.0", "broken", reviewedJson(reviewed([BASE, COMMIT_A])));
  writeReviewed("0.60.0", "shaped", reviewedJson([{ commits: "nope" }, 3, null]));
  writeReviewed(
    "0.60.0",
    "otherversion",
    reviewedJson(
      reviewed([CHANGED, COMMIT_C]).map((review) => ({
        ...review,
        version: FINGERPRINT_VERSION + 1,
      })),
    ),
  );

  const covering = (library: string, commit: string | undefined, fingerprint = CHANGED) =>
    newerFolderCovering(root, "0.55.0", library, commit, fingerprint);

  test("names the lowest higher folder that lists the commit", () => {
    expect(covering("bycommit", COMMIT_A)).toBe("0.60.0");
  });

  test("a higher folder holding the api covers it", () => {
    expect(covering("byapi", COMMIT_B)).toBe("0.60.0");
  });

  test("ignores the folder the CLI already reads", () => {
    expect(covering("current", COMMIT_A)).toBeNull();
  });

  test("a malformed reviewed.json is skipped, and a later folder can still cover", () => {
    expect(covering("broken", COMMIT_A)).toBe("0.70.0");
    expect(covering("broken", COMMIT_B)).toBeNull();
  });

  test("entries in a shape this CLI cannot read cover nothing", () => {
    expect(covering("shaped", COMMIT_B)).toBeNull();
  });

  test("an api recorded under another fingerprint version does not cover", () => {
    expect(covering("otherversion", COMMIT_B)).toBeNull();
  });

  test("a library no higher folder holds is covered by none", () => {
    expect(covering("missing", COMMIT_A)).toBeNull();
  });
});
