import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyReleaseImport,
  buildReleaseImportPlan,
  parseReleaseImportArgs,
  releaseImportReportJson,
} from "./import-defold-release";
import type { ZipAccessor } from "./sync-api-docs";

function fakeZip(entries: Record<string, unknown>): ZipAccessor {
  const encoded = Object.fromEntries(
    Object.entries(entries).map(([path, value]) => [path, JSON.stringify(value)]),
  );
  return {
    entries: () => Object.keys(encoded),
    has: (entry) => Object.hasOwn(encoded, entry),
    read: (entry) => {
      const value = encoded[entry];
      if (value === undefined) throw new Error(`missing fake zip entry ${entry}`);
      return value;
    },
  };
}

function apiDoc(namespace: string, elements: unknown[], path = `engine/${namespace}.cpp`): unknown {
  return { info: { namespace, path }, elements };
}

const baseline = {
  id: "defold-1.12.4",
  modules: [
    { namespace: "alpha", fixture: "alpha_doc.json", doc: apiDoc("alpha", [fn("alpha.old")]) },
    { namespace: "gone", fixture: "gone_doc.json", doc: apiDoc("gone", [fn("gone.only")]) },
  ],
  luaStdlib: [],
};

function fn(
  name: string,
  parameters: unknown[] = [],
  returnvalues: unknown[] = [],
): Record<string, unknown> {
  return { type: "FUNCTION", name, parameters, returnvalues };
}

