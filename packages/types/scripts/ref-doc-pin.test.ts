import { describe, expect, test } from "bun:test";
import type { TableSlotCuration } from "../src/emit-dts";
import type { ProvenanceSurface } from "../src/optional-correction-provenance";
import { refDocEvidenceFor } from "./ref-doc-pin";
import { REPLACEMENT_TABLES, type ReplacementTable } from "./replacement-pins";

interface FakeElement {
  readonly name: string;
  readonly description?: string;
  readonly parameterDoc?: string;
  readonly examples?: string;
}

// Raw ref-doc shape, so the fabricated inputs and the committed fixtures enter
// the evidence walk the same way.
function surface(namespace: string, elements: readonly FakeElement[]): ProvenanceSurface {
  return {
    target: "t",
    namespace,
    doc: {
      info: { namespace, brief: "", description: "" },
      elements: elements.map((element) => ({
        type: "FUNCTION",
        name: element.name,
        brief: "",
        description: element.description ?? "",
        returnvalues: [],
        parameters: [{ name: "options", doc: element.parameterDoc ?? "", types: ["table"] }],
        examples: element.examples ?? "",
      })),
    },
  };
}

const KEY = "physics.raycast_async:param:options";
const LINE = `TABLE_SLOT_CURATIONS:${KEY}`;

function curations(contains: string): ReplacementTable[] {
  const registered = REPLACEMENT_TABLES.find((table) => table.name === "TABLE_SLOT_CURATIONS");
  if (!registered) throw new Error("TABLE_SLOT_CURATIONS is not registered");
  const curation: TableSlotCuration = { kind: "array", element: "hash", refDoc: { contains } };
  return [{ ...registered, entries: [[KEY, curation]] }];
}

// The registered table `name` holding one entry `key`, pinned to `contains`.
function pinnedEntry(name: string, key: string, contains: string): ReplacementTable[] {
  const registered = REPLACEMENT_TABLES.find((table) => table.name === name);
  if (!registered) throw new Error(`${name} is not registered`);
  return [{ ...registered, entries: [[key, { refDoc: { contains } }]] }];
}

describe("refDocEvidenceFor", () => {
  test("a snippet the element's parameter doc states across a tag and a line break holds", () => {
    const doc = "a lua table containing the <code>hashed\n  groups</code> to test against";
    const surfaces = [surface("physics", [{ name: "physics.raycast_async", parameterDoc: doc }])];
    expect([
      ...refDocEvidenceFor(curations("table containing the hashed groups"), surfaces),
    ]).toEqual([LINE]);
  });

  test("spacing beside punctuation never decides it", () => {
    const doc = "table with <code>category_bits</code>, <code>mask_bits</code>";
    const surfaces = [surface("physics", [{ name: "physics.raycast_async", parameterDoc: doc }])];
    expect([
      ...refDocEvidenceFor(curations("table with category_bits, mask_bits"), surfaces),
    ]).toEqual([LINE]);
  });

  test("a snippet found only in the element's examples holds", () => {
    const examples = '<span class="n">groups</span> = { hash(&quot;enemy&quot;) }';
    const surfaces = [surface("physics", [{ name: "physics.raycast_async", examples }])];
    expect([...refDocEvidenceFor(curations('groups = { hash("enemy") }'), surfaces)]).toEqual([
      LINE,
    ]);
  });

  test("the snippet in a sibling element of the namespace is no evidence", () => {
    const surfaces = [
      surface("physics", [
        { name: "physics.raycast_async", parameterDoc: "a table" },
        { name: "physics.raycast", parameterDoc: "the hashed groups to test against" },
      ]),
    ];
    expect([...refDocEvidenceFor(curations("the hashed groups"), surfaces)]).toEqual([]);
  });

  test("an element absent from every surface is no evidence", () => {
    const surfaces = [surface("physics", [{ name: "physics.raycast", parameterDoc: "groups" }])];
    expect([...refDocEvidenceFor(curations("groups"), surfaces)]).toEqual([]);
  });

  test("a variable key finds its element", () => {
    const surfaces = [
      surface("editor", [
        { name: "editor.platform", description: "A <code>string</code>, either" },
      ]),
    ];
    expect([
      ...refDocEvidenceFor(
        pinnedEntry("VARIABLE_TYPE_OVERRIDES", "editor.platform", "A string, either"),
        surfaces,
      ),
    ]).toEqual(["VARIABLE_TYPE_OVERRIDES:editor.platform"]);
  });

  test("an element of a nested namespace is found on the surface that documents it", () => {
    const surfaces = [surface("editor", [{ name: "editor.tx.add", description: "a step" }])];
    expect([
      ...refDocEvidenceFor(
        pinnedEntry("RETURN_TYPE_OVERRIDES", "editor.tx.add", "a step"),
        surfaces,
      ),
    ]).toEqual(["RETURN_TYPE_OVERRIDES:editor.tx.add"]);
  });

  test("a property key finds the element its namespace's doc names bare", () => {
    const pinned = pinnedEntry("PROPERTY_TYPE_CORRECTIONS", "sprite.frame_count", "frame count");
    const bare = [surface("sprite", [{ name: "frame_count", description: "The frame count" }])];
    expect([...refDocEvidenceFor(pinned, bare)]).toEqual([
      "PROPERTY_TYPE_CORRECTIONS:sprite.frame_count",
    ]);
    const elsewhere = [surface("label", [{ name: "frame_count", description: "The frame count" }])];
    expect([...refDocEvidenceFor(pinned, elsewhere)]).toEqual([]);
  });

  test("a message field key finds the message its namespace's doc names bare", () => {
    const pinned = pinnedEntry(
      "MESSAGE_FIELD_CONSTANT_GROUPS",
      "collectionproxy.set_time_step:mode",
      "0 for continuous",
    );
    const surfaces = [
      surface("collectionproxy", [{ name: "set_time_step", parameterDoc: "0 for continuous" }]),
    ];
    expect([...refDocEvidenceFor(pinned, surfaces)]).toEqual([
      "MESSAGE_FIELD_CONSTANT_GROUPS:collectionproxy.set_time_step:mode",
    ]);
  });

  test("a snippet with no text throws, naming the entry", () => {
    expect(() => refDocEvidenceFor(curations(" <br/> "), [])).toThrow(KEY);
  });
});
