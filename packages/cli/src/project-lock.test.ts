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
const FILES_PIN = `files-sha256:${"a".repeat(64)}`;
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
      extensions: { [URL_A]: `commit:${OTHER_COMMIT}`, [URL_B]: FILES_PIN },
      libraryData: COMMIT,
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
      "a library data value that is not a commit",
      JSON.stringify({ version: 1, extensions: {}, libraryData: "../../x" }),
      '"libraryData"',
    ],
    [
      "extensions that are not a map",
      JSON.stringify({ version: 1, extensions: [] }),
      '"extensions"',
    ],
    [
      "a pin in the zip-byte form",
      JSON.stringify({ version: 1, extensions: { [URL_A]: `sha256:${"a".repeat(64)}` } }),
      URL_A,
    ],
    [
      "a pin that is not a string",
      JSON.stringify({ version: 1, extensions: { [URL_A]: 7 } }),
      URL_A,
    ],
    [
      "a commit pin that is not 40 hex",
      JSON.stringify({ version: 1, extensions: { [URL_A]: "commit:../../x" } }),
      URL_A,
    ],
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

describe("writeProjectLock", () => {
  test("two inserts in either order give the same bytes", () => {
    const first = project();
    const second = project();
    writeProjectLock(first, { extensions: { [URL_A]: FILES_PIN, [URL_B]: FILES_PIN } });
    writeProjectLock(second, { extensions: { [URL_B]: FILES_PIN, [URL_A]: FILES_PIN } });
    expect(lockText(first)).toBe(lockText(second));
  });

  test("each entry has its own line and the file ends in a newline", () => {
    const cwd = project();
    writeProjectLock(cwd, {
      extensions: { [URL_B]: FILES_PIN, [URL_A]: `commit:${OTHER_COMMIT}` },
      libraryData: COMMIT,
    });
    expect(lockText(cwd)).toBe(
      [
        "{",
        '  "version": 1,',
        '  "extensions": {',
        `    "${URL_A}": "commit:${OTHER_COMMIT}",`,
        `    "${URL_B}": "${FILES_PIN}"`,
        "  },",
        `  "libraryData": "${COMMIT}"`,
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
    writeProjectLock(cwd, { extensions: {}, libraryData: COMMIT });
    expect(readProjectLock(cwd)).toEqual({
      status: "ok",
      lock: { extensions: {}, libraryData: COMMIT },
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
