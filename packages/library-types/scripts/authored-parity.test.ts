import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AUTHORED_EXCEPTIONS_MANIFEST_FILE,
  type AuthoredParityException,
  authoredParityPath,
  authoredParityTargets,
  buildAuthoredParity,
  classifyArity,
  classifyFieldAxis,
  hasTrailingDiscard,
  parseAuthoredExceptions,
  readAuthoredExceptions,
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
  parameters?: unknown[];
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

  test("every upstream member is declared, and the surface is still five wide", () => {
    expect(report.upstreamMembers).toBe(5);
    expect(report.declaredMembers).toBe(5);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
  });

  test("`http` carries upstream's eight parameters and `socket_send` its two", () => {
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });
});

describe("the nakama.util.log parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama.util.log"));

  test("all four upstream members are declared, at upstream arity", () => {
    expect(report.upstreamMembers).toBe(4);
    expect(report.declaredMembers).toBe(4);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  // `format`'s upstream block opens with a plain `--`, so the reader records no doc for
  // it and it is not chargeable; the other three are `---` blocks the fork does not carry,
  // and the api-doc now takes upstream's summary for each of them.
  test("the three members the fork left blank carry imported upstream prose", () => {
    expect(report.undocumentedMembers).toBe(0);
    expect(report.importedDocs).toBe(3);
  });
});

