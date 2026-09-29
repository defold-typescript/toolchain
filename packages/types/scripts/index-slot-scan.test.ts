import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDefoldApiDoc } from "../src/api-doc";
import { INDEX_SLOT_CLASSIFICATIONS } from "../src/index-slot-classifications";
import { retainedSurfaces } from "../src/optional-correction-provenance";
import { readBindingsForTarget } from "./engine-binding-extract";
import { EXTENSION_GOLDEN_MANIFEST } from "./extension-goldens";
import {
  callbackArgKeys,
  declaredSlotKeys,
  type IndexSlotHit,
  refDocSlotKeys,
  scanDeclaredIndexSlots,
  scanFunctionBaseStatements,
  scanIndexSlots,
  scanTypedefMemberSlots,
} from "./index-slot-scan";
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

  test("reads `lua based` as a 1-based statement", () => {
    expect(
      scanFixture("resource_doc.json", "resource").get(
        "resource.set_atlas:param:table:frame_start",
      ),
    ).toBe("prose-1-based");
  });

  test("skips the Lua stdlib namespaces", () => {
    expect(scanFixture("base_doc.json", "base")).toEqual(new Map());
  });
});

function statementsIn(file: string, namespace: string): Map<string, string> {
  const doc = JSON.parse(readFileSync(join(FIXTURES, file), "utf8"));
  return new Map(scanFunctionBaseStatements(doc, namespace).map((s) => [s.fn, s.class]));
}

describe("scanFunctionBaseStatements over the defold-1.13.1 ref-doc", () => {
  test("reads a base stated in a function's notes", () => {
    const resource = statementsIn("resource_doc.json", "resource");
    expect(resource.get("resource.set_atlas")).toBe("native-0");
    expect(resource.get("resource.create_atlas")).toBe("native-0");
    const doc = JSON.parse(readFileSync(join(FIXTURES, "resource_doc.json"), "utf8"));
    const atlas = scanFunctionBaseStatements(doc, "resource").find(
      (s) => s.fn === "resource.set_atlas",
    );
    expect(atlas?.phrase).toContain("zero based");
  });

  test("reads a base stated in a function's description", () => {
    const editor = statementsIn("editor_doc.json", "editor");
    expect(editor.get("image.pixel")).toBe("native-1");
    expect(editor.get("image.pixels")).toBe("native-1");
    expect(statementsIn("crash_doc.json", "crash").get("crash.set_user_field")).toBe("native-0");
  });

  test("never reads a default value or an example as a base", () => {
    expect(statementsIn("resource_doc.json", "resource").has("resource.create_texture")).toBe(
      false,
    );
    expect(statementsIn("go_doc.json", "go").has("go.get")).toBe(false);
  });

  test("skips the Lua stdlib namespaces", () => {
    const doc = (namespace: string) => ({
      info: { namespace },
      elements: [{ type: "FUNCTION", name: `${namespace}.sub`, description: "1-based", notes: [] }],
    });
    expect(scanFunctionBaseStatements(doc("string"), "string")).toEqual([]);
    expect(scanFunctionBaseStatements(doc("gui"), "gui")).toHaveLength(1);
  });
});

const LIBRARY_API_DOC = join(import.meta.dir, "..", "..", "library-types", "api-doc");

function libraryDoc(file: string): unknown {
  return JSON.parse(readFileSync(join(LIBRARY_API_DOC, file), "utf8"));
}

describe("scanTypedefMemberSlots over the library api-doc", () => {
  test("keys an index-named class field to its class", () => {
    const decore = new Map(
      scanTypedefMemberSlots(libraryDoc("decore.json")).map((hit) => [hit.key, hit.evidence]),
    );
    expect(decore.get("system:field:index")).toBe("name");
    const panthera = new Map(
      scanTypedefMemberSlots(libraryDoc("panthera.json")).map((hit) => [hit.key, hit.evidence]),
    );
    expect(panthera.get("panthera_animation:field:animation_keys_index")).toBe("name");
  });

  test("reports nothing for a member that is not a position", () => {
    const keys = scanTypedefMemberSlots(libraryDoc("decore.json")).map((hit) => hit.key);
    expect(keys.filter((key) => key.endsWith(":field:entities"))).toEqual([]);
  });
});

