import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ContainedPathError,
  containmentProblem,
  firstLinkOnPath,
  removeContained,
  writeContainedFile,
} from "./contained-fs";
import { canLinkFiles, linkDir, linkFile } from "./symlink.test-support";

let tmp: string;
let proj: string;
let outside: string;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "defold-typescript-contained-")));
  proj = path.join(tmp, "proj");
  outside = path.join(tmp, "outside");
  mkdirSync(path.join(proj, "src"), { recursive: true });
  mkdirSync(outside, { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function linkText(rel: string): string {
  return readlinkSync(path.join(proj, rel));
}

describe("containmentProblem", () => {
  test("a path under a folder that does not exist yet is accepted", () => {
    expect(containmentProblem(proj, "src/a/b.lua")).toBeUndefined();
  });

  test("a project reached through a folder link is accepted when the path holds no link", () => {
    const root = path.join(tmp, "root");
    linkDir(proj, root);

    expect(containmentProblem(root, "src/a/b.lua")).toBeUndefined();
  });

  test.skipIf(!canLinkFiles)("a dangling link at the destination is refused", () => {
    linkFile("../../outside/new.txt", path.join(proj, "src/levels.lua"));

    const problem = containmentProblem(proj, "src/levels.lua");

    expect(problem).toContain("src/levels.lua");
    expect(problem).toContain(linkText("src/levels.lua"));
  });

  test.skipIf(!canLinkFiles)(
    "a link at the destination is refused even when it stays inside",
    () => {
      writeFileSync(path.join(proj, "src/shared.lua"), "return {}\n");
      linkFile("shared.lua", path.join(proj, "src/levels.lua"));

      expect(containmentProblem(proj, "src/levels.lua")).toContain("src/levels.lua");
    },
  );

  test("a folder link leading outside the project is refused and named", () => {
    linkDir(path.join("..", "outside"), path.join(proj, "build"));

    const problem = containmentProblem(proj, "build/main.lua");

    expect(problem).toContain("build/main.lua");
    expect(problem).toContain(" build, ");
    expect(problem).toContain(linkText("build"));
  });

  test("a folder link that stays inside the project is accepted", () => {
    mkdirSync(path.join(proj, "real-build"));
    linkDir("real-build", path.join(proj, "build"));

    expect(containmentProblem(proj, "build/main.lua")).toBeUndefined();
  });

  test.each(["../x.lua", "/x.lua", "C:/x.lua"])("%s is outside the project folder", (target) => {
    expect(containmentProblem(proj, target)).toContain("outside the project folder");
  });
});

describe("writeContainedFile", () => {
  test("a refused path throws and writes nothing at the link's target", () => {
    linkDir(path.join("..", "outside"), path.join(proj, "build"));

    expect(() => writeContainedFile(proj, "build/main.lua", "return 1\n")).toThrow(
      ContainedPathError,
    );
    expect(existsSync(path.join(outside, "main.lua"))).toBe(false);
  });

  test.skipIf(!canLinkFiles)("a dangling link is not followed to create its target", () => {
    linkFile("../../outside/new.txt", path.join(proj, "src/levels.lua"));

    expect(() => writeContainedFile(proj, "src/levels.lua", "return 1\n")).toThrow(
      ContainedPathError,
    );
    expect(existsSync(path.join(outside, "new.txt"))).toBe(false);
  });

  test("an accepted path is written, and the same text again leaves it untouched", () => {
    writeContainedFile(proj, "src/a/b.lua", "return 1\n");
    const abs = path.join(proj, "src/a/b.lua");
    expect(readFileSync(abs, "utf8")).toBe("return 1\n");

    const past = new Date(Date.now() - 60_000);
    utimesSync(abs, past, past);
    const before = statSync(abs).mtimeMs;
    writeContainedFile(proj, "src/a/b.lua", "return 1\n");

    expect(statSync(abs).mtimeMs).toBe(before);
  });
});

describe("removeContained", () => {
  test("a removal through a folder link leading outside throws and keeps the file", () => {
    writeFileSync(path.join(outside, "old.lua"), "precious\n");
    linkDir(path.join("..", "outside"), path.join(proj, "build"));

    expect(() => removeContained(proj, "build/old.lua")).toThrow(ContainedPathError);
    expect(existsSync(path.join(outside, "old.lua"))).toBe(true);
  });
});

describe("firstLinkOnPath", () => {
  test("names the link nearest the root and its text", () => {
    mkdirSync(path.join(proj, "real-build", "inner"), { recursive: true });
    linkDir("real-build", path.join(proj, "build"));

    expect(firstLinkOnPath(proj, "build/inner/main.lua")).toEqual({
      linkRel: "build",
      text: linkText("build"),
    });
    expect(firstLinkOnPath(proj, "src/main.lua")).toBeUndefined();
  });
});

// Windows reads a backslash as a separator, so no such name exists there.
describe("a backslash in a name on macOS and Linux", () => {
  const posixOnly = test.skipIf(process.platform === "win32");

  posixOnly("a folder link with a backslash in its name is checked like any other", () => {
    linkDir(path.join("..", "outside"), path.join(proj, "build\\output"));

    const problem = containmentProblem(proj, "build\\output/main.lua");

    expect(problem).toContain("build\\output/main.lua");
    expect(problem).toContain(" build\\output, ");
    expect(problem).toContain(linkText("build\\output"));
  });

  posixOnly("a write through that link throws and writes nothing outside", () => {
    linkDir(path.join("..", "outside"), path.join(proj, "build\\output"));

    expect(() => writeContainedFile(proj, "build\\output/main.lua", "return 1\n")).toThrow(
      ContainedPathError,
    );
    expect(existsSync(path.join(outside, "main.lua"))).toBe(false);
  });

  posixOnly("a removal through that link throws and keeps the file", () => {
    writeFileSync(path.join(outside, "old.lua"), "precious\n");
    linkDir(path.join("..", "outside"), path.join(proj, "build\\output"));

    expect(() => removeContained(proj, "build\\output/old.lua")).toThrow(ContainedPathError);
    expect(existsSync(path.join(outside, "old.lua"))).toBe(true);
  });

  posixOnly("a dangling file link with a backslash in its name is refused", () => {
    linkFile("../../outside/new.txt", path.join(proj, "src/a\\b.lua"));

    expect(() => writeContainedFile(proj, "src/a\\b.lua", "return 1\n")).toThrow("src/a\\b.lua");
    expect(existsSync(path.join(outside, "new.txt"))).toBe(false);
  });

  posixOnly("an accepted write lands at the name the caller gave", () => {
    mkdirSync(path.join(proj, "real-build"));
    linkDir("real-build", path.join(proj, "build\\output"));

    writeContainedFile(proj, "build\\output/main.lua", "return 1\n");

    expect(readFileSync(path.join(proj, "real-build", "main.lua"), "utf8")).toBe("return 1\n");
    expect(existsSync(path.join(proj, "build"))).toBe(false);
  });

  posixOnly("firstLinkOnPath names the link with its backslash", () => {
    linkDir(path.join("..", "outside"), path.join(proj, "build\\output"));

    expect(firstLinkOnPath(proj, "build\\output/main.lua")).toEqual({
      linkRel: "build\\output",
      text: linkText("build\\output"),
    });
  });
});
