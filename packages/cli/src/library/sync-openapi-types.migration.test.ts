import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LANE_EVALUATIONS_ROOT } from "./lane-evaluations";
import { readOpenApiTargets } from "./sync-openapi-types";

// nakama.nakama's recorded outcome is `no-go`: the REST swagger + realtime proto
// cannot cover the Lua client's hand-written helpers and socket wrappers, so the
// openapi goldens are a committed regeneration proof rather than a live surface.
// That verdict is about the *generation source*, not about which lane owns the
// module: the library has since severed onto the authored lane, where the
// snapshot the verdict was derived from now lives as a verbatim fork. These
// assertions are the mirror image of the deftest/defcon `go`-branch
// migration-integrity checks.
describe("nakama.nakama openapi migration integrity (recorded no-go)", () => {
  const target = readOpenApiTargets(LANE_EVALUATIONS_ROOT).find(
    (t) => t.moduleId === "nakama.nakama",
  );
  if (target === undefined) throw new Error("nakama.nakama openapi target missing");

  test("the recorded decision is no-go", () => {
    expect(target.decision).toBe("no-go");
  });

  test("the openapi api-doc and fidelity goldens exist as a committed regeneration proof", () => {
    expect(existsSync(join(LANE_EVALUATIONS_ROOT, target.apiDoc))).toBe(true);
    expect(existsSync(join(LANE_EVALUATIONS_ROOT, target.fidelity))).toBe(true);
    // The proof lives under an `openapi/` subdir so it never shadows the
    // authored `api-doc/nakama.json` docs-site page, which is what the
    // canonical path holds now that the bare namespace is the module's own.
    expect(target.apiDoc).toBe("api-doc/openapi/nakama.nakama.json");
  });

  test("the pinned swagger + proto snapshots are committed", () => {
    expect(
      existsSync(join(LANE_EVALUATIONS_ROOT, "fixtures/openapi/nakama.nakama.swagger.json")),
    ).toBe(true);
    expect(
      existsSync(join(LANE_EVALUATIONS_ROOT, "fixtures/openapi/nakama.nakama.api.proto")),
    ).toBe(true);
  });
});
