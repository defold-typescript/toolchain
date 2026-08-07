import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  authoredParityPath,
  authoredParityTargets,
  buildAuthoredParity,
  classifyFieldAxis,
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

interface ApiDocElement {
  type: string;
  name: string;
  global?: boolean;
}

function apiDocElements(entry: AuthoredTarget): ApiDocElement[] {
  const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, entry.apiDoc), "utf8")) as {
    elements: ApiDocElement[];
  };
  return doc.elements;
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
    expect(report.callableCoverage).toBe(0.6);
  });
});

describe("the nakama.util.log parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama.util.log"));

  test("two of the four upstream members are not declared at all", () => {
    expect(report.upstreamMembers).toBe(4);
    expect(report.declaredMembers).toBe(2);
    expect(report.missingMembers).toEqual(["custom", "format"]);
    expect(report.callableCoverage).toBe(0.5);
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
    expect(report.callableCoverage).toBeLessThan(0.03);
  });
});

describe("a callable coverage figure cannot be read as completeness", () => {
  test("every report records the upstream fields the callable axis does not examine", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.upstreamFields).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(report.upstreamFields)).toBe(true);
    }
  });

  test("platypus pairs a perfect callable coverage with a far larger field surface", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("platypus"));
    expect(report.upstreamMembers).toBe(1);
    expect(report.callableCoverage).toBe(1);
    expect(report.upstreamFields).toBe(14);
  });

  test("the corpus contains a thin measurement, so the second axis is load-bearing", () => {
    const thin = authoredParityTargets(PACKAGE_ROOT)
      .map((entry) => buildAuthoredParity(PACKAGE_ROOT, entry))
      .filter((report) => report.callableCoverage === 1 && report.upstreamFields > 0)
      .map((report) => report.namespace);
    expect(thin).toContain("platypus");
  });

  test("nakama gains the field count without moving its recorded coverage", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.upstreamFields).toBe(12);
    expect(report.upstreamMembers).toBe(156);
    expect(report.callableCoverage).toBeLessThan(0.03);
  });
});

describe("the field axis compares the non-callable surface", () => {
  test("nakama declares none of the twelve constants upstream defines", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.upstreamFields).toBe(12);
    expect(report.declaredFields).toBe(0);
    expect(report.missingFields.length).toBe(12);
    expect(report.missingFields).toContain("APIOPERATOR_BEST");
    expect(report.fieldCoverage).toBe(0);
  });

  test("platypus pairs its perfect callable coverage with a real field gap", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("platypus"));
    expect(report.callableCoverage).toBe(1);
    expect(report.upstreamFields).toBe(14);
    expect(report.missingFields).toEqual(["SEPARATION_RAYS", "SEPARATION_SHAPES"]);
    expect(report.fieldCoverage).toBe(0.8571);
  });

  test("in.triggers agrees on all 168 fields, so a large surface can still score 1", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("in.triggers"));
    expect(report.upstreamFields).toBe(168);
    expect(report.declaredFields).toBe(168);
    expect(report.missingFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // The only target carrying genuine phantoms *and* a missing field at once: names
  // the fork invented that upstream has in neither half, beside a real gap. Coverage
  // stays the missing-side fraction (18 of 19), so a phantom cannot drag a field
  // score down the way a missing member does.
  test("orthographic.camera reports invented fields without charging them to coverage", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("orthographic.camera"));
    expect(report.missingFields).toEqual(["MSG_SET_AUTOMATIC_ZOOM"]);
    expect(report.phantomFields).toEqual(["MSG_USE_PROJECTION", "ORTHOGRAPHIC_RENDER_SCRIPT_USED"]);
    expect(report.fieldCoverage).toBe(0.9474);
  });

  test("an empty upstream field surface scores 1, as the callable axis already does", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.gui"));
    expect(report.upstreamFields).toBe(0);
    expect(report.fieldCoverage).toBe(1);
  });
});