describe("the richtext.color parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("richtext.color"));

  test("all four upstream members are declared, at upstream arity", () => {
    expect(report.upstreamMembers).toBe(4);
    expect(report.declaredMembers).toBe(4);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("the one upstream constant stays declared beside them", () => {
    expect(report.upstreamFields).toBe(1);
    expect(report.missingFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

describe("the two forks exporting a name their pinned upstream does not define", () => {
  test("monarch.transitions.easings no longer exports upstream's private `create`", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.easings"));
    expect(report.phantomMembers).toEqual([]);
    expect(report.declaredMembers).toBe(10);
    expect(report.missingMembers).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  // The callable half is what this block records; the five constants are declared now,
  // and a declaration that reached the callable side instead would show up as a
  // phantom member here rather than as a field shortfall.
  test("rendy drops the two go.animate replacements and declares its five variables", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("rendy"));
    expect(report.phantomMembers).toEqual([]);
    expect(report.declaredMembers).toBe(11);
    expect(report.callableCoverage).toBe(1);
    expect(report.upstreamFields).toBe(5);
    expect(report.declaredFields).toBe(5);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

describe("the three forks that were missing members their pinned upstream defines", () => {
  test("persist declares the sixth function upstream exports", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("persist"));
    expect(report.upstreamMembers).toBe(6);
    expect(report.declaredMembers).toBe(6);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  // The three constants stay phantom fields: only the callable axis is corrected
  // here, so a declaration that reached the field side would show up as movement.
  test("bzAnim declares the three controller functions, and its field axis holds still", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("bzAnim"));
    expect(report.upstreamMembers).toBe(9);
    expect(report.declaredMembers).toBe(9);
    expect(report.missingMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.phantomFields).toEqual(["DEBUG_LEVEL", "INFO_LEVEL", "TRACE_LEVEL"]);
    expect(report.fieldCoverage).toBe(1);
  });

  // `print` and `pprint` hold the *engine's* original functions, which `start()`
  // replaces and `stop()` restores from them, so the shape is a `const` of function
  // type. `declaredFields: 3` is what makes that shape provable: declaring either as
  // `export function` empties `missingFields` all the same — `classifyFieldAxis` drops
  // a name the fork declares as a `FUNCTION` from the missing set — so
  // `fieldCoverage: 1` alone would pass over the wrong declaration. The count cannot,
  // and `phantomMembers` names it on the axis it wrongly reached.
  test("defcon takes upstream's optional second parameter and closes its three-field gap", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("defcon"));
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.phantomMembers).toEqual([]);
    expect(report.upstreamFields).toBe(3);
    expect(report.declaredFields).toBe(3);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

// Twenty of twenty, corrected rather than justified: eight members the fork never
// declared, and five parameter lists that disagreed — three `*dynamic_list` forms
// carrying an invented `root_id`, `dynamic_list` and `static_list` an invented trailing
// `is_horizontal`, and `vertical_scrollbar` dropping upstream's `config`, which silently
// shifted every argument after `action`.
describe("gooey declares the whole callable surface gooey.lua defines", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("gooey"));

  test("every upstream member is declared at upstream arity, none of it excepted", () => {
    expect(report.upstreamMembers).toBe(20);
    expect(report.declaredMembers).toBe(20);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.parityExceptions).toEqual([]);
  });

  // The scope line of this slice: the callable corrections reached no constant on the
  // way past, and upstream defines none for them to have reached.
  test("the field axis did not move: this slice touched one axis", () => {
    expect(report.upstreamFields).toBe(0);
    expect(report.declaredFields).toBe(0);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

// Sixty-eight of sixty-eight, corrected rather than justified. The fork was short 22
// whole feature areas — the events trio, the multiplayer-sessions trio, the five
// `features_*`, five `player_*` getters, the shortcut pair, `flags_get`,
// `is_available_method`, `server_time` and `device_info_is_tv` — declared
// `payments_get_catalog` with a lone callback where upstream takes `(options, callback)`,
// and carried four `//* Sitelock` names the pinned `yagames.lua` never exports.
describe("yagames declares the whole callable surface yagames.lua defines", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("yagames"));

  test("every upstream member is declared at upstream arity, none of it excepted", () => {
    expect(report.upstreamMembers).toBe(68);
    expect(report.declaredMembers).toBe(68);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
    expect(report.parityExceptions).toEqual([]);
  });

  // The scope line of this slice, in the same shape gooey's carries: `fieldCoverage`
  // alone could not fail here — upstream declares no constants, so the ratio short-
  // circuits to 1 — and it is `declaredFields`/`phantomFields` that move if a
  // correction reached the field side.
  test("the field axis did not move: this slice touched one axis", () => {
    expect(report.upstreamFields).toBe(0);
    expect(report.declaredFields).toBe(0);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

// The corpus's worst case, and the last target below 1: `nakama` scored 0.0256 over 4 of
// 156 agreeing members, declared 26 names the pinned module never exported — `socket_send`
// among them, reachable only through `nakama.socket`, which this target does not vendor —
// and left 16 upstream members undeclared. Every one of the three is now a correction
// rather than a figure, so the assertions state what the fork reaches instead.
describe("the nakama core parity findings", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));

  test("the fork declares exactly the callable surface the pinned module exports", () => {
    expect(report.upstreamMembers).toBe(156);
    expect(report.declaredMembers).toBe(156);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  // Nothing here is justified rather than declared: the rollout anticipated `nakama`
  // asking the ledger for an arity or phantom kind, and correcting the fork per member
  // is what makes that unnecessary.
  test("the coverage is reached by correction, with no ledger entry", () => {
    expect(report.parityExceptions).toEqual([]);
  });

  // The one door upstream exposes to the realtime surface, kept while the 26 members
  // that pretended to be on this module go.
  test("socket_send is gone and create_socket stays", () => {
    const declared = apiDocElements(target("nakama"))
      .filter((element) => element.type === "FUNCTION")
      .map((element) => element.name);
    expect(declared).not.toContain("socket_send");
    expect(declared).toContain("create_socket");
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

  // The signature rollout took the callable axis to 1 and left the field axis at zero;
  // the field slice closed the second half without moving either callable term, which
  // is the scope line the two axes exist to keep visible.
  test("nakama reaches both axes: twelve declared constants beside its 156 members", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.upstreamFields).toBe(12);
    expect(report.declaredFields).toBe(12);
    expect(report.upstreamMembers).toBe(156);
    expect(report.callableCoverage).toBe(1);
    expect(report.missingFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });
});

describe("the field axis compares the non-callable surface", () => {
  // `declaredFields` is the pinned term, not the ratio: declaring one of these as a
  // `FUNCTION` also empties `missingFields` and also reads `fieldCoverage: 1`, while
  // leaving the count short and pushing the name onto the callable axis.
  test("nakama declares each of the twelve constants upstream defines", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.upstreamFields).toBe(12);
    expect(report.declaredFields).toBe(12);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // The corpus's most field-heavy target: fourteen constants around a single
  // `create`, so a module can be almost entirely non-callable and still be measured
  // on both axes rather than read through the one member the callable axis sees.
  test("platypus declares both separation modes beside its single callable member", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("platypus"));
    expect(report.upstreamFields).toBe(14);
    expect(report.declaredFields).toBe(14);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
    expect(report.upstreamMembers).toBe(1);
    expect(report.callableCoverage).toBe(1);
  });

  test("in.triggers agrees on all 168 fields, so a large surface can still score 1", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("in.triggers"));
    expect(report.upstreamFields).toBe(168);
    expect(report.declaredFields).toBe(168);
    expect(report.missingFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // The corpus's last two invented field names — `MSG_USE_PROJECTION` and
  // `ORTHOGRAPHIC_RENDER_SCRIPT_USED`, neither of which the pinned `camera.lua`
  // defines anywhere — were deleted rather than excepted, so both name sets are now
  // empty at once. The pair is re-checked against the fork text below, because an
  // empty `phantomFields` alone cannot tell a deleted declaration from a name the
  // reader stopped seeing.
  test("orthographic.camera declares upstream's nineteen constants and invents none", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("orthographic.camera"));
    expect(report.upstreamFields).toBe(19);
    expect(report.declaredFields).toBe(19);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // Upstream defines each transition and focus hash twice — flat at
  // `monarch.lua:25-33` and again as the `M.TRANSITION.*`/`M.FOCUS.*` grouping at
  // `:1369-1386`, where every grouped form carries `--- @deprecated`. The fork had
  // only the deprecated grouping, so the gap was an inversion rather than an
  // omission: the seven live names are declared and the grouping stays, upstream
  // still defining it.
  test("monarch.monarch declares the live transition and focus hashes it inverted", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.monarch"));
    expect(report.upstreamFields).toBe(15);
    expect(report.declaredFields).toBe(15);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
    // The raw term counts upstream comment blocks, so declaring members beneath the
    // `-- transition messages` / `-- focus messages` headers must charge no new
    // prose loss. Asserted from the same pass rather than assumed.
    expect(report.refusedDocBlocksTotal).toBe(6);
  });

  // `register` is upstream's `M.register = M.register_proxy` (`monarch.lua:292`) — a
  // field whose *value* is a function. Declaring it `export function register` would
  // also empty `missingFields` and also read `fieldCoverage: 1`, while leaving
  // `declaredFields` at 14 and pushing the name onto the callable axis as a phantom
  // member. All three terms come from one pass over the real artifact.
  test("monarch's register alias is declared on the field axis, not the callable one", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.monarch"));
    expect(report.declaredFields).toBe(15);
    expect(report.declaredMembers).toBe(36);
    expect(report.upstreamMembers).toBe(36);
    expect(report.phantomMembers).toEqual([]);
    expect(report.missingMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("an empty upstream field surface scores 1, as the callable axis already does", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.gui"));
    expect(report.upstreamFields).toBe(0);
    expect(report.fieldCoverage).toBe(1);
  });
});

// The six forks that declared not one upstream constant, corrected by declaring all
// 28 rather than excepting any: the ledger throws on a name the callable map does not
// hold, so a field exception is not expressible, and a `.d.ts` describes what the
// module exposes whether or not upstream advises against reaching for it.
//
// Every assertion pins `declaredFields === upstreamFields` rather than the ratio.
// `classifyFieldAxis` filters `missingFields` on `declaredCallable` too, so a constant
// declared as a `FUNCTION` empties the missing set and reads `fieldCoverage: 1` while
// leaving `declaredFields` short — the one wrong shape the ratio cannot see.
describe("the constants the metrics and dicebag forks left undeclared", () => {
  test.each([
    "metrics.fps",
    "metrics.mem",
  ])("%s declares upstream's three drawing defaults", (namespace) => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target(namespace));
    expect(report.upstreamFields).toBe(3);
    expect(report.declaredFields).toBe(3);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  test("dicebag declares the two tables upstream keeps its bag and roll state in", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("dicebag"));
    expect(report.upstreamFields).toBe(2);
    expect(report.declaredFields).toBe(2);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // A declaration that landed on the callable side would show up here rather than in
  // the field terms above: `phantomMembers` gains the name, because upstream holds it
  // as a variable and the comparison is over the callable map.
  test.each([
    ["nakama", 156],
    ["metrics.fps", 4],
    ["metrics.mem", 4],
    ["dicebag", 11],
  ])("the callable axis of %s is unmoved at %i members", (namespace, members) => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target(namespace as string));
    expect(report.upstreamMembers).toBe(members);
    expect(report.declaredMembers).toBe(members);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });
});

// What the three per-target assertions above become once none of them is a special
// case: every target the lane measures — those declaring `upstreamLua` rather than a
// `parityVerdict` — declares every constant its pinned upstream defines. Stated at
// corpus scope on purpose. Per-target floors accept a new fork at whatever value it
// happens to measure, so a library added tomorrow with an unexplained field gap would
// pass every figure above while this reds and names it.
describe("no measured target sits below 1 on the field axis", () => {
  const reports = authoredParityTargets(PACKAGE_ROOT).map((entry) =>
    buildAuthoredParity(PACKAGE_ROOT, entry),
  );

  test("the corpus is non-empty, so the invariant cannot hold vacuously", () => {
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.some((report) => report.upstreamFields > 0)).toBe(true);
  });

  test("every target declares every constant its upstream defines", () => {
    const below = reports
      .filter((report) => report.missingFields.length > 0 || report.fieldCoverage !== 1)
      .map(
        (report) =>
          `${report.namespace}: ${report.fieldCoverage} over ${report.upstreamFields} upstream fields — missing ${report.missingFields.join(", ") || "none"}`,
      );
    expect(below).toEqual([]);
  });

  // The other half of the axis, censused rather than asserted empty: `bzAnim` declares
  // three constants its README names and `bzLibrary.lua` defines nowhere, which is a
  // correction of its own and not this one. Named here so it stays visible and so a
  // *new* invented name cannot arrive unremarked behind a corpus-wide zero that was
  // never true.
  test("bzAnim's three README constants are the corpus's only invented fields", () => {
    const inventing = Object.fromEntries(
      reports
        .filter((report) => report.phantomFields.length > 0)
        .map((report) => [report.namespace, report.phantomFields]),
    );
    expect(inventing).toEqual({ bzAnim: ["DEBUG_LEVEL", "INFO_LEVEL", "TRACE_LEVEL"] });
  });
});

// `orthographic.camera` was the corpus's witness for this until its two invented names
// were deleted. `bzAnim` still carries three, but its `upstreamFields` is 0, so its
// score of 1 comes from the empty-surface guard rather than from the formula — leaving
// the formula's phantom-independence with no measured case at all, and a production
// edit charging phantoms to `fieldCoverage` would pass every corpus assertion above.
// The figure is computed inside `buildAuthoredParity` rather than in a pure helper, so
// the corner is pinned by driving that function over a synthetic target instead of by
// restating its formula.
describe("a phantom field enters neither side of the coverage figure", () => {
  const SYNTHETIC_UPSTREAM = ["KEPT", "ALSO_KEPT", "THIRD"];

  function syntheticReport(declared: string[]) {
    const root = mkdtempSync(join(tmpdir(), "authored-parity-field-axis-"));
    mkdirSync(join(root, "api-doc"), { recursive: true });
    mkdirSync(join(root, "upstream"), { recursive: true });
    const lua = [
      "local M = {}",
      ...SYNTHETIC_UPSTREAM.map((n) => `M.${n} = hash("${n}")`),
      "return M",
    ];
    writeFileSync(join(root, "upstream/mod.lua"), `${lua.join("\n")}\n`);
    writeFileSync(
      join(root, "api-doc/mod.json"),
      JSON.stringify({ elements: declared.map((name) => ({ type: "VARIABLE", name })) }),
    );
    return buildAuthoredParity(
      root,
      {
        repo: "",
        ref: "",
        license: "",
        authored: "fixtures/authored/mod.d.ts",
        moduleId: "mod",
        namespace: "mod",
        generated: "generated/mod.d.ts",
        apiDoc: "api-doc/mod.json",
        fidelity: "fidelity/mod.json",
        upstreamLua: ["upstream/mod.lua"],
      },
      {},
    );
  }

  test("the synthetic surface reads back as three upstream fields, so the corner is real", () => {
    const report = syntheticReport(SYNTHETIC_UPSTREAM);
    expect(report.upstreamFields).toBe(3);
    expect(report.declaredFields).toBe(3);
    expect(report.fieldCoverage).toBe(1);
  });

  test("an invented name is reported without moving a full score off 1", () => {
    const report = syntheticReport([...SYNTHETIC_UPSTREAM, "INVENTED"]);
    expect(report.phantomFields).toEqual(["INVENTED"]);
    expect(report.missingFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  // The discriminating case: one missing name and one invented one over three upstream
  // fields. The score is the missing-side fraction 2/3 — charging the phantom would
  // read 1/3, and taking the denominator from the declared side would read 2/3 only by
  // coincidence, which the asymmetric counts here rule out.
  test("a missing name and an invented one score the missing side alone", () => {
    const report = syntheticReport(["KEPT", "ALSO_KEPT", "INVENTED"]);
    expect(report.missingFields).toEqual(["THIRD"]);
    expect(report.phantomFields).toEqual(["INVENTED"]);
    expect(report.declaredFields).toBe(3);
    expect(report.fieldCoverage).toBe(0.6667);
  });
});

describe("a name callable on either side is compared, never counted as a field", () => {
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

// No measured target produces any of the four clauses any more. The last one that did
// — `monarch.transitions.gui`, which declared upstream's twelve functions as `VARIABLE`
// — has since been corrected to declare them as functions, and a corpus-parasitic form
// of this claim cannot survive a rollout that corrects every target. All four are
// therefore pinned on synthetic name sets driven straight through the classifier
// `buildAuthoredParity` itself calls.
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

// A variadic upstream definition has no fixed count to disagree with, so the corpus
// can only ever show the floor being exceeded. The declared-below-floor corner and the
// exact-agreement corner have no measured case at all, and are pinned here on scalars
// driven straight through the classifier `buildAuthoredParity` itself calls.
//
// These scalars are now the *sole* guard that the softening never reached a
// non-variadic member. The proof used to be parked on a measured target — orthographic
// carried four exact-count mismatches at zero variadic members, so a leaking rule would
// have emptied its list — and the signature-correction rollout has since emptied it by
// correcting the fork. Any corpus-parasitic form of this claim dies the same way: the
// rollout's own success removes the last mismatch to park it on, so the claim belongs on
// scalars that no correction can take away.
describe("a variadic upstream member is measured against a floor, not a count", () => {
  test("a non-variadic member still agrees on an exact count and disagrees otherwise", () => {
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [2],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 2,
    });
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [1],
      }),
    ).toEqual({
      agrees: false,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 1,
    });
  });

  test("a variadic member with no named parameters agrees at any declared count", () => {
    for (const declared of [0, 1, 4]) {
      expect(
        classifyArity({
          upstreamNamed: 0,
          upstreamVariadic: true,
          upstreamPlaceholder: false,
          declared: [declared],
        }),
      ).toEqual({
        agrees: true,
        floorChecked: true,
        overloadChecked: false,
        placeholderChecked: false,
        declaredWidest: declared,
      });
    }
  });

  test("named parameters stay a floor the fork must meet", () => {
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [2],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: true,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 2,
    });
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [3],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: true,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 3,
    });
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [1],
      }),
    ).toEqual({
      agrees: false,
      floorChecked: true,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 1,
    });
  });

  test("only a floor-checked member is one the count can report", () => {
    expect(
      classifyArity({
        upstreamNamed: 1,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [1],
      }).floorChecked,
    ).toBe(false);
    expect(
      classifyArity({
        upstreamNamed: 1,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [1],
      }).floorChecked,
    ).toBe(true);
  });
});

