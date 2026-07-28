import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseMarkdownApi } from "./parse-markdown-api";
import {
  compareFidelityToTsDefold,
  type MarkdownTarget,
  readMarkdownTargets,
  retargetDoc,
} from "./sync-markdown-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function orthographicTarget(): MarkdownTarget {
  const target = readMarkdownTargets(PACKAGE_ROOT).find(
    (t) => t.moduleId === "orthographic.camera",
  );
  if (target === undefined) throw new Error("orthographic.camera target missing");
  return target;
}

function comparison() {
  const target = orthographicTarget();
  const doc = retargetDoc(
    parseMarkdownApi(
      readFileSync(join(PACKAGE_ROOT, "fixtures/markdown", `${target.moduleId}.md`), "utf8"),
    ),
    target.namespace,
  );
  const tsDefold = readFileSync(
    join(PACKAGE_ROOT, "fixtures/ts-defold", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { target, ...compareFidelityToTsDefold(doc, tsDefold) };
}

describe("orthographic markdown-vs-ts-defold fidelity gate", () => {
  test("reports the ts-defold members the markdown parse does not cover", () => {
    const { missingMembers } = comparison();
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

  test("surfaces the members the newer README adds over ts-defold", () => {
    const { addedMembers } = comparison();
    expect(addedMembers).toContain("get_automatic_zoom");
    expect(addedMembers).toContain("set_automatic_zoom");
  });

  test("the missing surface forces a no-go decision", () => {
    const { missingMembers, decision } = comparison();
    expect(missingMembers.length).toBeGreaterThan(0);
    expect(decision).toBe("no-go");
  });

  test("the recorded target decision matches the computed comparison", () => {
    const { target, decision } = comparison();
    // RED until a decision is recorded on the target; keep-ts-defold here.
    expect(target.decision).toBeDefined();
    expect(target.decision).toBe(decision);
  });
});
