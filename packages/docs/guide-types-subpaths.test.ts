import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PKG_DIR = resolve(import.meta.dir);
const GUIDE = join(PKG_DIR, "guide");
const TYPES_PKG = "@defold-typescript/types";
// Not a dependency of this package, so it is reached the same way
// `llms-links.test.ts` reaches it: as the workspace sibling on disk.
const TYPES_ROOT = resolve(PKG_DIR, "..", "types");

/** The subpaths the types package's own `exports` map publishes. */
function exportedSubpaths(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(TYPES_ROOT, "package.json"), "utf8")) as {
    exports?: Record<string, unknown>;
  };
  return new Set(
    Object.keys(pkg.exports ?? {}).map((key) => key.replace(/^\.\/?/, "").replace(/\/$/, "")),
  );
}

// A guide may cite either a published subpath (`/script`, which the exports map
// aliases to a generated `.d.ts`) or a real path inside the package (`/src/`,
// `/generated/factory.d.ts`), both of which the package ships. Anything that is
// neither is a path a reader cannot follow.
function resolvesUnderTypes(subpath: string, exported: Set<string>): boolean {
  if (subpath === "") return true;
  if (exported.has(subpath)) return true;
  return existsSync(join(TYPES_ROOT, subpath));
}

function mentions(): { page: string; subpath: string }[] {
  const out: { page: string; subpath: string }[] = [];
  for (const page of readdirSync(GUIDE).filter((f) => f.endsWith(".md"))) {
    const body = readFileSync(join(GUIDE, page), "utf8");
    for (const match of body.matchAll(/@defold-typescript\/types([A-Za-z0-9/_.-]*)/g)) {
      const raw = match[1] ?? "";
      // Trailing sentence punctuation is prose, not part of the path.
      const subpath = raw.replace(/^\//, "").replace(/[.]$/, "");
      out.push({ page, subpath });
    }
  }
  return out;
}

describe("guide references to the types package", () => {
  const exported = exportedSubpaths();

  test("every cited subpath is published or present in the package", () => {
    const unresolved = mentions().filter((m) => !resolvesUnderTypes(m.subpath, exported));
    if (unresolved.length > 0) {
      throw new Error(
        `guide cites types subpaths that do not resolve:\n${unresolved
          .map((u) => `  ${u.page} -> ${TYPES_PKG}/${u.subpath}`)
          .join("\n")}`,
      );
    }
    expect(unresolved).toEqual([]);
  });

  test("the guard inspected both alias subpaths and on-disk paths", () => {
    const all = mentions();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((m) => exported.has(m.subpath) && m.subpath !== "")).toBe(true);
    expect(all.some((m) => m.subpath !== "" && !exported.has(m.subpath))).toBe(true);
  });

  test("a subpath the package neither publishes nor holds is rejected", () => {
    expect(resolvesUnderTypes("editor-script", exported)).toBe(false);
    expect(resolvesUnderTypes("not-a-real-entrypoint", exported)).toBe(false);
  });

  test("the exports map is read from the package, not listed here", () => {
    expect(exported.size).toBeGreaterThan(1);
    expect(exported.has("script")).toBe(true);
  });
});