// A fork that models upstream's optional-argument branch as two overloads offers a
// *set* of call shapes where the comparison used to read one count — and the one it
// read was whichever api-doc element came last. `monarch.transitions.gui.create` is the
// case: upstream's `M.create(node)` carries an `if node then` branch, the fork declares
// `create(node)` and `create()`, and last-overload-wins charged it as a mismatch
// against zero. A correctly-modelled overload pair is not correctable in the fork and
// is not a ledger entry either — an exception claims the fork is right to *omit* a
// member, and the fork omits nothing. So the rule moves into the classifier, and
// `overloadedMembers` keeps the softening visible exactly as `variadicMembers` does.
describe("a fork offering several call shapes is measured against the set", () => {
  test("a single declared count still compares exactly, and reports no overload", () => {
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [3],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 3,
    });
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [4],
      }),
    ).toEqual({
      agrees: false,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 4,
    });
  });

  test("a declared set agrees when upstream's count is any member of it", () => {
    for (const upstreamNamed of [0, 1]) {
      expect(
        classifyArity({
          upstreamNamed,
          upstreamVariadic: false,
          upstreamPlaceholder: false,
          declared: [0, 1],
        }),
      ).toMatchObject({ agrees: true, overloadChecked: true });
    }
  });

  test("a declared set disagrees when upstream's count is none of them", () => {
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [0, 1],
      }),
    ).toMatchObject({ agrees: false, overloadChecked: true });
  });

  test("the floor rule applies per declared shape, so a variadic set meets it on any", () => {
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [0, 3],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: true,
      overloadChecked: true,
      placeholderChecked: false,
      declaredWidest: 3,
    });
    expect(
      classifyArity({
        upstreamNamed: 4,
        upstreamVariadic: true,
        upstreamPlaceholder: false,
        declared: [0, 3],
      }),
    ).toEqual({
      agrees: false,
      floorChecked: true,
      overloadChecked: true,
      placeholderChecked: false,
      declaredWidest: 3,
    });
  });

  test("overloadChecked is true whenever the set holds more than one count", () => {
    expect(
      classifyArity({
        upstreamNamed: 1,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [0, 1],
      }).overloadChecked,
    ).toBe(true);
    expect(
      classifyArity({
        upstreamNamed: 9,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [0, 1],
      }).overloadChecked,
    ).toBe(true);
  });

  // `arityMismatches` reports one number per name, so a disagreeing set has to collapse
  // to one — the widest shape the fork offers, which is the one a reader corrects
  // against. Computed in the verdict rather than at the call site: the corpus holds no
  // disagreeing overloaded member to pin it on, and a `declared[0]` regression would
  // otherwise be invisible.
  test("a disagreeing set collapses to the widest declared shape, a single count to itself", () => {
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [0, 1],
      }).declaredWidest,
    ).toBe(1);
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [5, 3],
      }).declaredWidest,
    ).toBe(5);
    expect(
      classifyArity({
        upstreamNamed: 2,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [4],
      }).declaredWidest,
    ).toBe(4);
  });

  test("monarch.transitions.gui declares upstream's twenty members and agrees on every one", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.gui"));
    expect(report.upstreamMembers).toBe(20);
    expect(report.declaredMembers).toBe(20);
    expect(report.missingMembers).toEqual([]);
    expect(report.phantomMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.overloadedMembers).toBe(1);
    expect(report.callableCoverage).toBe(1);
  });

  // The twelve transitions moved from `VARIABLE` to `FUNCTION`, so the field axis has
  // to be seen not to have gained anything on the way past: upstream defines no
  // constant in this module at all.
  test("the transitions left the field axis rather than being counted on both", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("monarch.transitions.gui"));
    expect(report.declaredFields).toBe(0);
    expect(report.upstreamFields).toBe(0);
    expect(report.phantomFields).toEqual([]);
    expect(report.fieldCoverage).toBe(1);
  });

  test("the term is 0 on every target whose api-doc names each function once", () => {
    const overloaded = authoredParityTargets(PACKAGE_ROOT)
      .map((entry) => buildAuthoredParity(PACKAGE_ROOT, entry))
      .filter((report) => report.overloadedMembers > 0)
      .map((report) => `${report.namespace}: ${report.overloadedMembers}`);
    expect(overloaded).toEqual(["monarch.transitions.gui: 1"]);
  });
});

