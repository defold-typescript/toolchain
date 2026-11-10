import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROJECT_LOCK_FILE,
  type ProjectLock,
  readProjectLock,
  writeProjectLock,
} from "./project-lock";

const COMMIT = "4f1c9e0a2b7d6e8f3a5c1d9b0e7f2a6c8d4b3e1f";
const OTHER_COMMIT = "5c33c398a1b2c3d4e5f60718293a4b5c6d7e8f90";
const FILES = "a".repeat(64);
const OTHER_FILES = "b".repeat(64);
const FILES_PIN = { files: FILES };
const COMMIT_PIN = { commit: OTHER_COMMIT, files: OTHER_FILES };
const URL_A = "https://github.com/a/a/archive/main.zip";
const URL_B = "https://github.com/b/b/archive/main.zip";

function project(): string {
  return mkdtempSync(join(tmpdir(), "project-lock-"));
}

function seed(cwd: string, text: string): void {
  writeFileSync(join(cwd, PROJECT_LOCK_FILE), text);
}

function lockText(cwd: string): string {
  return readFileSync(join(cwd, PROJECT_LOCK_FILE), "utf8");
}

describe("readProjectLock", () => {
  test("an absent file reads as absent", () => {
    expect(readProjectLock(project())).toEqual({ status: "absent" });
  });

  test("a written lock reads back equal", () => {
    const cwd = project();
    const lock: ProjectLock = {
      extensions: { [URL_A]: COMMIT_PIN, [URL_B]: FILES_PIN },
      libraryData: {
        shared: COMMIT,
        libraries: {
          "git.acme.com-3000/games/monarch": COMMIT,
          "github.com/britzl/monarch": OTHER_COMMIT,
          "github.com/insality/druid": COMMIT,
        },
      },
    };
    writeProjectLock(cwd, lock);
    expect(readProjectLock(cwd)).toEqual({ status: "ok", lock });
  });

  test("a bare repo key an earlier CLI wrote still reads", () => {
    const cwd = project();
    const lock: ProjectLock = {
      extensions: {},
      libraryData: { shared: COMMIT, libraries: { monarch: COMMIT } },
    };
    writeProjectLock(cwd, lock);
    expect(readProjectLock(cwd)).toEqual({ status: "ok", lock });
  });

  test("a lock without a library data commit reads back equal", () => {
    const cwd = project();
    const lock: ProjectLock = { extensions: { [URL_A]: FILES_PIN } };
    writeProjectLock(cwd, lock);
    expect(readProjectLock(cwd)).toEqual({ status: "ok", lock });
  });

  const invalid: readonly (readonly [string, string, string])[] = [
    [
      "conflict markers",
      `<<<<<<< HEAD\n{ "version": 1 }\n=======\n{ "version": 1 }\n>>>>>>> branch\n`,
      "conflict markers",
    ],
    ["a non-object root", "[]", "object"],
    ["a null root", "null", "object"],
    ["an unknown version", JSON.stringify({ version: 2, extensions: {} }), '"version"'],
    ["a missing version", JSON.stringify({ extensions: {} }), '"version"'],
    [
      "a library data value that is not a map",
      JSON.stringify({ version: 1, extensions: {}, libraryData: COMMIT }),
      '"libraryData"',
    ],
    [
      "a shared pin that is not a commit",
      JSON.stringify({
        version: 1,
        extensions: {},
        libraryData: { shared: "../../x", libraries: {} },
      }),
      '"libraryData.shared"',
    ],
    [
      "library pins that are not a map",
      JSON.stringify({ version: 1, extensions: {}, libraryData: { shared: COMMIT } }),
      '"libraryData.libraries"',
    ],
    [
      "a library pin that is not a commit",
      JSON.stringify({
        version: 1,
        extensions: {},
        libraryData: { shared: COMMIT, libraries: { monarch: "../../x" } },
      }),
      "monarch",
    ],
    ...[
      "../../x",
      "../x",
      "../x/y",
      "a/..",
      "./a",
      "a/b/c/d",
      "a/../b",
      "git.acme.com:3000/games/monarch",
      "a\\b",
      "..",
      ".",
      "",
    ].map(
      (key) =>
        [
          `the library key ${JSON.stringify(key)}`,
          JSON.stringify({
            version: 1,
            extensions: {},
            libraryData: { shared: COMMIT, libraries: { [key]: COMMIT } },
          }),
          '"libraryData.libraries"',
        ] as const,
    ),
    [
      "extensions that are not a map",
      JSON.stringify({ version: 1, extensions: [] }),
      '"extensions"',
    ],
    ...(
      [
        ["a commit string", `commit:${COMMIT}`],
        ["a files string", `files-sha256:${FILES}`],
        ["a number", 7],
        ["a null", null],
        ["an array", [FILES]],
        ["a missing files hash", { commit: COMMIT }],
        ["a files hash that is not 64 hex", { files: "../../x" }],
        ["a files hash that is not a string", { files: 7 }],
        ["a commit that is not 40 hex", { commit: "../../x", files: FILES }],
        ["a commit that is not a string", { commit: 7, files: FILES }],
      ] as const
    ).map(
      ([name, entry]) =>
        [
          `an extensions entry holding ${name}`,
          JSON.stringify({ version: 1, extensions: { [URL_A]: entry } }),
          URL_A,
        ] as const,
    ),
  ];

  for (const [name, text, names] of invalid) {
    test(`${name} reads as invalid, naming the file and the offending key`, () => {
      const cwd = project();
      seed(cwd, text);
      const read = readProjectLock(cwd);
      expect(read.status).toBe("invalid");
      if (read.status !== "invalid") throw new Error("unreachable");
      expect(read.reason).toContain(PROJECT_LOCK_FILE);
      expect(read.reason).toContain(names);
      expect(lockText(cwd)).toBe(text);
    });
  }

  test("conflict markers point at the two ways out", () => {
    const cwd = project();
    seed(cwd, "<<<<<<< HEAD\n");
    const read = readProjectLock(cwd);
    if (read.status !== "invalid") throw new Error(`expected invalid, got ${read.status}`);
    expect(read.reason).toContain("delete the file");
  });
});