describe("a name callable on either side is compared, never counted as a field", () => {
  // monarch.transitions.gui declares its twelve transitions as `VARIABLE` while
  // upstream defines them as functions. They are already the target's twelve
  // `missingMembers`; reporting them as phantom fields too would count one defect
  // on both axes and label an upstream name "invented".
  test("a declared field that is an upstream function is not a phantom field", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.gui"));
    expect(report.declaredFields).toBe(12);
    expect(report.phantomFields).toEqual([]);
    expect(report.missingMembers).toContain("slide_in_right");
  });

  test("no report charges the same name to both axes", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      const callable = new Set([...report.missingMembers, ...report.phantomMembers]);
      const overlap = [...report.missingFields, ...report.phantomFields].filter((name) =>
        callable.has(name),
      );
      expect(`${report.namespace}: ${overlap.join(", ")}`).toBe(`${report.namespace}: `);
    }
  });
});

// The corpus exercises one half of the either-side rule — `monarch.transitions.gui`,
// the only target declaring upstream functions as `VARIABLE`. The other three clauses
// have no corpus case at all, so they are pinned here on synthetic name sets driven
// straight through the classifier `buildAuthoredParity` itself calls.
describe("the either-side rule holds on name sets the corpus never produces", () => {
  test("an undeclared upstream field is missing, an unmatched declared variable is phantom", () => {
    const axis = classifyFieldAxis({
      upstreamCallable: new Set(),
      upstreamNonCallable: new Set(["Z_UPSTREAM", "A_UPSTREAM"]),
      declaredCallable: new Set(),
      declaredVariables: new Set(["Z_INVENTED", "A_INVENTED"]),
    });
    expect(axis.missingFields).toEqual(["A_UPSTREAM", "Z_UPSTREAM"]);
    expect(axis.phantomFields).toEqual(["A_INVENTED", "Z_INVENTED"]);
  });

  test("an upstream function declared as a VARIABLE is not a phantom field", () => {
    const axis = classifyFieldAxis({
      upstreamCallable: new Set(["slide_in_right"]),
      upstreamNonCallable: new Set(),
      declaredCallable: new Set(),
      declaredVariables: new Set(["slide_in_right"]),
    });
    expect([...axis.declaredFields]).toEqual(["slide_in_right"]);
    expect(axis.phantomFields).toEqual([]);
  });

  test("an upstream field declared as a FUNCTION is not a missing field", () => {
    const axis = classifyFieldAxis({
      upstreamCallable: new Set(),
      upstreamNonCallable: new Set(["TIMEOUT"]),
      declaredCallable: new Set(["TIMEOUT"]),
      declaredVariables: new Set(),
    });
    expect([...axis.upstreamFields]).toEqual(["TIMEOUT"]);
    expect(axis.missingFields).toEqual([]);
  });

  test("a name upstream defines both ways is not an upstream field", () => {
    const axis = classifyFieldAxis({
      upstreamCallable: new Set(["render"]),
      upstreamNonCallable: new Set(["render"]),
      declaredCallable: new Set(),
      declaredVariables: new Set(),
    });
    expect([...axis.upstreamFields]).toEqual([]);
    expect(axis.missingFields).toEqual([]);
  });

  test("a name the fork declares both ways is neither a declared field nor a phantom", () => {
    const axis = classifyFieldAxis({
      upstreamCallable: new Set(),
      upstreamNonCallable: new Set(),
      declaredCallable: new Set(["helper"]),
      declaredVariables: new Set(["helper"]),
    });
    expect([...axis.declaredFields]).toEqual([]);
    expect(axis.phantomFields).toEqual([]);
  });
});

describe("the declared field side reads only api-doc VARIABLE elements", () => {
  function declaredTypes(entry: AuthoredTarget, type: string): string[] {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, entry.apiDoc), "utf8")) as {
      elements: { type: string; name: string }[];
    };
    return doc.elements.filter((element) => element.type === type).map((element) => element.name);
  }

  test("a TYPEDEF is never counted as a declared field", () => {
    const nakama = target("nakama");
    expect(declaredTypes(nakama, "TYPEDEF").length).toBeGreaterThan(0);
    expect(buildAuthoredParity(PACKAGE_ROOT, nakama).declaredFields).toBe(0);

    const gui = target("monarch.transitions.gui");
    expect(declaredTypes(gui, "TYPEDEF").length).toBeGreaterThan(0);
    expect(buildAuthoredParity(PACKAGE_ROOT, gui).declaredFields).toBe(
      declaredTypes(gui, "VARIABLE").length,
    );
  });

  // Vacuous today — no measured target declares an upstream field as a `FUNCTION`, so
  // this filters an empty set. It guards the corpus as it grows; the clause itself is
  // pinned by the synthetic corner above.
  test("a name the fork declares as a FUNCTION never reads as a missing field", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const functions = new Set(declaredTypes(entry, "FUNCTION"));
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.missingFields.filter((name) => functions.has(name))).toEqual([]);
    }
  });
});