// `nakama.lua` opens *"Code generated by codegen/generate-rest.go. DO NOT EDIT."*, and 66
// of its exports end in a bare `_` — `create_api_account_apple(token_str, vars_obj, _)`.
// No body reads it and no LuaDoc block documents it: it is the generator's trailing
// discard, not a parameter a consumer can pass meaningfully, so charging the fork for
// omitting it is the instrument's defect. Same shape as the variadic floor above, same
// treatment — the reader keeps transcribing upstream faithfully, the *comparison* drops
// the discard before counting, and `placeholderMembers` keeps the softening visible.
describe("a generated trailing discard is dropped before the counts are compared", () => {
  test("a trailing discard is not charged as a parameter, a real one still is", () => {
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: false,
        upstreamPlaceholder: true,
        declared: [2],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: true,
      declaredWidest: 2,
    });
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: false,
        upstreamPlaceholder: false,
        declared: [2],
      }),
    ).toEqual({
      agrees: false,
      floorChecked: false,
      overloadChecked: false,
      placeholderChecked: false,
      declaredWidest: 2,
    });
  });

  // Only the *last* parameter is unreachable by position: a `_` upstream names in the
  // middle still has to be passed for the ones after it to land, so the fork declares it.
  // The same argument decides the `...` case, because `readParams` filters the tail out of
  // the list: a `_` written before it only *looks* trailing, and a caller fills that slot
  // for any vararg to land.
  test("only a positionally unreachable discard is dropped", () => {
    expect(hasTrailingDiscard(["a", "_", "b"], false)).toBe(false);
    expect(hasTrailingDiscard(["a", "_"], false)).toBe(true);
    expect(hasTrailingDiscard(["a", "_"], true)).toBe(false);
  });

  test("placeholderChecked is true whether or not the drop changed the verdict", () => {
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: false,
        upstreamPlaceholder: true,
        declared: [1],
      }),
    ).toMatchObject({ agrees: false, placeholderChecked: true });
    expect(
      classifyArity({
        upstreamNamed: 1,
        upstreamVariadic: false,
        upstreamPlaceholder: true,
        declared: [0],
      }),
    ).toMatchObject({ agrees: true, placeholderChecked: true });
  });

  test("the drop happens before the floor, so a variadic member softens too", () => {
    expect(
      classifyArity({
        upstreamNamed: 3,
        upstreamVariadic: true,
        upstreamPlaceholder: true,
        declared: [2],
      }),
    ).toEqual({
      agrees: true,
      floorChecked: true,
      overloadChecked: false,
      placeholderChecked: true,
      declaredWidest: 2,
    });
  });

  // 66 is every discard upstream writes, and the term reaches it only because the fork
  // now declares all 156 members: it counts *compared* members, as `variadicMembers` and
  // `overloadedMembers` beside it do, so it read 59 while seven discard-carrying
  // constructors were still among the sixteen the fork left undeclared.
  test("nakama's generated discards are the whole softening the corpus carries", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("nakama"));
    expect(report.placeholderMembers).toBe(66);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  // The softening is not merely subtractive, which is the check that it is honest rather
  // than convenient: the fork declared the discard as a real second parameter
  // (`value_str: any`), so dropping `_` exposed that as the defect it was instead of
  // hiding it — and correcting it is why the member now agrees at upstream's one.
  test("create_protobuf_any agrees at the one parameter upstream names", () => {
    const declared = apiDocElements(target("nakama")).filter(
      (element) => element.type === "FUNCTION" && element.name === "create_protobuf_any",
    );
    expect(declared.length).toBe(1);
    expect(declared[0]?.parameters?.length).toBe(1);
  });

  test("no other measured target carries the generated shape", () => {
    const softened = authoredParityTargets(PACKAGE_ROOT)
      .map((entry) => buildAuthoredParity(PACKAGE_ROOT, entry))
      .filter((report) => report.placeholderMembers > 0)
      .map((report) => `${report.namespace}: ${report.placeholderMembers}`);
    expect(softened).toEqual(["nakama: 66"]);
  });
});

