import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compareFidelityToTsDefold,
  emitOpenApiDeclaration,
  type OpenApiTarget,
  readOpenApiTargets,
} from "./sync-openapi-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function nakamaTarget(): OpenApiTarget {
  const target = readOpenApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === "nakama.nakama");
  if (target === undefined) throw new Error("nakama.nakama openapi target missing");
  return target;
}

// The comparison runs against the *emitted* openapi `.d.ts` (the real emitter is
// the single source of truth for type resolution), not the parsed doc.
async function comparison() {
  const target = nakamaTarget();
  const emitted = await emitOpenApiDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(
    join(PACKAGE_ROOT, "fixtures/ts-defold", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { target, ...compareFidelityToTsDefold(emitted, tsDefold) };
}

describe("nakama openapi-vs-ts-defold fidelity gate", () => {
  test("reports the hand-written client helpers the structured source cannot cover", async () => {
    const { missingMembers } = await comparison();
    // The REST swagger + realtime proto carry no source for the Lua client's
    // hand-written helpers and socket-lifecycle wrappers.
    for (const helper of ["create_client", "sync", "set_bearer_token"]) {
      expect(missingMembers).toContain(helper);
    }
  });

  test("the missing surface forces a no-go decision", async () => {
    const { missingMembers, decision } = await comparison();
    expect(missingMembers.length).toBeGreaterThan(0);
    expect(decision).toBe("no-go");
  });

  test("the recorded target decision matches the computed comparison", async () => {
    const { target, decision } = await comparison();
    expect(target.decision).toBeDefined();
    expect(target.decision).toBe(decision);
  });
});
