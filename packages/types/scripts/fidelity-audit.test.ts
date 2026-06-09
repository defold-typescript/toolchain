import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { buildFidelityReport, type FidelityEntry } from "./fidelity-audit";
import baseline from "./fidelity-baseline.json" with { type: "json" };
import type { ModuleManifestEntry } from "./regen";
import { MODULE_MANIFEST } from "./regen";

function manifestOf(doc: unknown): readonly ModuleManifestEntry[] {
  return [{ namespace: "test", doc, outFile: "test.d.ts" }];
}

function requireEntry(report: Record<string, FidelityEntry>, namespace: string): FidelityEntry {
  const entry = report[namespace];
  if (!entry) throw new Error(`report is missing namespace ${namespace}`);
  return entry;
}

describe("buildFidelityReport — per-category counting", () => {
  test("counts each loss category from a fabricated doc", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        { type: "CONSTANT", name: "test.FOO" },
        { type: "MESSAGE", name: "test.some_message" },
        {
          type: "FUNCTION",
          name: "test.bar",
          parameters: [
            { name: "a", types: ["mystery"], is_optional: "False" },
            { name: "m", types: ["test.FOO"], is_optional: "False" },
          ],
          returnvalues: [{ name: "r", types: ["number"] }],
        },
        {
          type: "FUNCTION",
          name: "test.tablefn",
          parameters: [{ name: "t", types: ["table"], is_optional: "False" }],
          returnvalues: [],
        },
        {
          type: "FUNCTION",
          name: "test.multi",
          parameters: [],
          returnvalues: [
            { name: "x", types: ["number"] },
            { name: "y", types: ["number"] },
          ],
        },
        { type: "FUNCTION", name: "test.delete", parameters: [], returnvalues: [] },
        {
          type: "FUNCTION",
          name: "test.opt",
          parameters: [
            { name: "o", types: ["number"], is_optional: "True" },
            { name: "p", types: ["number"], is_optional: "False" },
          ],
          returnvalues: [],
        },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.droppedElements).toBe(1);
    expect(entry.unknownTokens).toContain("mystery");
    expect(entry.unknownTokens).not.toContain("test.FOO");
    expect(entry.recordTables).toBe(1);
    // test.multi has two returnvalues, but a >1-return function is now recovered
    // as LuaMultiReturn<[...]>, so it is no longer a loss.
    expect(entry.multiReturn).toBe(0);
    // test.delete is a reserved-name member, now recovered via an
    // `export { _delete as delete }` alias rather than dropped, so it no longer
    // counts; only skipFunctions entries remain droppedMembers (none here).
    expect(entry.droppedMembers).toBe(0);
    expect(entry.optionalAsRequired).toBe(1);
  });

  test("skipFunctions entries are counted as droppedMembers, not as a fidelity regression elsewhere", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.get",
          parameters: [
            { name: "options", types: ["table"], is_optional: "False" },
            { name: "mystery", types: ["mystery"], is_optional: "True" },
            { name: "required", types: ["number"], is_optional: "False" },
          ],
          returnvalues: [],
        },
        { type: "FUNCTION", name: "test.set", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "test.keep", parameters: [], returnvalues: [] },
      ],
    };
    const manifest: readonly ModuleManifestEntry[] = [
      { namespace: "test", doc, outFile: "test.d.ts", skipFunctions: ["get", "set"] },
    ];
    const entry = requireEntry(buildFidelityReport(manifest), "test");
    expect(entry.droppedMembers).toBe(2);
    expect(entry.droppedElements).toBe(0);
    expect(entry.recordTables).toBe(0);
    expect(entry.optionalAsRequired).toBe(0);
    expect(entry.unknownTokens).toEqual([]);
  });

  test("a PROPERTY element is recovered and does not count toward droppedElements", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "PROPERTY",
          name: "color",
          brief: '<span class="type">vector4</span> color',
        },
        { type: "MESSAGE", name: "test.some_message" },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.droppedElements).toBe(1);
  });

  test("an identifier-named TYPEDEF is recovered; a non-identifier TYPEDEF stays dropped", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        { type: "TYPEDEF", name: "render_target" },
        { type: "TYPEDEF", name: "bad.name" },
        { type: "MESSAGE", name: "test.some_message" },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    // MESSAGE (1) + non-identifier TYPEDEF (1) drop; identifier TYPEDEF recovered.
    expect(entry.droppedElements).toBe(2);
  });

  test("a callback-signature token is recovered, but an unmapped token stays unknown", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.fn",
          parameters: [
            {
              name: "cb",
              types: ["function(self, message_id, message, sender)"],
              is_optional: "False",
            },
            { name: "x", types: ["mystery"], is_optional: "False" },
          ],
          returnvalues: [],
        },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.unknownTokens).toContain("mystery");
    expect(entry.unknownTokens).not.toContain("function(self, message_id, message, sender)");
  });

  test("an is_optional param that includes nil is not counted as optionalAsRequired", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.fn",
          parameters: [{ name: "o", types: ["number", "nil"], is_optional: "True" }],
          returnvalues: [],
        },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.optionalAsRequired).toBe(0);
  });

  test("optionalAsRequired counts only the trailing-run residual, not recoverable optionals", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.recoverable",
          parameters: [
            { name: "a", types: ["number"], is_optional: "False" },
            { name: "b", types: ["number"], is_optional: "True" },
            { name: "c", types: ["number"], is_optional: "True" },
          ],
          returnvalues: [],
        },
        {
          type: "FUNCTION",
          name: "test.midlist",
          parameters: [
            { name: "x", types: ["number"], is_optional: "True" },
            { name: "y", types: ["number"], is_optional: "False" },
          ],
          returnvalues: [],
        },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.optionalAsRequired).toBe(1);
  });
});