describe("the six variadic members the corpus was charging as arity gaps", () => {
  test("deftest and zzfx reach a full callable coverage once the floor rule applies", () => {
    const deftest = buildAuthoredParity(PACKAGE_ROOT, target("deftest"));
    expect(deftest.callableCoverage).toBe(1);
    expect(deftest.variadicMembers).toBe(1);
    expect(deftest.arityMismatches).toEqual([]);

    const zzfx = buildAuthoredParity(PACKAGE_ROOT, target("zzfx"));
    expect(zzfx.callableCoverage).toBe(1);
    expect(zzfx.variadicMembers).toBe(2);
    expect(zzfx.arityMismatches).toEqual([]);
  });

  test("defmath's three variadic members reach a full coverage against their floor", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("defmath"));
    expect(report.variadicMembers).toBe(3);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("the other thirty-two targets share no variadic member at all", () => {
    const moved = new Set(["deftest", "defmath", "zzfx"]);
    const untouched = authoredParityTargets(PACKAGE_ROOT).filter(
      (entry) => !moved.has(entry.namespace),
    );
    expect(untouched.length).toBe(32);
    for (const entry of untouched) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(`${entry.namespace}: ${report.variadicMembers}`).toBe(`${entry.namespace}: 0`);
    }
  });
});

// The ledger is what makes *corrected or justified* a real disjunction. A divergence
// upstream's own comments justify is counted correct rather than charged as missing,
// and stays named in the report with the reason — so a target reaching 1 by
// justification reads differently from one reaching 1 by declaring everything.
//
// The synthetic entries below run through the same production pass as the manifest,
// hosted on `boom` — whose five omissions are `script-lifecycle` and therefore
// permanent by design. A host that is merely *awaiting* correction stops providing the
// shape the moment the rollout reaches it, which is how this suite lost its first host.
describe("a justified divergence is counted correct and stays named", () => {
  const BOOM = "boom";

  function excepting(entries: AuthoredParityException[]) {
    return buildAuthoredParity(PACKAGE_ROOT, target(BOOM), { [BOOM]: entries });
  }

  const SYNTHETIC: AuthoredParityException = {
    name: "init",
    kind: "script-lifecycle",
    reason: "synthetic entry, exercising the ledger against a real surface",
  };

  test("an excepted member the fork omits is counted correct instead of missing", () => {
    // The committed ledger already excepts all five, so the un-excepted baseline is
    // the empty override rather than the measured artifact.
    const bare = buildAuthoredParity(PACKAGE_ROOT, target(BOOM), {});
    expect(bare.missingMembers).toContain("init");
    expect(bare.callableCoverage).toBe(0.1667);

    const report = excepting([SYNTHETIC]);
    expect(report.missingMembers).not.toContain("init");
    expect(report.missingMembers.length).toBe(bare.missingMembers.length - 1);
    // 2 of 6 rather than 1: the exception moved the member across, it did not hide it.
    expect(report.callableCoverage).toBe(0.3333);
  });

  test("the exception stays in the report, carrying its kind and its reason", () => {
    expect(excepting([SYNTHETIC]).parityExceptions).toEqual([SYNTHETIC]);
  });

  test("the reported list is sorted by name, as every other list is", () => {
    const report = excepting([
      { ...SYNTHETIC, name: "update" },
      SYNTHETIC,
      { ...SYNTHETIC, name: "final" },
    ]);
    expect(report.parityExceptions.map((entry) => entry.name)).toEqual(["final", "init", "update"]);
  });

  test("a target with no ledger entry reports an empty list", () => {
    const excepted = new Set(Object.keys(readAuthoredExceptions(PACKAGE_ROOT)));
    const plain = authoredParityTargets(PACKAGE_ROOT).filter(
      (entry) => !excepted.has(entry.namespace),
    );
    expect(plain.length).toBeGreaterThan(0);
    for (const entry of plain) {
      const report = buildAuthoredParity(PACKAGE_ROOT, entry);
      expect(`${entry.namespace}: ${report.parityExceptions.length}`).toBe(`${entry.namespace}: 0`);
    }
  });
});

