import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const FORKED_GUIDE = resolve(
  REPO_ROOT,
  "packages",
  "docs",
  "guide",
  "authoring-forked-library-types.md",
);
const LIBRARY_DATA = resolve(REPO_ROOT, "packages", "library-types", "data");
const [NEWEST_DATA_FOLDER = ""] = readdirSync(LIBRARY_DATA).sort((a, b) =>
  b.localeCompare(a, "en", { numeric: true }),
);
const DATA_FOLDER = resolve(LIBRARY_DATA, NEWEST_DATA_FOLDER);
const ENTRY_HEADING = "## 1. Add a fork to the library's `library.json`";

function dottedNamespaces(): string[] {
  return readdirSync(DATA_FOLDER)
    .map((dir) => resolve(DATA_FOLDER, dir, "library.json"))
    .filter((file) => existsSync(file))
    .flatMap((file) => {
      const { forks = [] } = JSON.parse(readFileSync(file, "utf8")) as {
        forks?: { namespace: string }[];
      };
      return forks.map((fork) => fork.namespace);
    })
    .filter((ns) => ns.includes("."));
}

function entrySection(): string {
  const body = readFileSync(FORKED_GUIDE, "utf8");
  const start = body.indexOf(ENTRY_HEADING);
  expect(start).toBeGreaterThan(-1);
  const next = body.indexOf("\n## ", start + 1);
  return body.slice(start, next === -1 ? undefined : next);
}

describe("docs/guide worked values against production data", () => {
  test("the dotted-namespace rule names a namespace a library's forks really ship", () => {
    const dotted = dottedNamespaces();
    expect(dotted.length).toBeGreaterThan(0);
    const section = entrySection();
    expect(dotted.some((ns) => section.includes(ns))).toBe(true);
  });
});
