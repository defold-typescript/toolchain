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
//
// The snapshot side moved from `fixtures/ts-defold/` to the authored lane when
// nakama.nakama severed: the openapi lane has no `severedSource` machinery, so
// this one read is re-pointed by hand. The move is term-neutral by construction
// — the fork is a verbatim copy of the retired ts-defold snapshot, byte for byte
// — so every term below is the same measurement, not a re-baseline. A term that
// does move is a stop-and-record: it means the fork was edited under a verdict
// that no longer describes it.
async function comparison() {
  const target = nakamaTarget();
  const emitted = await emitOpenApiDeclaration(PACKAGE_ROOT, target);
  const snapshot = readFileSync(
    join(PACKAGE_ROOT, "fixtures/authored", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { target, ...compareFidelityToTsDefold(emitted, snapshot) };
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

  test("the three status constructors are now source-backed, not missing", async () => {
    // Once the proto parser flattens the tail after `Ping {}`, these three exist
    // in the emitted surface and leave the missing set; the hand-written helpers
    // keep the decision no-go.
    const { missingMembers, decision } = await comparison();
    for (const ctor of [
      "create_status_follow_message",
      "create_status_unfollow_message",
      "create_status_update_message",
    ]) {
      expect(missingMembers).not.toContain(ctor);
    }
    expect(missingMembers).toContain("create_client");
    expect(decision).toBe("no-go");
  });
});
