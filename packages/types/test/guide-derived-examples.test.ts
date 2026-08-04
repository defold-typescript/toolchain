import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const FORKED_GUIDE = resolve(
  REPO_ROOT,
  "packages",
  "docs",
  "guide",
  "authoring-forked-library-types.md",
);
const AUTHORED_TARGETS = resolve(REPO_ROOT, "packages", "library-types", "authored-targets.json");
const ENTRY_HEADING = "## 1. Add an `authored-targets.json` entry";

function dottedNamespaces(): string[] {
  const raw = JSON.parse(readFileSync(AUTHORED_TARGETS, "utf8")) as {
    targets: { namespace: string }[];
  };
  return raw.targets.map((t) => t.namespace).filter((ns) => ns.includes("."));
}

function entrySection(): string {
  const body = readFileSync(FORKED_GUIDE, "utf8");
  const start = body.indexOf(ENTRY_HEADING);
  expect(start).toBeGreaterThan(-1);
  const next = body.indexOf("\n## ", start + 1);
  return body.slice(start, next === -1 ? undefined : next);
}

describe("docs/guide worked values against production data", () => {
  test("the dotted-namespace rule names a namespace authored-targets.json really ships", () => {
    const dotted = dottedNamespaces();
    expect(dotted.length).toBeGreaterThan(0);
    const section = entrySection();
    expect(dotted.some((ns) => section.includes(ns))).toBe(true);
  });
});
