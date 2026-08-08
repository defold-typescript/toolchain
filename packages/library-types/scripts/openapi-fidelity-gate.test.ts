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

  // What this used to measure is gone. The claim was that the proto parser, once it
  // flattened the tail after `Ping {}`, put `create_status_follow_message` and its two
  // siblings into the emitted surface so they left the missing set. The fork no longer
  // declares them — the pinned `nakama.lua` exports no socket member at all, requiring
  // `nakama.socket` privately and exposing only `create_socket` — and the snapshot side
  // of this comparison is that fork, so a `not.toContain` over the three would now pass
  // over an empty surface and prove nothing. The proto parser is unchanged and still
  // covers them; there is simply no member on this module left to read the claim off.
  // Recorded here rather than deleted silently: the surface was withdrawn, not fixed.
  test("what remains missing is exactly the client-lifecycle surface", async () => {
    const { missingMembers, decision } = await comparison();
    expect([...missingMembers].sort()).toEqual([
      "cancel",
      "cancellation_token",
      "create_client",
      "create_socket",
      "set_bearer_token",
      "sync",
    ]);
    expect(decision).toBe("no-go");
  });
});
