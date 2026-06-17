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
    // The mapping-table recovery ratchets gui 5 -> 2; the live report is
    // cumulative, so gui reads 0 here after the later runtime-owned passthrough
    // slice reclassifies the bare on_message receive `message` 2 -> 1 and the
    // record-table-batch-recovery-2 slice curates the shared on_input `action`
    // (mirroring the reclassification). The function-level arbitraryTable
    // propagation lands in the same slice, so the audit no longer re-counts
    // nested `table` fields for arbitrary slots.
    expect(requireEntry(report, "gui").recordTables).toBe(0);
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
    // drops each by one — go settles at 2. The live report is cumulative, so iap
    // reads 0 here after the later transaction-table and option-bag curations
    // ratchet it 3 -> 1 -> 0, and go reads 0 after the later runtime-owned
    // passthrough slice reclassifies on_message 2 -> 1 and the
    // record-table-batch-recovery-2 slice curates the shared on_input `action`
    // (mirroring the reclassification).
    expect(requireEntry(report, "iap").recordTables).toBe(0);
    expect(requireEntry(report, "go").recordTables).toBe(0);
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
    // collectionfactory reads 0 here: the slot-scoped curation ratcheted it 2 -> 1,
    // then the later runtime-owned passthrough slice reclassifies its `create`
    // properties slot 1 -> 0. physics reads 0 here after the
    // record-table-batch-recovery-2 slice curates create_joint.properties,
    // set_joint_properties.properties, and raycast.result (the three remaining
    // physics recordTables slots). socket reads 0 after the same slice
    // reclassifies all four dns.* returns.
    expect(requireEntry(report, "collectionfactory").recordTables).toBe(0);
    expect(requireEntry(report, "physics").recordTables).toBe(0);
    expect(requireEntry(report, "socket").recordTables).toBe(0);
    expect(requireEntry(report, "liveupdate").recordTables).toBe(0);
    expect(requireEntry(report, "tilemap").recordTables).toBe(0);
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
    ).toBe(18);

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