describe("callbackArgKeys over the library api-doc", () => {
  test("declares each argument a `function(...)` slot doc names", () => {
    const keys = callbackArgKeys(libraryDoc("bridge.json"));
    expect(keys).toContain("bridge.daily_rewards.get_current_day:param:on_success:day");
    expect(keys).toContain("bridge.daily_rewards.get_current_day:param:on_failure:error");
  });

  test("declares no key for a slot whose doc is not a `function(...)` form", () => {
    const keys = callbackArgKeys(libraryDoc("druid.json"));
    expect(keys.filter((key) => key.startsWith("new_data_list:param:create_function"))).toEqual([]);
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

// The ref-doc names of each function's returns, in tuple order.
const RETURN_NAMES = new Map<string, readonly string[]>();
for (const surface of SURFACES) {
  const module = parseDefoldApiDoc(surface.doc);
  for (const fn of [...module.functions, ...module.typedefs.flatMap((t) => t.functions ?? [])]) {
    if (fn.returnValues.length > 0 && !RETURN_NAMES.has(fn.name)) {
      RETURN_NAMES.set(
        fn.name,
        fn.returnValues.map((slot) => slot.name),
      );
    }
  }
}
const returnNames = (fn: string): readonly string[] => RETURN_NAMES.get(fn) ?? [];

// Every declaration file the emitter wrote, across the default target, the
// retained versions and the editor lane.
const GENERATED = join(import.meta.dir, "..", "generated");
const DECLARATION_FILES = readdirSync(GENERATED, { recursive: true, encoding: "utf8" })
  .filter((rel) => rel.endsWith(".d.ts"))
  .map((rel) => ({ rel, dts: readFileSync(join(GENERATED, rel), "utf8") }));

describe("index slot classification gate", () => {
  const sightings = new Map<string, { target: string; evidence: string }[]>();
  const sight = (key: string, target: string, evidence: string): void => {
    const list = sightings.get(key) ?? [];
    list.push({ target, evidence });
    sightings.set(key, list);
  };
  for (const surface of SURFACES) {
    for (const hit of scanIndexSlots(
      surface.doc,
      surface.namespace,
      vendoredBindings(surface.target),
    )) {
      sight(hit.key, surface.target, hit.evidence);
    }
  }
  for (const file of DECLARATION_FILES) {
    for (const hit of scanDeclaredIndexSlots(file.dts, returnNames)) {
      sight(hit.key, `generated/${file.rel}`, hit.evidence);
    }
  }

  const declared = new Set([
    ...SURFACES.flatMap((surface) => refDocSlotKeys(surface.doc)),
    ...DECLARATION_FILES.flatMap((file) => declaredSlotKeys(file.dts, returnNames)),
  ]);

  test("the emitted surface's authored overloads and table shapes are scanned", () => {
    expect(sightings.get("b2d.shape.get_body:param:shape_index")?.[0]?.target).toStartWith(
      "generated/",
    );
    expect(sightings.get("b2d.body.create_shape:return:result:index")?.[0]?.target).toStartWith(
      "generated/",
    );
  });

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

  test("every classification names a slot some retained surface declares", () => {
    expect(declared.has("tilemap.get_bounds:return:x")).toBe(true);
    expect(sightings.has("tilemap.get_bounds:return:x")).toBe(false);
    expect(declared.has("tilemap.get_bounds:return:z")).toBe(false);
    const stale = [...INDEX_SLOT_CLASSIFICATIONS.keys()].filter((key) => !declared.has(key));
    if (stale.length > 0) {
      throw new Error(
        `no retained surface declares these slots; delete or correct the classification:\n${stale.join("\n")}`,
      );
    }
  });

  test("each base a function states is recorded on one of its slots", () => {
    const missing: string[] = [];
    const reported = new Set<string>();
    for (const surface of SURFACES) {
      for (const statement of scanFunctionBaseStatements(surface.doc, surface.namespace)) {
        const id = `${statement.fn}:${statement.class}`;
        if (reported.has(id)) continue;
        const prefix = `${statement.fn}:`;
        const recorded = [...INDEX_SLOT_CLASSIFICATIONS].some(
          ([key, classification]) =>
            key.startsWith(prefix) && classification.class === statement.class,
        );
        if (recorded) continue;
        reported.add(id);
        missing.push(
          `${statement.fn} (${surface.target}, ${statement.class}, ${statement.phrase})`,
        );
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `classify a slot of each function in INDEX_SLOT_CLASSIFICATIONS (packages/types/src/index-slot-classifications.ts) with the base it states:\n${missing.join("\n")}`,
      );
    }
  });

  test("each return, and each field of one, records its position in the function's tuple", () => {
    for (const [key, classification] of INDEX_SLOT_CLASSIFICATIONS) {
      const [fn = "", kind, path = ""] = key.split(/:(param|return):/);
      if (kind !== "return") {
        expect({ key, tupleSlot: classification.tupleSlot }).toEqual({ key, tupleSlot: undefined });
        continue;
      }
      const slot = path.split(":")[0] ?? "";
      const names = returnNames(fn);
      const expected = names.length > 1 ? names.indexOf(slot) : undefined;
      expect({ key, tupleSlot: classification.tupleSlot }).toEqual({ key, tupleSlot: expected });
    }
  });
});

describe("index slot pairing", () => {
  test("each input an engine return feeds names that return, classified in the same base", () => {
    const problems: string[] = [];
    for (const [key, classification] of INDEX_SLOT_CLASSIFICATIONS) {
      for (const target of classification.pairsWith ?? []) {
        const paired = INDEX_SLOT_CLASSIFICATIONS.get(target);
        if (paired === undefined) problems.push(`${key} -> ${target}: not classified`);
        else if (paired.class !== classification.class) {
          problems.push(`${key} -> ${target}: ${paired.class}, not ${classification.class}`);
        }
      }
    }
    expect(problems).toEqual([]);
    const pairs = (key: string) => INDEX_SLOT_CLASSIFICATIONS.get(key)?.pairsWith ?? [];
    expect(pairs("tilemap.set_tile:param:x")).toContain("tilemap.get_bounds:return:x");
    expect(pairs("tilemap.set_tile:param:y")).toContain("tilemap.get_bounds:return:y");
    expect(pairs("b2d.fixture.get_density:param:fixture_index")).toContain(
      "b2d.body.get_fixtures:return:fixtures:index",
    );
    expect(pairs("client:send:param:i")).toContain("client:send:return:lastindex");
  });
});
