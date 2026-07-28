import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readOpenApiTargets } from "./sync-openapi-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// nakama.nakama's recorded outcome is `no-go`: the REST swagger + realtime proto
// cannot cover the Lua client's hand-written helpers and socket wrappers, so the
// library STAYS ts-defold-sourced and the openapi goldens are a committed
// regeneration proof rather than a live surface. These assertions are the mirror
// image of the deftest/defcon `go`-branch migration-integrity checks.
describe("nakama.nakama openapi migration integrity (recorded no-go)", () => {
  const target = readOpenApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === "nakama.nakama");
  if (target === undefined) throw new Error("nakama.nakama openapi target missing");

  test("the recorded decision is no-go", () => {
    expect(target.decision).toBe("no-go");
  });

  test("nakama.nakama remains a ts-defold library-targets row", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "nakama.nakama")).toBe(true);
  });

  test("the nakama-defold dir stays in library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string; modules: string[] }[] };
    const nakama = dirs.find((d) => d.dir === "nakama-defold");
    expect(nakama?.modules).toContain("nakama.nakama");
  });

  test("the ts-defold fixture and its live generated golden are retained", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/nakama.nakama.d.ts"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "generated/nakama.nakama.d.ts"))).toBe(true);
  });

  test("the openapi goldens exist as a committed regeneration proof", () => {
    expect(existsSync(join(PACKAGE_ROOT, target.generated))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, target.apiDoc))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, target.fidelity))).toBe(true);
    // The proof lives under an `openapi/` subdir so it never shadows the live
    // ts-defold `generated/nakama.nakama.d.ts` docs-site page.
    expect(target.generated).toBe("generated/openapi/nakama.nakama.d.ts");
  });

  test("the pinned swagger + proto snapshots are committed", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.swagger.json"))).toBe(
      true,
    );
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.api.proto"))).toBe(true);
  });
});
