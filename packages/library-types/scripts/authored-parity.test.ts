import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  authoredParityPath,
  authoredParityTargets,
  buildAuthoredParity,
  renderAuthoredParity,
} from "./authored-parity";
import { type AuthoredTarget, readAuthoredTargets } from "./sync-authored-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const TARGETS = readAuthoredTargets(PACKAGE_ROOT);

function target(namespace: string): AuthoredTarget {
  const found = TARGETS.find((entry) => entry.namespace === namespace);
  if (!found) throw new Error(`authored-targets.json declares no ${namespace}`);
  return found;
}

describe("upstreamLua is opt-in, so an unmeasured target stays unmeasured", () => {
  test("a target that declares no upstream Lua reads back as an empty list", () => {
    const unmeasured = TARGETS.filter((entry) => entry.upstreamLua.length === 0);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const entry of unmeasured) expect(entry.upstreamLua).toEqual([]);
  });

  test("the parity pass covers only the opted-in targets", () => {
    const measured = authoredParityTargets(PACKAGE_ROOT).map((entry) => entry.namespace);
    expect(measured.sort()).toEqual(["nakama", "nakama.engine.defold", "nakama.util.log"]);
  });

  test("an unmeasured target has no committed parity artifact", () => {
    const stray = TARGETS.filter((entry) => entry.upstreamLua.length === 0)
      .map((entry) => authoredParityPath(entry))
      .filter((path) => existsSync(join(PACKAGE_ROOT, path)));
    expect(stray).toEqual([]);
  });
});

describe("every committed parity artifact is what the pass recomputes", () => {
  for (const namespace of ["nakama", "nakama.engine.defold", "nakama.util.log"]) {
    test(`${namespace} round-trips byte-for-byte`, () => {
      const entry = target(namespace);
      const rebuilt = renderAuthoredParity(buildAuthoredParity(PACKAGE_ROOT, entry));
      const committed = readFileSync(join(PACKAGE_ROOT, authoredParityPath(entry)), "utf8");
      expect(rebuilt).toBe(committed);
    });
  }
});

describe("the nakama.engine.defold parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama.engine.defold"));

  test("every upstream member is declared, so the gap is arity alone", () => {
    expect(report.upstreamMembers).toBe(5);
    expect(report.declaredMembers).toBe(5);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
  });

  test("`http` drops two upstream parameters and `socket_send` invents one", () => {
    expect(report.arityMismatches).toEqual([
      { name: "http", upstream: 8, declared: 6 },
      { name: "socket_send", upstream: 2, declared: 3 },
    ]);
    expect(report.coverage).toBe(0.6);
  });
});

describe("the nakama.util.log parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama.util.log"));

  test("two of the four upstream members are not declared at all", () => {
    expect(report.upstreamMembers).toBe(4);
    expect(report.declaredMembers).toBe(2);
    expect(report.missingMembers).toEqual(["custom", "format"]);
    expect(report.coverage).toBe(0.5);
  });

  test("both declared members carry upstream LuaDoc the api-doc does not", () => {
    expect(report.undocumentedMembers).toBe(2);
  });
});

describe("the nakama core parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));

  test("the fork declares members upstream does not have", () => {
    expect(report.phantomMembers).toContain("socket_send");
    expect(report.phantomMembers).toContain("create_match_create_message");
  });

  test("almost nothing in the fork matches upstream arity", () => {
    expect(report.upstreamMembers).toBe(156);
    expect(report.declaredMembers).toBe(166);
    expect(report.arityMismatches.length).toBe(136);
    expect(report.coverage).toBeLessThan(0.03);
  });
});

describe("the artifact shape is diff-stable", () => {
  test("every list is sorted by name", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.missingMembers).toEqual([...report.missingMembers].sort());
      expect(report.phantomMembers).toEqual([...report.phantomMembers].sort());
      const names = report.arityMismatches.map((mismatch) => mismatch.name);
      expect(names).toEqual([...names].sort());
    }
  });
});
