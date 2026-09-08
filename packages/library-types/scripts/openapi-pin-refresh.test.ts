import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseOpenApi } from "./parse-openapi-api";
import { type OpenApiTarget, readOpenApiTargets } from "./sync-openapi-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const RECORD_FILE = "openapi-pin-refresh.json";

interface PinRefreshEntry {
  moduleId: string;
  fromRef: string;
  toRef: string;
  addedOperations: string[];
  removedOperations: string[];
  changedOperations: string[];
  staged: boolean;
  notes: string;
}

function readRecord(): PinRefreshEntry[] {
  const raw = JSON.parse(readFileSync(join(PACKAGE_ROOT, RECORD_FILE), "utf8")) as {
    refreshes: PinRefreshEntry[];
  };
  return raw.refreshes;
}

/** Bare element names `parseOpenApi` yields for a target's committed fixtures —
 * the same parse the emit and fidelity passes run, before retargeting prepends
 * the publish namespace. */
function committedMembers(target: OpenApiTarget): Set<string> {
  const doc = parseOpenApi(
    readFileSync(join(PACKAGE_ROOT, "fixtures/openapi", `${target.moduleId}.swagger.json`), "utf8"),
    readFileSync(join(PACKAGE_ROOT, "fixtures/openapi", `${target.moduleId}.api.proto`), "utf8"),
  );
  return new Set(doc.elements.map((element) => element.name));
}

/**
 * The guard itself: every name the record *states* must agree with the surface
 * actually emitted. Deliberately silent on completeness — an operation upstream
 * added and the record omits leaves this empty — and silent on
 * `changedOperations`/`notes`, which are prose for a later reader.
 */
function recordViolations(entry: PinRefreshEntry, members: ReadonlySet<string>): string[] {
  const violations: string[] = [];
  for (const name of entry.removedOperations) {
    if (members.has(name)) {
      violations.push(`${entry.moduleId}: removedOperations names \`${name}\`, still emitted`);
    }
  }
  for (const name of entry.addedOperations) {
    if (!members.has(name)) {
      violations.push(`${entry.moduleId}: addedOperations names \`${name}\`, not emitted`);
    }
  }
  return violations;
}

describe("openapi pin-refresh record", () => {
  const record = readRecord();
  const targets = readOpenApiTargets(PACKAGE_ROOT);

  test("the record covers every openapi target, and each names a parseable surface", () => {
    // Without this the two guards below pass vacuously on an empty record or an
    // empty member set.
    expect(record.length).toBeGreaterThan(0);
    expect(record.map((entry) => entry.moduleId).sort()).toEqual(
      targets.map((target) => target.moduleId).sort(),
    );
    for (const target of targets) {
      expect(committedMembers(target).size).toBeGreaterThan(0);
    }
  });

  test("each entry's `toRef` is the ref the lane is actually pinned at", () => {
    const drift = record
      .filter(
        (entry) =>
          targets.find((target) => target.moduleId === entry.moduleId)?.ref !== entry.toRef,
      )
      .map((entry) => `${entry.moduleId}: record says ${entry.toRef}`);
    expect(drift).toEqual([]);
  });

  test("every removed name is absent from the emitted surface, every added name present", () => {
    const violations = record.flatMap((entry) => {
      const target = targets.find((candidate) => candidate.moduleId === entry.moduleId);
      if (target === undefined) return [`${entry.moduleId}: no matching openapi target`];
      return recordViolations(entry, committedMembers(target));
    });
    expect(violations).toEqual([]);
  });

  test("a record naming an operation that is neither added nor removed fails the guard", () => {
    const members = new Set(["stayed_put", "genuinely_new"]);
    const base: PinRefreshEntry = {
      moduleId: "fixture.module",
      fromRef: "v1",
      toRef: "v2",
      addedOperations: [],
      removedOperations: [],
      changedOperations: [],
      staged: false,
      notes: "",
    };
    // Claimed removed, but the surface still emits it.
    expect(recordViolations({ ...base, removedOperations: ["stayed_put"] }, members)).toEqual([
      "fixture.module: removedOperations names `stayed_put`, still emitted",
    ]);
    // Claimed added, but the surface does not emit it at all.
    expect(recordViolations({ ...base, addedOperations: ["never_existed"] }, members)).toEqual([
      "fixture.module: addedOperations names `never_existed`, not emitted",
    ]);
    // A record whose claims match the surface is clean.
    expect(recordViolations({ ...base, addedOperations: ["genuinely_new"] }, members)).toEqual([]);
  });
});