describe("buildReleaseImportPlan", () => {
  test("inventories parsed namespaces rather than paths and reports namespace and symbol deltas", () => {
    const zip = fakeZip({
      "unexpected/location-one.json": apiDoc("alpha", [fn("alpha.old"), fn("alpha.added")]),
      "doc/new-shape.json": apiDoc("newmod", [fn("newmod.run")]),
      "doc/no-functions.json": apiDoc("dataonly", [{ type: "CONSTANT", name: "dataonly.X" }]),
    });

    const plan = buildReleaseImportPlan({ version: "1.13.0", zip, baseline });

    expect(plan.sources.map((source) => [source.namespace, source.entries])).toEqual([
      ["alpha", ["unexpected/location-one.json"]],
      ["dataonly", ["doc/no-functions.json"]],
      ["newmod", ["doc/new-shape.json"]],
    ]);
    expect(plan.namespaces).toEqual({ added: ["dataonly", "newmod"], removed: ["gone"] });
    expect(plan.moved).toEqual([
      {
        namespace: "alpha",
        from: ["doc/alpha.json"],
        to: ["unexpected/location-one.json"],
      },
    ]);
    expect(plan.symbols).toContainEqual({
      namespace: "alpha",
      added: ["alpha.added"],
      removed: [],
    });
    expect(plan.blockers.unmappedFunctionNamespaces).toEqual([
      { namespace: "newmod", entries: ["doc/new-shape.json"], symbols: ["newmod.run"] },
    ]);
    expect(plan.ready).toBe(false);
  });

  test("merges split Box2D documents by signature and removes only exact duplicates", () => {
    const boxBaseline = {
      id: "defold-1.12.4",
      modules: [{ namespace: "b2d", fixture: "b2d_doc.json", doc: apiDoc("b2d", []) }],
      luaStdlib: [],
    };
    const v2 = fn(
      "b2d.raycast",
      [{ name: "from", types: ["vector3"] }],
      [{ name: "hit", types: ["boolean"] }],
    );
    const v3 = fn(
      "b2d.raycast",
      [{ name: "world", types: ["b2World"] }],
      [{ name: "fraction", types: ["number"] }],
    );
    const zip = fakeZip({
      "doc/box2d-v2.json": apiDoc("b2d", [v2]),
      "moved/box2d-v3.json": apiDoc("b2d", [v3, v2]),
    });

    const plan = buildReleaseImportPlan({ version: "1.13.0", zip, baseline: boxBaseline });
    const merged = plan.snapshots.find((snapshot) => snapshot.namespace === "b2d")?.doc as {
      elements: unknown[];
    };

    expect(merged.elements).toHaveLength(2);
    expect(merged.elements).toEqual([v2, v3]);
    const provenance = plan.manifest.snapshots[0]?.symbols;
    expect(provenance).toHaveLength(2);
    expect(provenance?.map((symbol) => symbol.sourceEntries)).toContainEqual([
      "doc/box2d-v2.json",
      "moved/box2d-v3.json",
    ]);
    expect(provenance?.map((symbol) => symbol.sourceEntries)).toContainEqual([
      "moved/box2d-v3.json",
    ]);
  });

  test("reports every unknown type symbol and function-bearing unmapped namespace as blockers", () => {
    const zip = fakeZip({
      "doc/alpha.json": apiDoc("alpha", [
        fn(
          "alpha.unsafe",
          [{ name: "value", types: ["mystery_input"] }],
          [{ name: "result", types: ["mystery_output"] }],
        ),
        fn("alpha.optional", [{ name: "value", types: ["string", "nil"] }]),
        { type: "CONSTANT", name: "alpha.MODE" },
        fn("alpha.with_mode", [{ name: "mode", types: ["alpha.MODE"] }]),
      ]),
      "doc/orphan.json": apiDoc("orphan", [fn("orphan.run")]),
    });

    const plan = buildReleaseImportPlan({ version: "1.13.0", zip, baseline });

    expect(plan.blockers.unknownTypes).toEqual([
      { namespace: "alpha", symbol: "alpha.unsafe", tokens: ["mystery_input", "mystery_output"] },
    ]);
    expect(plan.blockers.unmappedFunctionNamespaces).toEqual([
      { namespace: "orphan", entries: ["doc/orphan.json"], symbols: ["orphan.run"] },
    ]);
    expect(plan.ready).toBe(false);
  });

  test("dry-run JSON is stable and apply writes only the named snapshot and manifest", () => {
    const zip = fakeZip({ "doc/alpha.json": apiDoc("alpha", [fn("alpha.old")]) });
    const plan = buildReleaseImportPlan({ version: "1.13.0", zip, baseline });
    const root = mkdtempSync(join(tmpdir(), "release-import-"));

    const reordered = buildReleaseImportPlan({
      version: "1.13.0",
      zip: fakeZip({ "doc/alpha.json": apiDoc("alpha", [fn("alpha.old")]) }),
      baseline,
    });
    expect(releaseImportReportJson(plan)).toBe(releaseImportReportJson(reordered));
    expect(existsSync(join(root, "fixtures"))).toBe(false);

    const written = applyReleaseImport(plan, root);
    expect(written).toEqual([
      "fixtures/defold-1.13.0/alpha_doc.json",
      "fixtures/defold-1.13.0/import-manifest.json",
    ]);
    expect(readdirSync(join(root, "fixtures"))).toEqual(["defold-1.13.0"]);
    expect(JSON.parse(readFileSync(join(root, written[1] as string), "utf8"))).toEqual(
      plan.manifest,
    );
  });
});

describe("parseReleaseImportArgs", () => {
  test("requires an exact version and supports check, JSON, and a local zip", () => {
    expect(
      parseReleaseImportArgs(["1.13.0", "--check", "--json", "--zip", "/tmp/ref-doc.zip"]),
    ).toEqual({ version: "1.13.0", check: true, json: true, zipPath: "/tmp/ref-doc.zip" });
    expect(() => parseReleaseImportArgs([])).toThrow("exact Defold release version");
    expect(() => parseReleaseImportArgs(["stable"])).toThrow("exact Defold release version");
    expect(() => parseReleaseImportArgs(["1.13"])).toThrow("exact Defold release version");
    expect(() => parseReleaseImportArgs(["1.13.0", "--zip"])).toThrow("--zip requires a path");
    expect(() => parseReleaseImportArgs(["1.13.0", "--wat"])).toThrow("unknown argument");
  });
});
