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

describe("the measured corpus is exactly the corpus without a verdict", () => {
  test("a target that declares no upstream Lua reads back as an empty list", () => {
    const unmeasured = TARGETS.filter((entry) => entry.upstreamLua.length === 0);
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const entry of unmeasured) expect(entry.upstreamLua).toEqual([]);
  });

  // Derived from the *verdict* side, while `authoredParityTargets` filters on the
  // `upstreamLua` side. The bijection makes the two agree only when the pass
  // selects correctly, so a widened or narrowed filter reds here.
  test("the parity pass covers every target that recorded no verdict", () => {
    const measured = authoredParityTargets(PACKAGE_ROOT)
      .map((entry) => entry.namespace)
      .sort();
    const expected = TARGETS.filter((entry) => entry.parityVerdict === undefined)
      .map((entry) => entry.namespace)
      .sort();
    expect(measured).toEqual(expected);
    expect(measured.length).toBeGreaterThan(3);
  });

  test("the rollout reaches past the nakama repository it started from", () => {
    const repos = new Set(authoredParityTargets(PACKAGE_ROOT).map((entry) => entry.repo));
    expect(repos.size).toBeGreaterThan(1);
    expect([...repos]).toContain("https://github.com/britzl/defold-input");
  });

  test("an unmeasured target has no committed parity artifact", () => {
    const stray = TARGETS.filter((entry) => entry.upstreamLua.length === 0)
      .map((entry) => authoredParityPath(entry))
      .filter((path) => existsSync(join(PACKAGE_ROOT, path)));
    expect(stray).toEqual([]);
  });
});

describe("every committed parity artifact is what the pass recomputes", () => {
  for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
    test(`${entry.namespace} round-trips byte-for-byte`, () => {
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

describe("a coverage figure cannot be read as completeness", () => {
  test("every report records the upstream fields the comparison never examined", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.upstreamFields).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(report.upstreamFields)).toBe(true);
    }
  });

  test("platypus pairs a perfect callable coverage with an unexamined field surface", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("platypus"));
    expect(report.upstreamMembers).toBe(1);
    expect(report.coverage).toBe(1);
    expect(report.upstreamFields).toBe(14);
  });

  test("the corpus contains a thin measurement, so the count is load-bearing", () => {
    const thin = authoredParityTargets(PACKAGE_ROOT)
      .map((entry) => buildAuthoredParity(PACKAGE_ROOT, entry))
      .filter((report) => report.coverage === 1 && report.upstreamFields > 0)
      .map((report) => report.namespace);
    expect(thin).toContain("platypus");
  });

  test("nakama gains the field count without moving its recorded coverage", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.upstreamFields).toBe(12);
    expect(report.upstreamMembers).toBe(156);
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
