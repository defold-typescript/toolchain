import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseOpenApi } from "./parse-openapi-api";
import { readAuthoredTargets } from "./sync-authored-types";
import { buildTargetModel, readLualsTargets } from "./sync-luals-types";
import { readOpenApiTargets } from "./sync-openapi-types";
import { committedScriptApiDoc, readScriptApiTargets } from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const RECORD_FILE = "pin-refresh.json";

/** Lanes whose surface a parser can recover from committed fixtures. An
 * `authored` pin has no parseable delta — its declarations are hand-written —
 * so it may only ever appear under `deliberatelyUnmoved`, guarded on `ref`. */
type RefreshLane = "luals" | "script-api" | "openapi";
type PinLane = RefreshLane | "authored";

interface PinRefreshEntry {
  lane: RefreshLane;
  moduleId: string;
  fromRef: string;
  toRef: string;
  addedMembers: string[];
  removedMembers: string[];
  changedMembers: string[];
  staged: boolean;
  notes: string;
}

interface UnmovedEntry {
  lane: PinLane;
  moduleId: string;
  ref: string;
  reason: string;
}

function readRecord(): { refreshes: PinRefreshEntry[]; deliberatelyUnmoved: UnmovedEntry[] } {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, RECORD_FILE), "utf8")) as {
    refreshes: PinRefreshEntry[];
    deliberatelyUnmoved: UnmovedEntry[];
  };
}

/** The ref each lane's registry is actually pinned at, keyed by `moduleId`. */
function pinnedRefs(lane: PinLane): Map<string, string> {
  const targets =
    lane === "luals"
      ? readLualsTargets(PACKAGE_ROOT)
      : lane === "script-api"
        ? readScriptApiTargets(PACKAGE_ROOT)
        : lane === "openapi"
          ? readOpenApiTargets(PACKAGE_ROOT)
          : readAuthoredTargets(PACKAGE_ROOT);
  return new Map(targets.map((target) => [target.moduleId, target.ref]));
}

/**
 * The member names a lane's own parser yields for a target's committed fixtures
 * — the same parse the emit and fidelity passes run, never a read of a committed
 * golden. A LuaLS member is qualified by its owning interface, so two interfaces
 * sharing a method name stay distinguishable.
 */
async function committedMembers(lane: RefreshLane, moduleId: string): Promise<Set<string>> {
  if (lane === "openapi") {
    const target = readOpenApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === moduleId);
    if (target === undefined) throw new Error(`no openapi target for ${moduleId}`);
    const doc = parseOpenApi(
      readFileSync(join(PACKAGE_ROOT, "fixtures/openapi", `${moduleId}.swagger.json`), "utf8"),
      readFileSync(join(PACKAGE_ROOT, "fixtures/openapi", `${moduleId}.api.proto`), "utf8"),
    );
    return new Set(doc.elements.map((element) => element.name));
  }
  if (lane === "script-api") {
    const target = readScriptApiTargets(PACKAGE_ROOT).find((t) => t.moduleId === moduleId);
    if (target === undefined) throw new Error(`no script-api target for ${moduleId}`);
    const doc = await committedScriptApiDoc(PACKAGE_ROOT, target);
    return new Set(doc.elements.map((element) => element.name));
  }
  const target = readLualsTargets(PACKAGE_ROOT).find((t) => t.moduleId === moduleId);
  if (target === undefined) throw new Error(`no luals target for ${moduleId}`);
  const model = buildTargetModel(PACKAGE_ROOT, target);
  const names = new Set<string>();
  for (const iface of model.interfaces) {
    for (const method of iface.methods) names.add(`${iface.name}.${method.name}`);
    for (const field of iface.fields) names.add(`${iface.name}.${field.name}`);
  }
  for (const alias of model.aliases) names.add(alias.name);
  for (const fn of model.moduleFunctions) names.add(fn.name);
  return names;
}

/**
 * The guard itself: every name the record *states* must agree with the surface
 * actually emitted. Deliberately silent on completeness — a member upstream
 * added and the record omits leaves this empty — and silent on `changedMembers`
 * and `notes`, which are prose for a later reader.
 *
 * The OpenAPI-only predecessor also asserted the record covered *every* target.
 * That was non-vacuity protection which happened to hold because the lane has a
 * single target; across the LuaLS lane's many targets it would demand an entry
 * per library, most of which were never re-pinned. Per-entry non-vacuity
 * replaces it — do not restore the completeness assertion.
 */
function recordViolations(entry: PinRefreshEntry, members: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const name of entry.removedMembers) {
    if (members.has(name)) {
      violations.push(`${entry.moduleId}: removedMembers names \`${name}\`, still emitted`);
    }
  }
  for (const name of entry.addedMembers) {
    if (!members.has(name)) {
      violations.push(`${entry.moduleId}: addedMembers names \`${name}\`, not emitted`);
    }
  }
  return violations;
}