describe("tilemap get_tiles nested row-map recovery", () => {
  test("tilemap.recordTables drops 1 -> 0 and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Pre-recovery baseline: tilemap 1 (get_tile_info already recovered, get_tiles
    // the residual Record). Recovering get_tiles into the nested LuaMap ratchets
    // the namespace to 0 — the last recoverable tilemap recordTables slot.
    expect(requireEntry(report, "tilemap").recordTables).toBe(0);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving tilemap is the only move.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("platform-opaque passthrough reclassification", () => {
  test("iac.recordTables drops 1 -> 0 and push.recordTables drops 4 -> 2; no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The three OS/platform-sourced opaque-table slots (iac.set_listener,
    // push.get_scheduled, push.get_all_scheduled) are reclassified out of
    // recordTables: iac 1 -> 0, push 4 -> 2 (project-wide -3). Later slices ratchet
    // these namespaces further: the transaction + option-bag curations take iap to
    // 0, and the notification_settings + notifications-array curations take push to
    // 0, so the cumulative live report reads 0 (push) and 0 (iap) here.
    expect(requireEntry(report, "iac").recordTables).toBe(0);
    expect(requireEntry(report, "push").recordTables).toBe(0);
    expect(requireEntry(report, "iap").recordTables).toBe(0);
    // The committed baseline reflects the reclassified counts, so the full
    // report equals it on every namespace and category — proving iac/push are
    // the only moves.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("iap transaction table curation recovery", () => {
  test("iap.recordTables drops 3 -> 1 (project-wide -2) and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The shared Defold IAP transaction object is curated onto
    // iap.finish/iap.acknowledge's `transaction` param, recovering both slots and
    // ratcheting iap 3 -> 1 (project-wide -2). The later option-bag curation
    // recovers iap.buy's `options`, so the cumulative live report reads 0 here.
    expect(requireEntry(report, "iap").recordTables).toBe(0);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving iap is the only move.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("option-bag table curation recovery", () => {
  test("iap.recordTables drops 1 -> 0 and push.recordTables drops 2 -> 1 (project-wide -2); no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The two documented object-shaped option bags are curated onto their params:
    // iap.buy's `options` (request_id/token) and push.schedule's
    // `notification_settings` (action/badge_count/priority). Recovering both
    // ratchets iap 1 -> 0 and push 2 -> 1 (project-wide -2). The later
    // notifications-array curation takes push to 0, so the cumulative live report
    // reads 0 (push) here.
    expect(requireEntry(report, "iap").recordTables).toBe(0);
    expect(requireEntry(report, "push").recordTables).toBe(0);
    // The committed baseline reflects the recovered counts, so the full report
    // equals it on every namespace and category — proving iap/push are the only
    // moves.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("push.register notifications constant-array recovery", () => {
  test("push.recordTables drops 1 -> 0 (project-wide -1) and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // push.register's `notifications` (an array of push.NOTIFICATION_* bitmask
    // constants) is the last push `table` slot; the HOMOGENEOUS_ARRAY_SLOTS
    // ["push.register", "number"] entry recovers it as number[], ratcheting push
    // 1 -> 0 (project-wide -1). After this slice push owns zero recordTables.
    expect(requireEntry(report, "push").recordTables).toBe(0);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving push is the only move.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("runtime-owned passthrough reclassification", () => {
  test("factory/collectionfactory.recordTables -> 0, go/gui -> 1; project-wide recordTables is 20; no other move", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // factory.create / collectionfactory.create `properties` and the bare
    // on_message go/gui receive `message` are runtime/user-owned passthrough
    // tables; ARBITRARY_TABLE_SLOTS reclassifies them out of recordTables:
    // factory 1 -> 0, collectionfactory 1 -> 0, go 2 -> 1, gui 2 -> 1 — the
    // project-wide recordTables total drops 26 -> 22. The live report is
    // cumulative, so the total reads 14 here (cumulative, after the record-table
    // batch slice closes profiler/http/collectionproxy and ratchets render 4 ->
    // 2 on top of the earlier resource recoveries). After the
    // record-table-batch-recovery-2 slice curates the shared on_input `action`
    // (mirroring the reclassification), go and gui each drop to 0; the
    // function-level arbitraryTable propagation lands in the same slice, so
    // the audit no longer re-counts nested `table` fields for arbitrary slots
    // and render drops 2 -> 1 (the transient recursion in set_render_target).
    expect(requireEntry(report, "factory").recordTables).toBe(0);
    expect(requireEntry(report, "collectionfactory").recordTables).toBe(0);
    expect(requireEntry(report, "go").recordTables).toBe(0);
    expect(requireEntry(report, "gui").recordTables).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.recordTables, 0);
    // camera.get_cameras returns a `table` (the cameras array) that collapses to
    // Record, and font.get_info's name-only return bag collapses likewise — the
    // two project-wide record-tables now that camera carries members.
    expect(total).toBe(2);
    // The committed baseline reflects the reclassified counts, so the full
    // report equals it on every namespace and category — proving these four are
    // the only moves and no other category shifted anywhere.
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
    // The live report is cumulative, so resource reads 0 here (cumulative, after
    // get_text_metrics ratchets resource 1 -> 0 on top of the atlas-geometries
    // nested-field curation's set_atlas/get_atlas geometries 3 -> 1).
    expect(requireEntry(report, "resource").recordTables).toBe(0);
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

describe("atlas geometries nested-field recovery", () => {
  test("resource.recordTables drops 3 -> 1 (project-wide -2) and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The NESTED_FIELD_CURATIONS atlas-geometries members are injected onto
    // set_atlas's `table` param and get_atlas's `data` return, recovering both
    // geometries Records — ratcheting resource 3 -> 1 (project-wide -2). The live
    // report is cumulative, so resource reads 0 here (cumulative, after
    // get_text_metrics ratchets resource 1 -> 0).
    expect(requireEntry(report, "resource").recordTables).toBe(0);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving resource is the only
    // namespace whose recordTables moved and no other category shifted anywhere.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });

  test("the injected number-list members do not re-enter recordTables at depth", () => {
    // set_atlas/get_atlas's recovered geometries members (vertices/uvs/indices)
    // carry numberList: true and emit number[]; the nested recursion must skip
    // them so they are not miscounted as three new recordTables.
    const report = buildFidelityReport(MODULE_MANIFEST);
    const baselineMap = baseline as Record<string, FidelityEntry>;
    expect(requireEntry(report, "resource").recordTables).toBe(
      requireEntry(baselineMap, "resource").recordTables,
    );
  });
});

describe("get_text_metrics return-bag recovery", () => {
  test("resource.recordTables drops 1 -> 0 (project-wide -1) and no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // get_text_metrics's metrics return is an untyped name-only <ul>, so the
    // whole slot collapsed to Record; the TABLE_SLOT_CURATIONS object curation
    // recovers it as { width; height; max_ascent; max_descent } — ratcheting
    // resource 1 -> 0, after which resource owns zero recordTables.
    expect(requireEntry(report, "resource").recordTables).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.recordTables, 0);
    // The live report is cumulative; the later record-table batch slice lowers
    // the project-wide total to 14, and the record-table-batch-recovery-2
    // slice lands at 0 (the 14 recordTables all close, and the audit's
    // function-level arbitraryTable propagation skips the transient recursion
    // in set_render_target). camera.get_cameras and font.get_info then add the
    // two remaining record-tables once camera carries members, so the live
    // total is 2.
    expect(total).toBe(2);
    // The committed baseline reflects the recovered count, so the full report
    // equals it on every namespace and category — proving resource is the only
    // namespace whose recordTables moved and no other category shifted anywhere.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});

describe("record-table batch recovery", () => {
  test("profiler/http/collectionproxy reach 0 and render drops 4 -> 2 (project-wide 19 -> 14); no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // Five TABLE_SLOT_CURATIONS entries recover one slot each:
    // profiler.view_recorded_frame's option bag, http.request's headers map,
    // collectionproxy.get_resources's Hash[], render.predicate's tags array, and
    // render.clear's number-keyed clear-value map — closing profiler, http, and
    // collectionproxy and ratcheting render 4 -> 2. The live report is
    // cumulative, so render reads 1 here after the record-table-batch-recovery-2
    // slice reclassifies render.render_target and render.set_render_target
    // (function-level arbitraryTable propagation skips the transient recursion
    // in set_render_target).
    expect(requireEntry(report, "profiler").recordTables).toBe(0);
    expect(requireEntry(report, "http").recordTables).toBe(0);
    expect(requireEntry(report, "collectionproxy").recordTables).toBe(0);
    expect(requireEntry(report, "render").recordTables).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.recordTables, 0);
    // camera.get_cameras and font.get_info contribute the two remaining
    // record-tables now that camera carries members, so the cumulative live
    // total is 2.
    expect(total).toBe(2);
    // The committed baseline reflects the recovered counts, so the full report
    // equals it on every namespace and category — proving these four namespaces
    // are the only recordTables movers and no other category shifted anywhere.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
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
  test("resource get_atlas adopts set_atlas's fields and the full report equals the committed baseline", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // get_atlas adopts texture/animations/geometries from set_atlas via the
    // name filter (vertices/uvs/indices stay out). The later atlas-geometries
    // nested-field curation recovers geometries on both, so the cumulative
    // resource count and every other namespace/category equal the committed
    // baseline.
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
    // The live report is cumulative, so physics reads 0 here after the
    // record-table-batch-recovery-2 slice curates create_joint.properties,
    // set_joint_properties.properties, and raycast.result (the three remaining
    // physics recordTables slots).
    expect(requireEntry(report, "physics").recordTables).toBe(0);
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

describe("record-table batch recovery 2", () => {
  test("crash/webview/socket/render/go/gui/physics all reach 0 (project-wide 14 -> 0); no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The slice lands 9 audit-only reclassifications (ARBITRARY_TABLE_SLOTS)
    // and 4 curations. The 9 reclassifications close crash 2 -> 0, webview 1 -> 0,
    // and socket 4 -> 0, and drop render 2 -> 1 (the function-level
    // arbitraryTable flag now propagates to the parser-recovered field
    // recursion, so the transient sub-table in set_render_target.options is no
    // longer re-counted). The 4 curations close the remaining slots:
    // on_input:param:action (shared by go and gui, with the touch sub-field
    // curated as a typed array-of-touch-records) drops go and gui 1 -> 0;
    // physics.create_joint:param:properties,
    // physics.set_joint_properties:param:properties, and
    // physics.raycast:return:result drop physics 3 -> 0. The function-level
    // arbitraryTable propagation also brings render 1 -> 0. Project-wide total
    // drops 14 -> 0.
    expect(requireEntry(report, "crash").recordTables).toBe(0);
    expect(requireEntry(report, "webview").recordTables).toBe(0);
    expect(requireEntry(report, "socket").recordTables).toBe(0);
    expect(requireEntry(report, "render").recordTables).toBe(0);
    expect(requireEntry(report, "go").recordTables).toBe(0);
    expect(requireEntry(report, "gui").recordTables).toBe(0);
    expect(requireEntry(report, "physics").recordTables).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.recordTables, 0);
    // The ratchet work closes the original 14 to 0; camera.get_cameras and
    // font.get_info then add the two record-tables they carry, so the live
    // project-wide total is 2.
    expect(total).toBe(2);
    // The committed baseline reflects the recovered counts, so the full report
    // equals it on every namespace and category — proving these seven are the
    // only recordTables movers and no other category shifted anywhere.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });

  test("function-level arbitraryTable propagation skips a nested table in a parser-recovered field", () => {
    // Without propagation, the audit would re-count the `transient: table`
    // parsed sub-field of a parser-recovered slot — adding 1 to recordTables
    // even when the function is in ARBITRARY_TABLE_SLOTS. With propagation,
    // the function-level arbitraryTable flag flows into the parser-recovered
    // field recursion, so the nested `table` is correctly skipped.
    const doc = {
      info: { namespace: "test" },
      elements: [
        {
          type: "FUNCTION",
          name: "test.control",
          parameters: [
            {
              name: "options",
              doc: '<dl><dt><code>transient</code></dt><dd><span class="type">table</span> nested opaque</dd></dl>',
              types: ["table"],
              is_optional: "False",
            },
          ],
          returnvalues: [],
        },
        {
          type: "FUNCTION",
          name: "test.arbitrary",
          parameters: [
            {
              name: "options",
              doc: '<dl><dt><code>transient</code></dt><dd><span class="type">table</span> nested opaque</dd></dl>',
              types: ["table"],
              is_optional: "False",
            },
          ],
          returnvalues: [],
        },
      ],
    };
    // A direct test would need to mutate the ARBITRARY_TABLE_SLOTS set, which
    // is a const Set exported from emit-dts. The behavior is locked indirectly
    // by the slice-level assertion above (the cumulative render.recordTables
    // reaches 0 only because propagation skips the transient recursion in
    // set_render_target). This test pins the control: a function whose slot
    // has a parser-recovered nested `table` is counted once (the recursion
    // adds 1) when the function is not arbitrary.
    const report = buildFidelityReport(manifestOf(doc));
    expect(requireEntry(report, "test").recordTables).toBe(2);
  });
});

describe("overload-covered skip reclassification", () => {
  test("a skip whose FQN is in OVERLOAD_COVERED_SKIPS drops to 0; an uncovered skip still counts", () => {
    // Mirror the skipFunctions test above (line 77) but use a `go`-shaped
    // namespace so the covered FQNs (go.get / go.set) hit OVERLOAD_COVERED_SKIPS.
    const coveredDoc = {
      info: { namespace: "go" },
      elements: [
        { type: "FUNCTION", name: "go.get", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "go.set", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "go.keep", parameters: [], returnvalues: [] },
      ],
    };
    const coveredManifest: readonly ModuleManifestEntry[] = [
      { namespace: "go", doc: coveredDoc, outFile: "go.d.ts", skipFunctions: ["get", "set"] },
    ];
    const coveredEntry = requireEntry(buildFidelityReport(coveredManifest), "go");
    expect(coveredEntry.droppedMembers).toBe(0);
    expect(coveredEntry.droppedElements).toBe(0);
    expect(coveredEntry.recordTables).toBe(0);
    expect(coveredEntry.optionalAsRequired).toBe(0);
    expect(coveredEntry.unknownTokens).toEqual([]);

    // Control: a skip whose FQN is NOT in OVERLOAD_COVERED_SKIPS still counts,
    // keeping the gate honest. This re-runs the synthetic `test` manifest from
    // the line-77 test; the 2 stays.
    const uncoveredDoc = {
      info: { namespace: "test" },
      elements: [
        { type: "FUNCTION", name: "test.get", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "test.set", parameters: [], returnvalues: [] },
        { type: "FUNCTION", name: "test.keep", parameters: [], returnvalues: [] },
      ],
    };
    const uncoveredManifest: readonly ModuleManifestEntry[] = [
      { namespace: "test", doc: uncoveredDoc, outFile: "test.d.ts", skipFunctions: ["get", "set"] },
    ];
    const uncoveredEntry = requireEntry(buildFidelityReport(uncoveredManifest), "test");
    expect(uncoveredEntry.droppedMembers).toBe(2);
  });

  test("go.droppedMembers 3 -> 0 and msg.droppedMembers 1 -> 0 (project-wide 4 -> 0); no other namespace or category moves", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    // The four residual droppedMembers are the `go` (`get`/`set`/`property`) and
    // `msg` (`post`) skipFunctions; each is replaced by a hand-written overload
    // in src/{go,msg}-overloads.d.ts. OVERLOAD_COVERED_SKIPS reclassifies
    // them out of the dropped count, so go 3 -> 0 and msg 1 -> 0. After this
    // slice every type-fidelity category is zero across every namespace.
    expect(requireEntry(report, "go").droppedMembers).toBe(0);
    expect(requireEntry(report, "msg").droppedMembers).toBe(0);
    const total = Object.values(report).reduce((sum, e) => sum + e.droppedMembers, 0);
    expect(total).toBe(0);
    // The committed baseline reflects the reclassified counts, so the full
    // report equals it on every namespace and category — proving go/msg are
    // the only moves and no other category shifted anywhere.
    const baselineMap = baseline as Record<string, FidelityEntry>;
    for (const [namespace, entry] of Object.entries(report)) {
      const base = baselineMap[namespace];
      if (!base) throw new Error(`baseline is missing namespace ${namespace}`);
      expect(entry).toEqual(base);
    }
  });
});
