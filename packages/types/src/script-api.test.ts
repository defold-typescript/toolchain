import { describe, expect, it } from "bun:test";
import { parse } from "yaml";
import { parseDefoldApiDoc } from "./api-doc";
import { emitDeclarations } from "./emit-dts";
import { parseScriptApi, type RefDoc, scriptApiToRefDoc } from "./script-api";

const SAMPLE = `
- name: demo
  type: table
  desc: A demo namespace.
  members:
  - name: greet
    type: function
    desc: Greet someone.
    parameters:
      - name: self
        type: object
        desc: the script self
      - name: who
        type: string
        desc: the name to greet
    returns:
      - name: message
        type: string
        desc: the greeting text
  - name: VERSION
    type: number
    desc: a module constant
`;

const BRIDGE = `
- name: bridge
  type: table
  desc: The bridge namespace.
  members:
  - name: platform
    type: table
    desc: platform sub-namespace
    members:
    - name: on
      type: function
      desc: subscribe to an event
      parameters:
        - name: self
          type: object
          desc: the script self
        - name: event
          type: string
          desc: the event name
      returns:
        - name: handle
          type: number
          desc: the subscription handle
    - name: id
      type: function
      desc: the platform id
      returns:
        - name: id
          type: string
          desc: the id string
    - name: LEVEL
      type: number
      desc: a nested constant
    - name: deep
      type: table
      desc: a second-level table that must not recurse
      members:
      - name: buried
        type: function
        desc: too deep to emit
  - name: TOP_CONST
    type: number
    desc: a top-level constant
`;

const MIXED = `
- name: mixed
  type: table
  desc: A mixed namespace.
  members:
  - name: flat_fn
    type: function
    desc: a direct function
    returns:
      - name: ok
        type: boolean
        desc: the result
  - name: sub
    type: table
    desc: a sub-namespace
    members:
    - name: nested_fn
      type: function
      desc: a nested function
`;

function refDoc(): RefDoc {
  return scriptApiToRefDoc(parse(SAMPLE));
}

function bridgeDoc(): RefDoc {
  return scriptApiToRefDoc(parse(BRIDGE));
}

function mixedDoc(): RefDoc {
  return scriptApiToRefDoc(parse(MIXED));
}

describe("scriptApiToRefDoc", () => {
  it("uses the top-level table name as the namespace", () => {
    expect(refDoc().info.namespace).toBe("demo");
  });

  it("maps a function member to a FUNCTION element with a namespaced name", () => {
    const fns = refDoc().elements.filter((e) => e.type === "FUNCTION");
    expect(fns).toHaveLength(1);
    expect(fns[0]?.name).toBe("demo.greet");
  });

  it("lifts each parameter's singular type into a types array", () => {
    expect(refDoc().elements[0]?.parameters).toEqual([
      { name: "who", doc: "the name to greet", types: ["string"] },
    ]);
  });

  it("maps returns to returnvalues with the same singular-to-array lift", () => {
    expect(refDoc().elements[0]?.returnvalues).toEqual([
      { name: "message", doc: "the greeting text", types: ["string"] },
    ]);
  });

  it("drops a leading self parameter so the emitted function honors @noSelfInFile", () => {
    expect(refDoc().elements[0]?.parameters.some((p) => p.name === "self")).toBe(false);
  });

  it("drops scalar (constant) members", () => {
    const elements = refDoc().elements;
    expect(elements.every((e) => e.type === "FUNCTION")).toBe(true);
    expect(elements.some((e) => e.name === "demo.VERSION")).toBe(false);
  });

  it("round-trips through parseDefoldApiDoc and emitDeclarations", () => {
    const module = parseDefoldApiDoc(refDoc());
    expect(module.namespace).toBe("demo");
    expect(module.functions.map((f) => f.name)).toEqual(["demo.greet"]);
    const emitted = emitDeclarations(module);
    expect(emitted).toContain("function greet(who: string): string;");
  });

  it("parseScriptApi accepts raw YAML text", () => {
    expect(parseScriptApi(SAMPLE).info.namespace).toBe("demo");
  });

  it("adds no phantom elements to a flat input — recursion is a no-op for the built-in shape", () => {
    expect(refDoc().elements.map((e) => e.name)).toEqual(["demo.greet"]);
  });
});

describe("scriptApiToRefDoc nested namespaces", () => {
  it("recurses one level into a `type: table` member as `<ns>.<sub>.<fn>`", () => {
    const names = bridgeDoc().elements.map((e) => e.name);
    expect(names).toContain("bridge.platform.on");
    expect(names).toContain("bridge.platform.id");
  });

  it("maps a nested function's parameters and returns, stripping self", () => {
    const on = bridgeDoc().elements.find((e) => e.name === "bridge.platform.on");
    expect(on?.parameters).toEqual([{ name: "event", doc: "the event name", types: ["string"] }]);
    expect(on?.returnvalues).toEqual([
      { name: "handle", doc: "the subscription handle", types: ["number"] },
    ]);
  });

  it("keeps the top-level desc as the namespace brief and description", () => {
    expect(bridgeDoc().info.brief).toBe("The bridge namespace.");
    expect(bridgeDoc().info.description).toBe("The bridge namespace.");
  });

  it("drops nested constants and does not recurse a second level", () => {
    const names = bridgeDoc().elements.map((e) => e.name);
    expect(names.some((n) => n === "bridge.platform.LEVEL")).toBe(false);
    expect(names.some((n) => n.includes("buried"))).toBe(false);
    expect(names.some((n) => n === "bridge.TOP_CONST")).toBe(false);
  });

  it("emits both a direct function and a nested function for a mixed table", () => {
    const names = mixedDoc().elements.map((e) => e.name);
    expect(names).toContain("mixed.flat_fn");
    expect(names).toContain("mixed.sub.nested_fn");
  });
});