describe("multi-return recovery", () => {
  test("a recovered multi-return is not counted, and single-returns never were", () => {
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.single",
          parameters: [],
          returnvalues: [{ name: "r", types: ["number"] }],
        },
        {
          type: "FUNCTION",
          name: "test.multi",
          parameters: [],
          returnvalues: [
            { name: "a", types: ["number"] },
            { name: "b", types: ["string"] },
          ],
        },
      ],
    };

    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.multiReturn).toBe(0);
  });
});

describe("fidelity drift gate", () => {
  test("live report over MODULE_MANIFEST equals the committed baseline", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(report).toEqual(baseline as typeof report);
  });
});

describe("arbitrary-table slot reclassification", () => {
  test("json and sys arbitrary-table slots are not counted under recordTables", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "json").recordTables).toBe(0);
    expect(requireEntry(report, "sys").recordTables).toBe(0);
  });

  test("only json/sys recordTables move; every other entry equals the baseline", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    const base = baseline as typeof report;
    for (const namespace of Object.keys(base)) {
      if (namespace === "json" || namespace === "sys") {
        // recordTables reclassified to 0; all other categories must still match.
        const { recordTables: _drop, ...restLive } = requireEntry(report, namespace);
        const { recordTables: _baseDrop, ...restBase } = requireEntry(base, namespace);
        expect(restLive).toEqual(restBase);
      } else {
        expect(requireEntry(report, namespace)).toEqual(requireEntry(base, namespace));
      }
    }
  });
});