// An exception outlives nothing. Each throw names the entry, because a ledger that
// silently ignored a stale line would keep crediting a defect that no longer exists —
// or, worse, credit a member the fork has since declared and count it twice.
describe("the ledger cannot outlive the defect it justifies", () => {
  const BOOM = "boom";

  test("an entry naming a member upstream does not export throws, naming it", () => {
    expect(() =>
      buildAuthoredParity(PACKAGE_ROOT, target(BOOM), {
        [BOOM]: [{ name: "on_reload", kind: "script-lifecycle", reason: "stale" }],
      }),
    ).toThrow(/boom\.on_reload.*upstream/s);
  });

  test("an entry for a member the fork does declare throws, naming it", () => {
    expect(() =>
      buildAuthoredParity(PACKAGE_ROOT, target(BOOM), {
        [BOOM]: [{ name: "boom", kind: "script-lifecycle", reason: "unnecessary" }],
      }),
    ).toThrow(/boom\.boom.*declares/s);
  });

  test("a kind outside the closed set throws, naming the namespace and the member", () => {
    expect(() =>
      parseAuthoredExceptions(
        { boom: [{ name: "init", kind: "inconvenient", reason: "…" }] },
        AUTHORED_EXCEPTIONS_MANIFEST_FILE,
      ),
    ).toThrow(/boom\.init.*inconvenient/s);
  });

  test("a malformed manifest throws rather than reaching the pass as an empty ledger", () => {
    const malformed: [unknown, RegExp][] = [
      [[], /expected a JSON object/],
      [{ boom: { name: "init" } }, /must be an array/],
      [{ boom: [{ kind: "script-lifecycle", reason: "…" }] }, /"name"/],
      [{ boom: [{ name: "init", kind: "script-lifecycle" }] }, /"reason"/],
      [{ boom: [{ name: "init", kind: "script-lifecycle", reason: "" }] }, /"reason"/],
    ];
    for (const [raw, message] of malformed) {
      expect(() => parseAuthoredExceptions(raw, AUTHORED_EXCEPTIONS_MANIFEST_FILE)).toThrow(
        message,
      );
    }
  });
});

// The two classes the ledger was built for, both read out of the pinned `camera.lua`:
// three members whose LuaDoc says the camera.script calls them, and six one-line stubs
// whose whole body is `error("… is deprecated")`. Declaring a member that throws on
// every call is worse than not declaring it, so all six are absent from the fork.
describe("orthographic.camera declares upstream's live surface and none of its dead one", () => {
  const report = buildAuthoredParity(PACKAGE_ROOT, target("orthographic.camera"));

  test("every upstream member is now declared or justified", () => {
    expect(report.upstreamMembers).toBe(35);
    expect(report.missingMembers).toEqual([]);
    expect(report.arityMismatches).toEqual([]);
    expect(report.callableCoverage).toBe(1);
  });

  test("the nine exceptions are the three lifecycle hooks and the six dead stubs", () => {
    const byKind = (kind: string) =>
      report.parityExceptions.filter((entry) => entry.kind === kind).map((entry) => entry.name);
    expect(byKind("script-lifecycle")).toEqual(["final", "init", "update"]);
    expect(byKind("deprecated-stub")).toEqual([
      "add_projector",
      "get_projection_id",
      "send_view_projection",
      "set_dpi_ratio",
      "use_projector",
      "world_to_window",
    ]);
    expect(report.parityExceptions.length).toBe(9);
  });

  // The nine exceptions are a callable-axis instrument and stay one: the field
  // correction that closed this target's constants neither added an entry nor made an
  // existing one unnecessary, which the ledger would have thrown on outright.
  test("closing the field axis left the callable exceptions untouched", () => {
    expect(report.fieldCoverage).toBe(1);
    expect(report.missingFields).toEqual([]);
    expect(report.phantomFields).toEqual([]);
    expect(report.parityExceptions.length).toBe(9);
  });

  // `world_to_screen`'s third parameter was silently ignored at runtime — upstream's
  // body delegates to `camera.world_to_screen(world, component_url)` (camera.lua:730)
  // and its own `@param` block names two. The count agreeing is what says so.
  test("the automatic-zoom pair is declared and world_to_screen reads two parameters", () => {
    const declared = new Set(
      apiDocElements(target("orthographic.camera"))
        .filter((element) => element.type === "FUNCTION")
        .map((element) => element.name),
    );
    expect(declared).toContain("get_automatic_zoom");
    expect(declared).toContain("set_automatic_zoom");
    for (const dead of ["add_projector", "get_projection_id", "use_projector"]) {
      expect(declared).not.toContain(dead);
    }
  });
});

