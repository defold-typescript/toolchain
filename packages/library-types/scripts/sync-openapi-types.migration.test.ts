import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readOpenApiTargets } from "./sync-openapi-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// nakama.nakama's recorded outcome is `no-go`: the REST swagger + realtime proto
// cannot cover the Lua client's hand-written helpers and socket wrappers, so the
// openapi goldens are a committed regeneration proof rather than a live surface.
// That verdict is about the *generation source*, not about which lane owns the
// module: the library has since severed onto the authored lane, where the
// snapshot the verdict was derived from now lives as a verbatim fork. These
// assertions are the mirror image of the deftest/defcon `go`-branch
// migration-integrity checks.
describe("nakama.nakama openapi migration integrity (recorded no-go)", () => {
  const target = readOpenApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === "nakama.nakama");
  if (target === undefined) throw new Error("nakama.nakama openapi target missing");

  test("the recorded decision is no-go", () => {
    expect(target.decision).toBe("no-go");
  });

  test("nakama.nakama is no longer a ts-defold library-targets row, and none remain", () => {
    const { targets } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.some((t) => t.module === "nakama.nakama")).toBe(false);
    expect(targets).toEqual([]);
  });

  test("the nakama-defold dir is gone from library-classification.json", () => {
    const { dirs } = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string; modules: string[] }[] };
    expect(dirs.some((d) => d.dir === "nakama-defold")).toBe(false);
    expect(dirs.flatMap((d) => d.modules)).not.toContain("nakama.nakama");
  });

  test("the ts-defold fixture and dotted golden gave way to the authored fork", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/nakama.nakama.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/nakama.nakama.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/authored/nakama.nakama.d.ts"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "generated/nakama.d.ts"))).toBe(true);
  });

  test("the openapi goldens exist as a committed regeneration proof", () => {
    expect(existsSync(join(PACKAGE_ROOT, target.generated))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, target.apiDoc))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, target.fidelity))).toBe(true);
    // The proof lives under an `openapi/` subdir so it never shadows the
    // authored `generated/nakama.d.ts` docs-site page, which is what the
    // canonical path holds now that the bare namespace is the module's own.
    expect(target.generated).toBe("generated/openapi/nakama.nakama.d.ts");
  });

  test("the pinned swagger + proto snapshots are committed", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.swagger.json"))).toBe(
      true,
    );
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.api.proto"))).toBe(true);
  });
});