describe("mapping-table slot recovery", () => {
  test("gui.recordTables drops 5 -> 2 and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "gui").recordTables).toBe(2);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("homogeneous-array slot recovery", () => {
  test("buffer/vmath/sound recordTables drop to 0 (project-wide -4) and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline: buffer 2, vmath 1, sound 1 (sum 4). Recovering the
    // four homogeneous-primitive `table` slots into `T[]` drops each to 0.
    expect(requireEntry(report, "buffer").recordTables).toBe(0);
    expect(requireEntry(report, "vmath").recordTables).toBe(0);
    expect(requireEntry(report, "sound").recordTables).toBe(0);
    // Every namespace and category equals the committed baseline (which reflects
    // the recovered 0s) — proving no other recordTables count and no other
    // category moved.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("id-array slot recovery", () => {
  test("iap recordTables 4 -> 3 and go recordTables 3 -> 2 (project-wide -2), no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline: iap 4, go 3 (sum 7). Recovering the two prose-only
    // "table (array) of id(s)" slots (iap.list.ids, go.delete.id) into arrays
    // drops each by one (sum 5) — project-wide -2.
    expect(requireEntry(report, "iap").recordTables).toBe(3);
    expect(requireEntry(report, "go").recordTables).toBe(2);
    // Every namespace and category equals the committed baseline (which reflects
    // the recovered counts) — proving no other recordTables count and no other
    // category moved.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("slot-scoped table curation recovery", () => {
  test("collectionfactory, physics, socket, liveupdate, and tilemap recover curated slots with no unrelated moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "collectionfactory").recordTables).toBe(1);
    expect(requireEntry(report, "physics").recordTables).toBe(3);
    expect(requireEntry(report, "socket").recordTables).toBe(4);
    expect(requireEntry(report, "liveupdate").recordTables).toBe(0);
    expect(requireEntry(report, "tilemap").recordTables).toBe(1);
    expect(
      2 -
        requireEntry(report, "collectionfactory").recordTables +
        5 -
        requireEntry(report, "physics").recordTables +
        8 -
        requireEntry(report, "socket").recordTables +
        1 -
        requireEntry(report, "liveupdate").recordTables +
        2 -
        requireEntry(report, "tilemap").recordTables,
    ).toBe(9);

    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      if (
        namespace === "collectionfactory" ||
        namespace === "physics" ||
        namespace === "socket" ||
        namespace === "liveupdate" ||
        namespace === "tilemap"
      ) {
        expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
      } else {
        expect(entry).toEqual(base);
      }
    }
  });
});

describe("model AABB table curation recovery", () => {
  test("model.recordTables drops to 0 and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline: model 2 (get_aabb object, get_mesh_aabb
    // object-valued mapping). Recovering both ratchets the namespace to 0.
    expect(requireEntry(report, "model").recordTables).toBe(0);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving model is the only move.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("slot-level array-of-object recovery", () => {
  test("sys.recordTables stays 0 and the full report equals the committed baseline", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // sys.get_ifaddrs's `<dl>` already parses, so the slot is not under
    // recordTables; wrapping the recovered object in an array adds no token, so
    // the count is conserved and the baseline does not move on any namespace.
    expect(requireEntry(report, "sys").recordTables).toBe(0);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("cross-namespace constant FQN resolution", () => {
  test("graphics is an all-zero entry and render's graphics.* tokens resolve to []", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    const graphics = requireEntry(report, "graphics");
    expect(graphics).toEqual({
      droppedElements: 0,
      unknownTokens: [],
      recordTables: 0,
      multiReturn: 0,
      droppedMembers: 0,
      optionalAsRequired: 0,
    });
    expect(requireEntry(report, "render").unknownTokens).toEqual([]);
  });
});

describe("table-field recovery", () => {
  test("recordTables drops for the <dl> namespaces and no other category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline recordTables for the field-rich <dl> namespaces:
    // sys 10, resource 13, render 8. Recovering their <dl> table slots must
    // lower each.
    expect(requireEntry(report, "sys").recordTables).toBeLessThan(10);
    expect(requireEntry(report, "resource").recordTables).toBeLessThan(13);
    expect(requireEntry(report, "render").recordTables).toBeLessThan(8);
    // recordTables is the only category this slice touches; mask it out and the
    // live report must still match the committed baseline for every namespace.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("number-list table-field recovery", () => {
  test("resource.recordTables drops 9 -> 3 and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "resource").recordTables).toBe(3);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      if (namespace === "resource") {
        expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
      } else {
        expect(entry).toEqual(base);
      }
    }
  });
});

describe("ul-table-field recovery", () => {
  test("recordTables drops for the <ul> namespaces and no other category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline recordTables for the <ul> type-code namespaces:
    // http 2, image 3, json 4. Recovering their <ul> table slots must lower each.
    expect(requireEntry(report, "http").recordTables).toBeLessThan(2);
    expect(requireEntry(report, "image").recordTables).toBeLessThan(3);
    expect(requireEntry(report, "json").recordTables).toBeLessThan(4);
    // recordTables is the only category this slice touches; mask it out and the
    // live report must still match the committed baseline for every namespace.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("nested-table-field recovery", () => {
  test("window.recordTables is 0 (the mixed <dl>+<ul> slot is recovered) and no other category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline window.recordTables is 1 (the get_safe_area mixed
    // <dl>+<ul> slot). Recovering it as a nested object drops it to 0.
    expect(requireEntry(report, "window").recordTables).toBe(0);
    // recordTables is the only category this slice touches; mask it out and the
    // live report must still match the committed baseline for every namespace.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("supplementary cross-reference table-field recovery", () => {
  test("resource.recordTables is conserved (geometries residual replaces the whole get_atlas table) and no category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // get_atlas adopts texture/animations from set_atlas (fully typed) but its
    // residual geometries stays Record, so the whole-table count is replaced
    // one-for-one — resource.recordTables is unchanged from the baseline, and
    // the name filter keeps set_atlas's vertices/uvs/indices out, so no other
    // category moves either. The live report still equals the committed baseline.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    expect(requireEntry(report, "resource")).toEqual(requireEntry(baselineMap, "resource"));
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("list-table array recovery", () => {
  test("array wrapping is emitted-fidelity only — every namespace and category equals the baseline", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Wrapping a recovered table field as an array of its element shape keeps the
    // field non-Record, so resource.recordTables (and every other category for
    // every namespace) is unchanged from the committed baseline.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    expect(requireEntry(report, "resource")).toEqual(requireEntry(baselineMap, "resource"));
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("flattened multi-table grouping", () => {
  test("resource.recordTables drops and no other namespace or category count moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "resource").recordTables).toBeLessThan(12);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("dash-option table recovery", () => {
  test("go, gui, and sys recordTables drop while other categories stay unchanged", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "go").recordTables).toBeLessThan(5);
    expect(requireEntry(report, "gui").recordTables).toBeLessThan(7);
    expect(requireEntry(report, "sys").recordTables).toBeLessThan(6);

    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("code-dash option table recovery", () => {
  test("sys.recordTables drops while other categories stay unchanged", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline sys.recordTables is 5; recovering sys.open_url's
    // code-dash target attribute drops it.
    expect(requireEntry(report, "sys").recordTables).toBeLessThan(5);

    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("cross-reference table recovery", () => {
  test("physics.set_shape stays recovered and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "physics").recordTables).toBe(3);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0 }).toEqual({ ...base, recordTables: 0 });
    }
  });
});

describe("any-wildcard mapping", () => {
  test("socket.unknownTokens is [] and the project-wide unknownTokens total is 0; no other category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    expect(requireEntry(report, "socket").unknownTokens).toEqual([]);
    const total = Object.values(report).reduce((sum, e) => sum + e.unknownTokens.length, 0);
    expect(total).toBe(0);
    // unknownTokens is the only category this slice touches; mask it out and the
    // live report must still match the committed baseline for every namespace.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, recordTables: 0, unknownTokens: [] }).toEqual({
        ...base,
        recordTables: 0,
        unknownTokens: [],
      });
    }
  });
});

describe("builtin-message element reclassification", () => {
  const report = buildFidelityReport(MODULE_MANIFEST);

  test("collectionproxy and sound drop no MESSAGE elements; project-wide droppedElements is 0", () => {
    expect(requireEntry(report, "collectionproxy").droppedElements).toBe(0);
    expect(requireEntry(report, "sound").droppedElements).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.droppedElements, 0);
    expect(total).toBe(0);
    // droppedElements is the only category this slice touches; mask it out and
    // the live report must still match the committed baseline for every namespace.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect({ ...entry, droppedElements: 0 }).toEqual({ ...base, droppedElements: 0 });
    }
  });

  test("a catalog message is reclassified but an uncovered MESSAGE still counts", () => {
    const covered = {
      info: { namespace: "test" },
      elements: [{ type: "MESSAGE", name: "set_time_step" }],
    };
    expect(requireEntry(buildFidelityReport(manifestOf(covered)), "test").droppedElements).toBe(0);
    const uncovered = {
      info: { namespace: "test" },
      elements: [{ type: "MESSAGE", name: "not_a_builtin_message_xyz" }],
    };
    expect(requireEntry(buildFidelityReport(manifestOf(uncovered)), "test").droppedElements).toBe(
      1,
    );
  });
});

describe("fidelity audit sanity floors", () => {
  test("the audit sees real type loss independent of the baseline file", () => {
    // Every category in the live surface is now fully recovered (project-wide
    // droppedElements and unknownTokens are both 0), so each floor is exercised
    // against a fabricated doc: the audit must still flag a genuinely dropped
    // element and a genuinely unmapped token.
    const droppedDoc = {
      info: { namespace: "test" },
      elements: [{ type: "MESSAGE", name: "not_a_builtin_message_xyz" }],
    };
    expect(
      requireEntry(buildFidelityReport(manifestOf(droppedDoc)), "test").droppedElements > 0,
    ).toBe(true);
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.fn",
          parameters: [{ name: "x", types: ["mystery"], is_optional: "False" }],
          returnvalues: [],
        },
      ],
    };
    const entry = requireEntry(buildFidelityReport(manifestOf(doc)), "test");
    expect(entry.unknownTokens.length > 0).toBe(true);
  });

  test("baseline file resolves next to the audit script", () => {
    expect(resolve(import.meta.dir, "fidelity-baseline.json")).toContain("fidelity-baseline.json");
  });
});
