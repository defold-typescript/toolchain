import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findDanglingReferences } from "./reference-audit";

const REPO_ROOT = join(import.meta.dir, "../../../..");
const GUIDE_DIR = join(REPO_ROOT, "packages/docs/guide");

const fixtureDir = mkdtempSync(join(tmpdir(), "reference-audit-"));
afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

writeFileSync(
  join(fixtureDir, "target.md"),
  "# Target\n\n## First Section\n\nbody\n\n### Nested Heading\n\nmore\n",
);

describe("findDanglingReferences — relative .md links", () => {
  test("a link to an existing sibling with a valid anchor is clean", () => {
    const text = "See [first](./target.md#first-section) and [nested](./target.md#nested-heading).";
    expect(findDanglingReferences(text, fixtureDir, REPO_ROOT)).toEqual([]);
  });

  test("a link to a missing .md file is reported", () => {
    const text = "See [gone](./does-not-exist.md).";
    const out = findDanglingReferences(text, fixtureDir, REPO_ROOT);
    expect(out.length).toBe(1);
    expect(out[0]?.reference).toBe("./does-not-exist.md");
    expect(out[0]?.reason).toContain("does-not-exist.md");
  });

  test("a link to an existing file but a missing anchor is reported", () => {
    const text = "See [bad](./target.md#no-such-heading).";
    const out = findDanglingReferences(text, fixtureDir, REPO_ROOT);
    expect(out.length).toBe(1);
    expect(out[0]?.reference).toBe("./target.md#no-such-heading");
    expect(out[0]?.reason).toContain("no-such-heading");
  });

  test("external, root-absolute, and bare-fragment links are ignored", () => {
    const text =
      "[ext](https://example.com/x.md) [abs](/foo.md) [frag](#first-section) [code](`x`)";
    expect(findDanglingReferences(text, fixtureDir, REPO_ROOT)).toEqual([]);
  });
});

describe("findDanglingReferences — backtick repo paths", () => {
  test("an existing repo path is clean", () => {
    const text = "See `packages/docs-site/app/lib/headings.ts` for the slugifier.";
    expect(findDanglingReferences(text, fixtureDir, REPO_ROOT)).toEqual([]);
  });

  test("a non-existent repo path is reported", () => {
    const text = "See `packages/does-not-exist/foo.ts`.";
    const out = findDanglingReferences(text, fixtureDir, REPO_ROOT);
    expect(out.length).toBe(1);
    expect(out[0]?.reference).toBe("packages/does-not-exist/foo.ts");
  });

  test("a backtick that is not a repo path is ignored", () => {
    const text = "Call `go.get_position` and `bun run build`.";
    expect(findDanglingReferences(text, fixtureDir, REPO_ROOT)).toEqual([]);
  });

  test("a trailing-slash directory path is checked as a directory", () => {
    const text = "Look in `packages/docs-site/app/`.";
    expect(findDanglingReferences(text, fixtureDir, REPO_ROOT)).toEqual([]);
  });
});

describe("corpus guard", () => {
  test("no guide file carries a dangling internal reference", async () => {
    const { Glob } = await import("bun");
    const files = await Array.fromAsync(new Glob("*.md").scan({ cwd: GUIDE_DIR, absolute: true }));
    const danglers = files.flatMap((file) =>
      findDanglingReferences(readFileSync(file, "utf8"), dirname(file), REPO_ROOT).map((d) => ({
        ...d,
        file,
      })),
    );
    expect(danglers).toEqual([]);
  });
});
