import { describe, expect, test } from "bun:test";
import type { TableSlotCuration } from "../src/emit-dts";
import type { ProvenanceSurface } from "../src/optional-correction-provenance";
import { refDocEvidenceFor } from "./ref-doc-pin";
import { REPLACEMENT_TABLES, type ReplacementTable } from "./replacement-pins";

interface FakeElement {
  readonly name: string;
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
        description: "",
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

  test("a snippet with no text throws, naming the entry", () => {
    expect(() => refDocEvidenceFor(curations(" <br/> "), [])).toThrow(KEY);
  });
});
