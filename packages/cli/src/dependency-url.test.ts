import { describe, expect, test } from "bun:test";
import {
  canFollow,
  classifyDependencyUrl,
  commitUrlFor,
  type DependencyUrlKind,
  rewriteGameProjectDependency,
} from "./dependency-url";
import { readExtensionDependencies } from "./extension-deps";

const COMMIT = "5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21";
const OTHER_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const REPO = "https://github.com/britzl/monarch";

describe("classifyDependencyUrl", () => {
  const cases: [string, DependencyUrlKind][] = [
    [`${REPO}/archive/${COMMIT}.zip`, "commit"],
    [`${REPO}/archive/refs/tags/x.zip`, "tag"],
    [`${REPO}/archive/refs/tags/v1.2/rc.zip`, "tag"],
    [`${REPO}/archive/v1.2.zip`, "tag"],
    [`${REPO}/archive/3.4.0.zip`, "tag"],
    [`${REPO}/archive/refs/heads/x.zip`, "branch"],
    [`${REPO}/archive/refs/heads/${COMMIT}.zip`, "branch"],
    [`${REPO}/archive/master.zip`, "branch"],
    [`${REPO}/archive/feature/thing.zip`, "branch"],
    [`${REPO}/releases/download/v1/asset.zip`, "release"],
    [`${REPO}/releases/latest/download/asset.zip`, "release"],
    [`https://__TOKEN__@github.com/britzl/monarch/archive/master.zip`, "branch"],
    [`http://github.com/britzl/monarch/archive/master.zip`, "branch"],
    ["https://gitlab.com/o/r/-/archive/main/r-main.zip", "unknown"],
    ["https://example.com/o/r/archive/master.zip", "unknown"],
    ["https://github.com.example.com/o/r/archive/master.zip", "unknown"],
    [`${REPO}/archive/master.tar.gz`, "unknown"],
    [`${REPO}/archive/master.zip?token=x`, "unknown"],
    [REPO, "unknown"],
    ["not a url", "unknown"],
  ];

  for (const [url, kind] of cases) {
    test(`${url} is ${kind}`, () => {
      expect(classifyDependencyUrl(url)).toBe(kind);
    });
  }
});

describe("commitUrlFor", () => {
  test("a branch and a tag name the commit in the same repo", () => {
    expect(commitUrlFor(`${REPO}/archive/master.zip`, COMMIT)).toBe(
      `${REPO}/archive/${COMMIT}.zip`,
    );
    expect(commitUrlFor(`${REPO}/archive/refs/tags/v1.zip`, COMMIT)).toBe(
      `${REPO}/archive/${COMMIT}.zip`,
    );
    expect(commitUrlFor(`${REPO}/archive/${OTHER_COMMIT}.zip`, COMMIT)).toBe(
      `${REPO}/archive/${COMMIT}.zip`,
    );
  });

  test("the scheme and authority stay, a token placeholder included", () => {
    expect(commitUrlFor("https://__TOKEN__@github.com/o/r/archive/main.zip", COMMIT)).toBe(
      `https://__TOKEN__@github.com/o/r/archive/${COMMIT}.zip`,
    );
    expect(commitUrlFor("http://github.com/o/r/archive/main.zip", COMMIT)).toBe(
      `http://github.com/o/r/archive/${COMMIT}.zip`,
    );
  });

  test("a release asset and any other host have no commit URL", () => {
    expect(commitUrlFor(`${REPO}/releases/download/v1/a.zip`, COMMIT)).toBeNull();
    expect(commitUrlFor("https://example.com/o/r/archive/main.zip", COMMIT)).toBeNull();
  });
});

describe("canFollow", () => {
  const pinned = `${REPO}/archive/${COMMIT}.zip`;

  test("a commit URL follows a branch or a tag of its own repo", () => {
    expect(canFollow(pinned, `${REPO}/archive/master.zip`)).toBe(true);
    expect(canFollow(pinned, `${REPO}/archive/refs/tags/v1.zip`)).toBe(true);
  });

  test("another repo, or a ref that cannot move, is not followed", () => {
    expect(canFollow(pinned, "https://github.com/evil/monarch/archive/master.zip")).toBe(false);
    expect(canFollow(pinned, "https://example.com/britzl/monarch/archive/master.zip")).toBe(false);
    expect(canFollow(pinned, `${REPO}/archive/${OTHER_COMMIT}.zip`)).toBe(false);
    expect(canFollow(pinned, `${REPO}/releases/download/v1/a.zip`)).toBe(false);
  });

  test("only a commit URL follows anything", () => {
    expect(canFollow(`${REPO}/archive/master.zip`, `${REPO}/archive/master.zip`)).toBe(false);
  });
});

describe("rewriteGameProjectDependency", () => {
  const url = `${REPO}/archive/master.zip`;
  const next = `${REPO}/archive/${COMMIT}.zip`;

  test("only that line's URL changes", () => {
    const text = [
      "[project]",
      "title = Game",
      `dependencies#0 = ${url}`,
      `dependencies#1 =   ${url}  `,
      "",
      "[display]",
      "width = 960",
      "",
    ].join("\n");

    expect(rewriteGameProjectDependency(text, 0, next)).toBe(
      text.replace(`dependencies#0 = ${url}`, `dependencies#0 = ${next}`),
    );
  });

  test("CRLF line endings stay, and the reader sees the same URLs", () => {
    const text = `[project]\r\ntitle = Game\r\ndependencies#0 = ${url}\r\ndependencies#1 = ${url}\r\n`;

    const rewritten = rewriteGameProjectDependency(text, 1, next);

    expect(rewritten).toBe(
      `[project]\r\ntitle = Game\r\ndependencies#0 = ${url}\r\ndependencies#1 = ${next}\r\n`,
    );
    expect(readExtensionDependencies(rewritten)).toEqual([
      { index: 0, url },
      { index: 1, url: next },
    ]);
  });

  test("a file with no final newline keeps none", () => {
    expect(rewriteGameProjectDependency(`[project]\ndependencies#0 = ${url}`, 0, next)).toBe(
      `[project]\ndependencies#0 = ${next}`,
    );
  });

  test("a URL outside [project] is left alone", () => {
    const text = `[library]\ndependencies#0 = ${url}\n[project]\ndependencies#1 = ${url}\n`;

    expect(rewriteGameProjectDependency(text, 0, next)).toBe(text);
  });

  test("an index nothing declares changes nothing", () => {
    const text = `[project]\ndependencies#0 = ${url}\n`;

    expect(rewriteGameProjectDependency(text, 7, next)).toBe(text);
  });
});