describe("the declared field side reads only api-doc VARIABLE elements", () => {
  function declaredTypes(entry: AuthoredTarget, type: string): string[] {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, entry.apiDoc), "utf8")) as {
      elements: { type: string; name: string }[];
    };
    return doc.elements.filter((element) => element.type === type).map((element) => element.name);
  }

  // Both targets declare each kind and no global, so the `VARIABLE` count is the whole
  // of `declaredFields` and a counted `TYPEDEF` would push the figure past it. The
  // second assertion names where such a name would surface: upstream holds no field by
  // any of these type names, so a counted one becomes a phantom field.
  test.each(["nakama", "platypus"])("%s's TYPEDEFs are not counted as declared fields", (name) => {
    const entry = target(name);
    const typedefs = declaredTypes(entry, "TYPEDEF");
    expect(typedefs.length).toBeGreaterThan(0);
    const report = buildAuthoredParity(PACKAGE_ROOT, entry);
    expect(report.declaredGlobals).toBe(0);
    expect(report.declaredFields).toBe(declaredTypes(entry, "VARIABLE").length);
    expect(report.phantomFields.filter((field) => typedefs.includes(field))).toEqual([]);
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

  // The classification the name states is now what the ledger acts on: `M.boom` is the
  // one member upstream tells a consumer to call, and the other five carry
  // `-- called from boom.script`. The target reaches a full callable coverage with no
  // edit to its fork at all, which is the clearest statement of what an entry means.
  test("boom declares one of six, the five lifecycle hooks its script calls being absent", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("boom"));
    expect(report.upstreamMembers).toBe(6);
    expect(report.declaredMembers).toBe(1);
    expect(report.missingMembers).toEqual([]);
    expect(report.parityExceptions.map((entry) => entry.name)).toEqual([
      "final",
      "init",
      "on_input",
      "on_message",
      "update",
    ]);
    expect(report.parityExceptions.map((entry) => entry.kind)).toEqual(
      Array(5).fill("script-lifecycle"),
    );
    expect(report.callableCoverage).toBe(1);
  });

  // The five `--` blocks the reader refuses are exactly the five excepted members, so
  // the ledger carries as a checkable reason the prose the reader cannot import — and
  // charges none of them, the fork declaring no element to hang a brief on. Both terms
  // are recomputed here, so a ledger that quietly declared members would move them.
  test("boom's ambient globals are counted, not charged to it as invented members", () => {
    const report = buildAuthoredParity(PACKAGE_ROOT, target("boom"));
    expect(report.phantomMembers).toEqual([]);
    expect(report.declaredGlobals).toBe(87);
    expect(report.refusedDocBlocksTotal).toBe(5);
    expect(report.refusedDocBlocks).toBe(0);
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
    expect(report.callableCoverage).toBe(1);
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

// `undocumentedMembers` means upstream prose that reached neither the fork nor the
// import. The shortfall it used to carry did not vanish, it moved: `importedDocs` is
// where it went, so a target the import silently skipped shows up as a non-zero
// `undocumentedMembers` rather than as an unexplained drop.
describe("the shortfall the import absorbed is accounted for, not merely absent", () => {
  const reports = authoredParityTargets(PACKAGE_ROOT).map((entry) =>
    buildAuthoredParity(PACKAGE_ROOT, entry),
  );

  // The nine are nakama's `create_api_validate_purchase_*` and
  // `create_api_validate_subscription_*` requests, `create_api_validated_subscription`,
  // `create_protobuf_any` and `create_rpc_status`, whose whole block is the member's own
  // name above a run of `@param` tags. There is no prose to lower, so charging them is
  // correct — the alternative the import used to ship was a brief that restated the
  // symbol. Four joined the list when the fork declared the subscriptions area upstream
  // had and it did not.
  test("the only members left undocumented are the ones upstream never wrote prose for", () => {
    const stragglers = reports
      .filter((report) => report.undocumentedMembers > 0)
      .map((report) => `${report.namespace}: ${report.undocumentedMembers}`);
    expect(stragglers).toEqual(["nakama: 9"]);
  });

  // Exactly what the callable rollout left: nakama's three run-leading constants no
  // longer import, now that `extractApiDoc` carries a fork doc-comment onto a
  // `VARIABLE` element. `sync-authored-types.test.ts` pins that opt-out directly.
  test("the corpus imports 254 briefs", () => {
    expect(reports.reduce((sum, report) => sum + report.importedDocs, 0)).toBe(254);
  });
});

// A block the reader declines leaves `member.doc === ""`, which `undocumentedMembers`
// cannot charge — the prose is gone and every term reads clean. `refusedDocBlocksTotal`
// is what makes that refusal visible, so a target the reader declined stays
// distinguishable from one upstream never documented even once every block is answered
// and the narrowed `refusedDocBlocks` reads 0.
describe("upstream prose the reader declined is reported, not absent", () => {
  const reports = authoredParityTargets(PACKAGE_ROOT).map((entry) =>
    buildAuthoredParity(PACKAGE_ROOT, entry),
  );

  test("nakama.util.log records `format`'s `--`-only block rather than reading clean", () => {
    const report = reports.find((entry) => entry.namespace === "nakama.util.log");
    expect(report?.refusedDocBlocksTotal).toBe(1);
    expect(report?.undocumentedMembers).toBe(0);
  });

  // Both axes, which is why the count is taken over the whole upstream surface rather
  // than in the arity loop: `monarch.monarch`'s six and `rendy`'s thirteen sit above
  // constants, which that loop never visits.
  test("the raw term is non-zero on exactly the targets holding such a block", () => {
    const refused = Object.fromEntries(
      reports
        .filter((report) => report.refusedDocBlocksTotal > 0)
        .map((report) => [report.namespace, report.refusedDocBlocksTotal])
        .sort(([a], [b]) => (a as string).localeCompare(b as string)),
    );
    expect(refused).toEqual({
      boom: 5,
      defcon: 1,
      defmath: 36,
      "in.onscreen": 1,
      "in.textbox": 1,
      "monarch.monarch": 6,
      "monarch.transitions.gui": 1,
      nakama: 3,
      "nakama.util.log": 1,
      persist: 5,
      rendy: 13,
      zzfx: 4,
    });
    expect(Object.values(refused).reduce<number>((sum, n) => sum + (n as number), 0)).toBe(77);
  });

  // The module writes every one of its blocks with a plain `--`, so the reader declines
  // all of them; the fork answers every one in its own api-doc, which is why the
  // narrowed term reads 0 while the raw one still reports the largest refusal in the
  // corpus. Without the raw term that reads as a module upstream never documented.
  test("defmath, whose whole module is `--`-documented, is the corpus's largest refusal", () => {
    const report = reports.find((entry) => entry.namespace === "defmath");
    expect(report?.refusedDocBlocksTotal).toBe(36);
    expect(report?.refusedDocBlocks).toBe(0);
    expect(report?.undocumentedMembers).toBe(0);
  });

  test("every other target reads 0, so the raw term is not a constant", () => {
    const clean = reports.filter((report) => report.refusedDocBlocksTotal === 0);
    expect(clean.length).toBeGreaterThan(reports.length - clean.length);
  });
});

// `refusedDocBlocks` counts a property of the *reader*, which no fork edit can move,
// so the remedy the guide names cannot drive it to 0. Narrowed to "refused *and*
// unanswered" it measures documentation actually missing from `/api`, while
// `refusedDocBlocksTotal` keeps the raw refusal count so a 0 cannot be misread as
// upstream writing no `--`-only blocks.
describe("only a refusal the fork left unanswered is charged", () => {
  const reports = authoredParityTargets(PACKAGE_ROOT).map((entry) =>
    buildAuthoredParity(PACKAGE_ROOT, entry),
  );

  // Four refused blocks over four dispositions the term has to tell apart: answered by
  // the fork, answered by nobody, excused by the ledger, and missing from the fork
  // entirely. The corpus has no instance of the last, so it is pinned here.
  function syntheticReport(exceptions: AuthoredParityException[]) {
    const root = mkdtempSync(join(tmpdir(), "authored-parity-refusal-"));
    mkdirSync(join(root, "api-doc"), { recursive: true });
    mkdirSync(join(root, "upstream"), { recursive: true });
    writeFileSync(
      join(root, "upstream/mod.lua"),
      [
        "local M = {}",
        "",
        "-- the fork answers this one",
        'M.DOCUMENTED = hash("DOCUMENTED")',
        "",
        "-- nobody answers this one",
        'M.BARE = hash("BARE")',
        "",
        "-- called from mod.script",
        "function M.excepted(a)",
        "end",
        "",
        "-- upstream prose the fork never declared a home for",
        "function M.absent(a)",
        "end",
        "",
        "return M",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(root, "api-doc/mod.json"),
      JSON.stringify({
        elements: [
          {
            type: "VARIABLE",
            name: "DOCUMENTED",
            brief: "The fork's own words.",
            description: "The fork's own words.",
          },
          { type: "VARIABLE", name: "BARE", brief: "", description: "" },
        ],
      }),
    );
    return buildAuthoredParity(
      root,
      {
        repo: "",
        ref: "",
        license: "",
        authored: "fixtures/authored/mod.d.ts",
        moduleId: "mod",
        namespace: "mod",
        generated: "generated/mod.d.ts",
        apiDoc: "api-doc/mod.json",
        fidelity: "fidelity/mod.json",
        upstreamLua: ["upstream/mod.lua"],
      },
      { mod: exceptions },
    );
  }

  const EXCUSED: AuthoredParityException = {
    name: "excepted",
    kind: "script-lifecycle",
    reason: "mod.lua:9 — the engine calls it, the fork does not declare it",
  };

  test("the synthetic surface holds four refused blocks, so the corner is real", () => {
    expect(syntheticReport([EXCUSED]).refusedDocBlocksTotal).toBe(4);
  });

  test("a block the fork's own prose answers is not charged", () => {
    const report = syntheticReport([EXCUSED]);
    expect(report.missingMembers).toEqual(["absent"]);
    expect(report.refusedDocBlocks).toBe(2);
  });

  test("a recorded parityException excuses its block; a merely missing name does not", () => {
    const excused = syntheticReport([EXCUSED]);
    const unexcused = syntheticReport([]);
    expect(excused.parityExceptions.map((entry) => entry.name)).toEqual(["excepted"]);
    expect(excused.refusedDocBlocks).toBe(2);
    // Dropping the ledger entry turns the same member into a plain missing name, and the
    // charge goes up by exactly one: the excuse is the entry, never the absence.
    expect(unexcused.missingMembers).toEqual(["absent", "excepted"]);
    expect(unexcused.refusedDocBlocks).toBe(3);
    expect(unexcused.refusedDocBlocksTotal).toBe(4);
  });

  // The narrowing can only ever subtract: a corpus where the two terms agreed on every
  // target would mean the filter never fired and the reclassification is not in effect.
  test("the corpus charge is a strict narrowing of the refusals, never an addition", () => {
    for (const report of reports) {
      expect(report.refusedDocBlocks).toBeLessThanOrEqual(report.refusedDocBlocksTotal);
    }
    const narrowed = reports.filter(
      (report) => report.refusedDocBlocks < report.refusedDocBlocksTotal,
    );
    expect(narrowed.map((report) => report.namespace).sort()).toEqual([
      "boom",
      "defcon",
      "defmath",
      "in.onscreen",
      "in.textbox",
      "monarch.monarch",
      "monarch.transitions.gui",
      "nakama",
      "nakama.util.log",
      "persist",
      "rendy",
      "zzfx",
    ]);
  });

  // The axis closes: every refused block is now answered by the fork's own words or
  // excused by the ledger, and no target is left charging one. The raw term holding at
  // 77 is what makes that a closure rather than a target quietly dropping out of the
  // pass — a fork brief deleted, or a file un-vendored, moves one of the two.
  test("no target charges a refusal, while the reader diagnostic still reads 77", () => {
    expect(reports.filter((report) => report.refusedDocBlocks > 0)).toEqual([]);
    expect(reports.reduce((sum, report) => sum + report.refusedDocBlocksTotal, 0)).toBe(77);
  });

  // The one target whose zero comes entirely from the ledger rather than from authored
  // prose, so the two excuses stay visibly distinct.
  test("boom's five are excused by their ledger entries, none of them declared", () => {
    const report = reports.find((entry) => entry.namespace === "boom");
    expect(report?.refusedDocBlocksTotal).toBe(5);
    expect(report?.refusedDocBlocks).toBe(0);
    expect(report?.parityExceptions.map((entry) => entry.name).sort()).toEqual([
      "final",
      "init",
      "on_input",
      "on_message",
      "update",
    ]);
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
      const excepted = report.parityExceptions.map((entry) => entry.name);
      expect(excepted).toEqual([...excepted].sort());
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
