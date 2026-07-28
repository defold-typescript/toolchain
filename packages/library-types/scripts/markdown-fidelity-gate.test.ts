import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  compareFidelityToTsDefold,
  emitMarkdownDeclaration,
  type MarkdownTarget,
  readMarkdownTargets,
  tsDefoldMembers,
} from "./sync-markdown-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function orthographicTarget(): MarkdownTarget {
  const target = readMarkdownTargets(PACKAGE_ROOT).find(
    (t) => t.moduleId === "orthographic.camera",
  );
  if (target === undefined) throw new Error("orthographic.camera target missing");
  return target;
}

// The comparison runs against the *emitted* markdown `.d.ts` (the real emitter is
// the single source of truth for type resolution), not the parsed doc.
async function comparison() {
  const target = orthographicTarget();
  const markdownEmittedDts = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(
    join(PACKAGE_ROOT, "fixtures/ts-defold", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { target, ...compareFidelityToTsDefold(markdownEmittedDts, tsDefold) };
}

describe("tsDefoldMembers sees bare export-less declarations", () => {
  test("extracts bare `function` members from a module written without `export`", () => {
    const rendy = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", "rendy.rendy.d.ts"),
      "utf8",
    );
    const members = tsDefoldMembers(rendy);
    for (const fn of ["create_camera", "destroy_camera", "get_stack", "screen_to_world"]) {
      expect(members).toContain(fn);
    }
  });
});

describe("orthographic markdown-vs-ts-defold fidelity gate", () => {
  test("reports the ts-defold members the markdown parse does not cover", async () => {
    const { missingMembers } = await comparison();
    // Functions in the ts-defold surface absent from the README API table.
    for (const fn of [
      "add_projector",
      "get_cameras",
      "get_projection_id",
      "project",
      "set_window_scaling_factor",
      "unproject",
      "use_projector",
      "window_to_world",
    ]) {
      expect(missingMembers).toContain(fn);
    }
    // Every ts-defold constant is a member the flat signature parser cannot see.
    for (const constant of [
      "PROJECTOR",
      "SHAKE_BOTH",
      "MSG_SHAKE",
      "ORTHOGRAPHIC_RENDER_SCRIPT_USED",
    ]) {
      expect(missingMembers).toContain(constant);
    }
  });

  test("surfaces the members the newer README adds over ts-defold", async () => {
    const { addedMembers } = await comparison();
    expect(addedMembers).toContain("get_automatic_zoom");
    expect(addedMembers).toContain("set_automatic_zoom");
  });

  test("a weaker markdown type downgrade forces a no-go decision", async () => {
    const { downgradedMembers, decision } = await comparison();
    // ts-defold returns `vmath.matrix4`; the README's `matrix` token is unresolved,
    // so the markdown emit downgrades both to `unknown`.
    expect(downgradedMembers).toContain("get_view");
    expect(downgradedMembers).toContain("get_projection");
    expect(decision).toBe("no-go");
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