describe("a pin's followed ref", () => {
  const PINNED = `https://github.com/a/a/archive/${COMMIT}.zip`;
  const seedFollowing = (url: string, follows: unknown): string => {
    const cwd = project();
    seed(
      cwd,
      JSON.stringify({
        version: 1,
        extensions: { [url]: { commit: COMMIT, files: FILES, follows } },
      }),
    );
    return cwd;
  };

  test("it reads back as written, on the entry's own line", () => {
    const cwd = project();
    const pin = { commit: COMMIT, files: FILES, follows: URL_A };

    writeProjectLock(cwd, { extensions: { [PINNED]: pin } });

    expect(readProjectLock(cwd)).toEqual({ status: "ok", lock: { extensions: { [PINNED]: pin } } });
    expect(lockText(cwd)).toContain(
      `${JSON.stringify(PINNED)}: { "commit": "${COMMIT}", "files": "${FILES}", "follows": "${URL_A}" }`,
    );
  });

  test("a pin with no ref writes no field", () => {
    const cwd = project();

    writeProjectLock(cwd, { extensions: { [PINNED]: { commit: COMMIT, files: FILES } } });

    expect(lockText(cwd)).not.toContain("follows");
  });

  test.each<[string, string, unknown]>([
    ["a ref in another repo", PINNED, URL_B],
    ["a commit, which cannot move", PINNED, `https://github.com/a/a/archive/${OTHER_COMMIT}.zip`],
    ["a non-string", PINNED, 7],
    ["a ref on a URL that is not a commit", URL_A, URL_A],
    [
      "a ref that climbs out of the repo",
      PINNED,
      "https://github.com/a/a/archive/../../../attacker/fork/archive/main.zip",
    ],
    [
      "a ref that climbs out with encoded dots",
      PINNED,
      "https://github.com/a/a/archive/%2e%2e/%2E%2E/%2e%2e/attacker/fork/archive/main.zip",
    ],
  ])("%s is invalid and names the entry", (_label, url, follows) => {
    const read = readProjectLock(seedFollowing(url, follows));

    expect(read.status).toBe("invalid");
    expect(read.status === "invalid" ? read.reason : "").toContain(url);
  });

  test("a nested ref of the entry's own repo reads back", () => {
    const follows = "https://github.com/a/a/archive/refs/heads/feature/x.zip";

    expect(readProjectLock(seedFollowing(PINNED, follows)).status).toBe("ok");
  });
});

