import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEX_SLOT_CLASSIFICATIONS } from "../src/index-slot-classifications";
import { retainedSurfaces } from "../src/optional-correction-provenance";
import { readBindingsForTarget } from "./engine-binding-extract";
import { EXTENSION_GOLDEN_MANIFEST } from "./extension-goldens";
import { type IndexSlotHit, scanIndexSlots } from "./index-slot-scan";
import {
  EDITOR_MODULE_MANIFEST,
  EDITOR_VM_MODULE_MANIFEST,
  loadApiTargets,
  MODULE_MANIFEST,
  VERSIONED_MODULE_MANIFEST,
} from "./regen";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "defold-1.13.1");

function scanFixture(file: string, namespace: string): Map<string, IndexSlotHit["evidence"]> {
  const doc = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
  return new Map(scanIndexSlots(doc, namespace).map((hit) => [hit.key, hit.evidence]));
}

describe("scanIndexSlots over the defold-1.13.1 ref-doc", () => {
  test("finds positional slots by decoded prose and by name", () => {
    expect(
      scanFixture("b2d_fixture_doc.json", "b2d.fixture").get(
        "b2d.fixture.get_density:param:fixture_index",
      ),
    ).toBe("prose-1-based");
    expect(scanFixture("crash_doc.json", "crash").get("crash.set_user_field:param:index")).toBe(
      "prose-0-based",
    );
    expect(scanFixture("gui_doc.json", "gui").get("gui.get_index:return:index")).toBe("name");
  });

  test("keys an options-table index to its field, decoding the HTML first", () => {
    expect(scanFixture("go_doc.json", "go").get("go.get:param:options:index")).toBe(
      "prose-1-based",
    );
    const gui = scanFixture("gui_doc.json", "gui");
    expect(gui.get("gui.set:param:options:index")).toBe("prose-1-based");
    expect(gui.has("gui.set:param:options")).toBe(false);
  });

  test("keys a table field named inside the slot prose to the field, never the parent", () => {
    const fixture = scanFixture("b2d_fixture_doc.json", "b2d.fixture");
    expect(fixture.get("b2d.fixture.get_filter_data:return:filter:group_index")).toBe("name");
    expect(fixture.has("b2d.fixture.get_filter_data:return:filter")).toBe(false);
  });

  test("skips the Lua stdlib namespaces", () => {
    expect(scanFixture("base_doc.json", "base")).toEqual(new Map());
  });
});

describe("C++ evidence over the vendored defold-1.13.1 bindings", () => {
  const bindings = readBindingsForTarget("defold-1.13.1");

  test("a checked argument the binding subtracts 1 from is an index slot", () => {
    const doc = JSON.parse(readFileSync(join(FIXTURES, "tilemap_doc.json"), "utf8"));
    const hits = new Map(
      scanIndexSlots(doc, "tilemap", bindings).map((hit) => [hit.key, hit.evidence]),
    );
    expect(hits.get("tilemap.set_tile:param:x")).toBe("cxx-minus-one");
    expect(hits.get("tilemap.set_tile:param:y")).toBe("cxx-minus-one");
    expect(hits.has("tilemap.set_tile:param:tile")).toBe(true);
    expect(hits.has("tilemap.set_tile:param:layer")).toBe(false);
    expect(scanFixture("tilemap_doc.json", "tilemap").has("tilemap.set_tile:param:x")).toBe(false);
  });

  test("a checked value assigned first and shifted later is found through a helper", () => {
    const shifted = bindings.functions
      .filter((fn) => fn.slots.some((slot) => slot.minusOne === true))
      .map((fn) => `${fn.namespace}.${fn.name}`);
    expect(shifted).toContain("b2d.fixture.get_aabb");
  });
});

const DEFAULT_TARGET = loadApiTargets().find((candidate) => candidate.default === true);
if (!DEFAULT_TARGET) throw new Error("api-targets.json: no default target");

// Every runtime surface the global correction tables reach, plus the editor lane
// of every retained target, since its declarations ship too.
const SURFACES = [
  ...retainedSurfaces(
    DEFAULT_TARGET.id,
    MODULE_MANIFEST,
    VERSIONED_MODULE_MANIFEST,
    EXTENSION_GOLDEN_MANIFEST,
  ),
  ...[...EDITOR_MODULE_MANIFEST, ...EDITOR_VM_MODULE_MANIFEST].map((entry) => ({
    target: `${DEFAULT_TARGET.id} editor`,
    namespace: entry.namespace,
    doc: entry.doc,
  })),
  ...VERSIONED_MODULE_MANIFEST.filter((entry) => entry.editor === true).map((entry) => ({
    target: `${entry.versionId} editor`,
    namespace: entry.namespace,
    doc: entry.doc,
  })),
];

const VENDORED_TARGETS: ReadonlySet<string> = new Set(
  loadApiTargets()
    .filter((target) => target.source === null)
    .map((target) => target.id),
);
const bindingsByTarget = new Map<string, ReturnType<typeof readBindingsForTarget>>();
function vendoredBindings(target: string) {
  if (!VENDORED_TARGETS.has(target)) return undefined;
  const cached = bindingsByTarget.get(target) ?? readBindingsForTarget(target);
  bindingsByTarget.set(target, cached);
  return cached;
}

describe("index slot classification gate", () => {
  const sightings = new Map<string, { target: string; evidence: string }[]>();
  for (const surface of SURFACES) {
    for (const hit of scanIndexSlots(
      surface.doc,
      surface.namespace,
      vendoredBindings(surface.target),
    )) {
      const list = sightings.get(hit.key) ?? [];
      list.push({ target: surface.target, evidence: hit.evidence });
      sightings.set(hit.key, list);
    }
  }

  test("every scanned index slot is classified", () => {
    const unclassified = [...sightings.entries()]
      .filter(([key]) => !INDEX_SLOT_CLASSIFICATIONS.has(key))
      .map(([key, seen]) => `${key} (${seen[0]?.target}, ${seen[0]?.evidence})`);
    if (unclassified.length > 0) {
      throw new Error(
        `classify these index slots in INDEX_SLOT_CLASSIFICATIONS (packages/types/src/index-slot-classifications.ts):\n${unclassified.join("\n")}`,
      );
    }
  });

  test("every classification is still sighted in a retained surface", () => {
    const stale = [...INDEX_SLOT_CLASSIFICATIONS.keys()].filter((key) => !sightings.has(key));
    if (stale.length > 0) {
      throw new Error(
        `no retained surface reports these slots; delete the classification:\n${stale.join("\n")}`,
      );
    }
  });
});