describe("the two callable-module targets the setmetatable reader lifted", () => {
  test("in.accelerometer declares all ten upstream members at upstream arity", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("in.accelerometer"));
    expect(report.upstreamMembers).toBe(10);
    expect(report.declaredMembers).toBe(10);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("boom declares one of six, the five lifecycle hooks its script calls being absent", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("boom"));
    expect(report.upstreamMembers).toBe(6);
    expect(report.declaredMembers).toBe(1);
    expect(report.missingMembers).toEqual(["final", "init", "on_input", "on_message", "update"]);
    expect(report.callableCoverage).toBe(0.1667);
  });

  // Without the global exclusion this list would hold 87 names upstream really does
  // define, in `boom/gameobject/gameobject.lua` and its siblings.
  test("boom's ambient globals are counted, not charged to it as invented members", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("boom"));
    expect(report.phantomMembers).toEqual([]);
    expect(report.declaredGlobals).toBe(87);
  });
});

describe("an ambient global is not a member of the module", () => {
  test("deftest's thirty telescope assertions are globals, so none is a phantom member", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("deftest"));
    expect(apiDocElements(target("deftest")).length).toBe(32);
    expect(report.declaredMembers).toBe(2);
    expect(report.phantomMembers).toEqual([]);
  });

  test("excluding them moves neither ratcheted figure", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("deftest"));
    expect(report.callableCoverage).toBe(0.5);
    expect(report.fieldCoverage).toBe(1);
  });

  test("what was excluded stays visible: deftest counts thirty declared globals", () => {
    expect(buildAuthoredParity(PACKAGE_ROOT, target("deftest")).declaredGlobals).toBe(30);
  });

  test("every report counts the global FUNCTION and VARIABLE elements of its api-doc", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const globals = apiDocElements(entry).filter(
        (element) =>
          element.global === true && (element.type === "FUNCTION" || element.type === "VARIABLE"),
      );
      expect(
        `${entry.namespace}: ${buildAuthoredParity(PACKAGE_ROOT, entry).declaredGlobals}`,
      ).toBe(`${entry.namespace}: ${globals.length}`);
    }
  });

  // By name, as `declaredMembers` is: `monarch.transitions.gui` declares `create` twice
  // as overloads, which are one member of the surface rather than two.
  test("the declared callable side is exactly the api-doc functions that are not global", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const members = new Set(
        apiDocElements(entry)
          .filter((element) => element.type === "FUNCTION" && element.global !== true)
          .map((element) => element.name),
      );
      expect(
        `${entry.namespace}: ${buildAuthoredParity(PACKAGE_ROOT, entry).declaredMembers}`,
      ).toBe(`${entry.namespace}: ${members.size}`);
    }
  });

  test("no target reports a name its api-doc marks global as one the fork invented", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const globals = new Set(
        apiDocElements(entry)
          .filter((element) => element.global === true)
          .map((element) => element.name),
      );
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      const compared = [...report.phantomMembers, ...report.phantomFields].filter((name) =>
        globals.has(name),
      );
      expect(`${entry.namespace}: ${compared.join(", ")}`).toBe(`${entry.namespace}: `);
    }
  });
});

describe("the artifact shape is diff-stable", () => {
  test("every list is sorted by name", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.missingMembers).toEqual([...report.missingMembers].sort());
      expect(report.phantomMembers).toEqual([...report.phantomMembers].sort());
      expect(report.missingFields).toEqual([...report.missingFields].sort());
      expect(report.phantomFields).toEqual([...report.phantomFields].sort());
      const names = report.arityMismatches.map((mismatch) => mismatch.name);
      expect(names).toEqual([...names].sort());
    }
  });

  test("a field score of 1 means nothing is missing, on every target", () => {
    for (const entry of authoredParityTargets(PACKAGE_ROOT)) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(report.fieldCoverage).toBeGreaterThanOrEqual(0);
      expect(report.fieldCoverage).toBeLessThanOrEqual(1);
      expect(report.fieldCoverage === 1).toBe(report.missingFields.length === 0);
    }
  });
});