/** The `deliberatelyUnmoved` half of the guard: a pin examined and left alone
 * must still be sitting at the ref its note claims. */
function unmovedViolations(entry: UnmovedEntry, pinned: ReadonlyMap<string, string>): string[] {
  const actual = pinned.get(entry.moduleId);
  if (actual === undefined) {
    return [`${entry.moduleId}: no ${entry.lane} target`];
  }
  if (actual !== entry.ref) {
    return [`${entry.moduleId}: note says ${entry.ref}, ${entry.lane} registry pins ${actual}`];
  }
  return [];
}

describe("pin-refresh record", () => {
  const { refreshes, deliberatelyUnmoved } = readRecord();

  test("every entry resolves to a target in its lane with a non-empty member set", async () => {
    // Without this the two guards below pass vacuously on an empty record or an
    // empty member set.
    expect(refreshes.length).toBeGreaterThan(0);
    for (const entry of refreshes) {
      const members = await committedMembers(entry.lane, entry.moduleId);
      expect({ moduleId: entry.moduleId, empty: members.size === 0 }).toEqual({
        moduleId: entry.moduleId,
        empty: false,
      });
    }
  });

  test("every lane's member source yields a surface, not just the recorded one", async () => {
    // The committed record holds one `openapi` entry, so the `luals` and
    // `script-api` dispatch arms would otherwise ship unexercised until the
    // slices that add their entries.
    for (const [lane, moduleId] of [
      ["luals", "druid.druid"],
      ["script-api", "bridge.bridge"],
      ["openapi", "nakama.nakama"],
    ] as const) {
      const members = await committedMembers(lane, moduleId);
      expect({ lane, empty: members.size === 0 }).toEqual({ lane, empty: false });
    }
  });

  test("each entry's `toRef` is the ref its lane is actually pinned at", () => {
    const drift = refreshes
      .filter((entry) => pinnedRefs(entry.lane).get(entry.moduleId) !== entry.toRef)
      .map((entry) => `${entry.moduleId}: record says ${entry.toRef}`);
    expect(drift).toEqual([]);
  });

  test("each `deliberatelyUnmoved` note names the ref its lane is actually pinned at", () => {
    const drift = deliberatelyUnmoved.flatMap((entry) =>
      unmovedViolations(entry, pinnedRefs(entry.lane)),
    );
    expect(drift).toEqual([]);
  });

  test("every removed name is absent from the emitted surface, every added name present", async () => {
    const violations: string[] = [];
    for (const entry of refreshes) {
      violations.push(
        ...recordViolations(entry, await committedMembers(entry.lane, entry.moduleId)),
      );
    }
    expect(violations).toEqual([]);
  });

  test("a record naming a member that is neither added nor removed fails the guard", () => {
    const members = new Set(["stayed_put", "genuinely_new"]);
    const base: PinRefreshEntry = {
      lane: "luals",
      moduleId: "fixture.module",
      fromRef: "v1",
      toRef: "v2",
      addedMembers: [],
      removedMembers: [],
      changedMembers: [],
      staged: false,
      notes: "",
    };
    // Claimed removed, but the surface still emits it.
    expect(recordViolations({ ...base, removedMembers: ["stayed_put"] }, members)).toEqual([
      "fixture.module: removedMembers names `stayed_put`, still emitted",
    ]);
    // Claimed added, but the surface does not emit it at all.
    expect(recordViolations({ ...base, addedMembers: ["never_existed"] }, members)).toEqual([
      "fixture.module: addedMembers names `never_existed`, not emitted",
    ]);
    // A record whose claims match the surface is clean.
    expect(recordViolations({ ...base, addedMembers: ["genuinely_new"] }, members)).toEqual([]);
  });

  test("a `deliberatelyUnmoved` note left standing after its pin moved fails the guard", () => {
    // `deliberatelyUnmoved` starts empty, so the committed-data case above cannot
    // yet exercise this walker; hand-made pins keep it from passing vacuously.
    const pinned = new Map([["rendy", "1.0.0"]]);
    const base: UnmovedEntry = { lane: "luals", moduleId: "rendy", ref: "1.0.0", reason: "" };
    expect(unmovedViolations(base, pinned)).toEqual([]);
    expect(unmovedViolations({ ...base, ref: "0.9.0" }, pinned)).toEqual([
      "rendy: note says 0.9.0, luals registry pins 1.0.0",
    ]);
    expect(unmovedViolations({ ...base, moduleId: "absent" }, pinned)).toEqual([
      "absent: no luals target",
    ]);
  });
});