describe("writeProjectLock", () => {
  test("two inserts in either order give the same bytes", () => {
    const first = project();
    const second = project();
    writeProjectLock(first, { extensions: { [URL_A]: FILES_PIN, [URL_B]: FILES_PIN } });
    writeProjectLock(second, { extensions: { [URL_B]: FILES_PIN, [URL_A]: FILES_PIN } });
    expect(lockText(first)).toBe(lockText(second));
  });

  test("an entry's fields keep one order, however they arrive", () => {
    const first = project();
    const second = project();
    writeProjectLock(first, { extensions: { [URL_A]: { commit: COMMIT, files: FILES } } });
    writeProjectLock(second, { extensions: { [URL_A]: { files: FILES, commit: COMMIT } } });
    expect(lockText(first)).toBe(lockText(second));
  });

  test("a lock with no entries still parses", () => {
    const cwd = project();
    writeProjectLock(cwd, { extensions: {} });
    expect(readProjectLock(cwd)).toEqual({ status: "ok", lock: { extensions: {} } });
  });

  test("each entry has its own line and the file ends in a newline", () => {
    const cwd = project();
    writeProjectLock(cwd, {
      extensions: { [URL_B]: FILES_PIN, [URL_A]: COMMIT_PIN },
      libraryData: { shared: COMMIT, libraries: { monarch: COMMIT, druid: OTHER_COMMIT } },
    });
    expect(lockText(cwd)).toBe(
      [
        "{",
        '  "version": 1,',
        '  "extensions": {',
        `    "${URL_A}": { "commit": "${OTHER_COMMIT}", "files": "${OTHER_FILES}" },`,
        `    "${URL_B}": { "files": "${FILES}" }`,
        "  },",
        '  "libraryData": {',
        `    "shared": "${COMMIT}",`,
        '    "libraries": {',
        `      "druid": "${OTHER_COMMIT}",`,
        `      "monarch": "${COMMIT}"`,
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });

  test("a write whose bytes match the file leaves its mtime alone", () => {
    const cwd = project();
    const lock: ProjectLock = { extensions: { [URL_A]: FILES_PIN } };
    writeProjectLock(cwd, lock);
    const path = join(cwd, PROJECT_LOCK_FILE);
    const past = new Date(1_000_000_000_000);
    utimesSync(path, past, past);
    writeProjectLock(cwd, { extensions: { [URL_A]: FILES_PIN } });
    expect(statSync(path).mtimeMs).toBe(past.getTime());
  });

  test("a write that changes a value replaces the file and leaves no stage behind", () => {
    const cwd = project();
    writeProjectLock(cwd, { extensions: { [URL_A]: FILES_PIN } });
    const libraryData = { shared: COMMIT, libraries: {} };
    writeProjectLock(cwd, { extensions: {}, libraryData });
    expect(readProjectLock(cwd)).toEqual({
      status: "ok",
      lock: { extensions: {}, libraryData },
    });
    expect(readdirSync(cwd)).toEqual([PROJECT_LOCK_FILE]);
  });

  test("a write that fails partway throws and leaves the existing file whole", () => {
    const cwd = project();
    writeProjectLock(cwd, { extensions: { [URL_A]: FILES_PIN } });
    const before = lockText(cwd);
    mkdirSync(join(cwd, `${PROJECT_LOCK_FILE}.${process.pid}.partial`));
    expect(() => writeProjectLock(cwd, { extensions: { [URL_B]: FILES_PIN } })).toThrow();
    expect(lockText(cwd)).toBe(before);
  });
});
