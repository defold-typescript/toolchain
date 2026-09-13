import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { parseDefoldApiDoc } from "./api-doc";
import { examplesHtmlToMarkdown } from "./doc-comment";
import { emitDeclarations } from "./emit-dts";
import {
  parseScriptApi,
  type RefDoc,
  type RefDocFunctionElement,
  scriptApiToRefDoc,
} from "./script-api";

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

function functionElements(doc: RefDoc): RefDocFunctionElement[] {
  return doc.elements.filter((e): e is RefDocFunctionElement => e.type === "FUNCTION");
}

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
    expect(functionElements(refDoc())[0]?.parameters).toEqual([
      { name: "who", doc: "the name to greet", types: ["string"] },
    ]);
  });

  it("maps returns to returnvalues with the same singular-to-array lift", () => {
    expect(functionElements(refDoc())[0]?.returnvalues).toEqual([
      { name: "message", doc: "the greeting text", types: ["string"] },
    ]);
  });

  it("drops a leading self parameter so the emitted function honors @noSelfInFile", () => {
    expect(functionElements(refDoc())[0]?.parameters.some((p) => p.name === "self")).toBe(false);
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
    const on = functionElements(bridgeDoc()).find((e) => e.name === "bridge.platform.on");
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

const CONSTANTS = `
- name: demo
  type: table
  desc: A demo namespace.
  members:
  - name: MSG_A
    type: number
    desc: the first message
  - name: greet
    type: function
    desc: Greet someone.
  - name: sub
    type: table
    desc: a sub-namespace
    members:
    - name: KIND_B
      type: string
    - name: run
      type: function
      desc: run it
    - name: deep
      type: table
      members:
      - name: BURIED
        type: number
  - name: LABEL
    type: string
    desc: a string constant
`;

describe("scriptApiToRefDoc complete mode", () => {
  it("emits top-level and one-level-nested scalars as CONSTANT elements in member order", () => {
    const constants = scriptApiToRefDoc(parse(CONSTANTS), { complete: true }).elements.filter(
      (e) => e.type === "CONSTANT",
    );
    expect(constants).toEqual([
      {
        type: "CONSTANT",
        name: "demo.MSG_A",
        brief: "the first message",
        description: "the first message",
      },
      { type: "CONSTANT", name: "demo.sub.KIND_B", brief: "", description: "" },
      {
        type: "CONSTANT",
        name: "demo.LABEL",
        brief: "a string constant",
        description: "a string constant",
      },
    ]);
  });

  it("keeps the default output free of constants and identical to complete mode's functions", () => {
    const plain = scriptApiToRefDoc(parse(CONSTANTS));
    const complete = scriptApiToRefDoc(parse(CONSTANTS), { complete: true });
    expect(plain.elements.some((e) => e.type === "CONSTANT")).toBe(false);
    expect(plain).toEqual({
      ...complete,
      elements: complete.elements.filter((e) => e.type !== "CONSTANT"),
    });
  });

  it("lists the constants in parseDefoldApiDoc's module.constants", () => {
    const module = parseDefoldApiDoc(parseScriptApi(CONSTANTS, { complete: true }));
    expect(module.constants.map((c) => c.name)).toEqual([
      "demo.MSG_A",
      "demo.sub.KIND_B",
      "demo.LABEL",
    ]);
    expect(module.functions.map((f) => f.name)).toEqual(["demo.greet", "demo.sub.run"]);
  });
});

const LUA_SAMPLE = `function init(self)
    if a < b and c then
        ex.run("x & y")
    end
end`;

const EXAMPLES = `
- name: ex
  type: table
  desc: The ex namespace.
  members:
  - name: run
    type: function
    desc: Run it.
    examples:
    - desc: |-
        Call it from \`init\` when a < b & c.

        \`\`\`lua
${LUA_SAMPLE.split("\n")
  .map((line) => `        ${line}`)
  .join("\n")}
        \`\`\`
    - desc: |-
        \`\`\`
        local t = { 1, 2 }
        \`\`\`
  - name: configure
    type: function
    desc: Configure it.
    examples:
    - desc: |-
        \`\`\`json
        { "enabled": true }
        \`\`\`
  - name: bare
    type: function
    desc: No examples.
`;

function exampleOf(doc: RefDoc, name: string): string | undefined {
  return functionElements(doc).find((e) => e.name === name)?.examples;
}

describe("scriptApiToRefDoc examples", () => {
  it("round-trips prose and fenced blocks through examplesHtmlToMarkdown in complete mode", () => {
    const html = exampleOf(scriptApiToRefDoc(parse(EXAMPLES), { complete: true }), "ex.run");
    expect(html).toBeDefined();
    expect(examplesHtmlToMarkdown(html ?? "")).toBe(
      [
        "Call it from `init` when a < b & c.",
        `\`\`\`lua\n${LUA_SAMPLE}\n\`\`\``,
        "```lua\nlocal t = { 1, 2 }\n```",
      ].join("\n\n"),
    );
  });

  it("keeps a fence's own language", () => {
    const html = exampleOf(scriptApiToRefDoc(parse(EXAMPLES), { complete: true }), "ex.configure");
    expect(examplesHtmlToMarkdown(html ?? "")).toBe('```json\n{ "enabled": true }\n```');
  });

  it("omits the examples key when a function has none, and in default mode", () => {
    const complete = functionElements(scriptApiToRefDoc(parse(EXAMPLES), { complete: true }));
    expect(complete.find((e) => e.name === "ex.bare")).not.toHaveProperty("examples");
    for (const element of functionElements(scriptApiToRefDoc(parse(EXAMPLES)))) {
      expect(element).not.toHaveProperty("examples");
    }
  });
});

const UNION_TYPES = `
- name: u
  type: table
  desc: The u namespace.
  members:
  - name: plain
    type: function
    desc: single-word type
    returns:
    - name: value
      type: string
      desc: a string
  - name: spaced
    type: function
    desc: canonical spacing
    returns:
    - name: value
      type: string | nil
      desc: a string or nil
  - name: tight
    type: function
    desc: no spacing
    returns:
    - name: value
      type: string|nil
      desc: a string or nil
  - name: wide
    type: function
    desc: extra spacing and a trailing separator
    parameters:
    - name: value
      type: "string  |  nil |"
      desc: a string or nil
`;

function unionReturn(name: string): string[] | undefined {
  const doc = scriptApiToRefDoc(parse(UNION_TYPES));
  return functionElements(doc).find((e) => e.name === `u.${name}`)?.returnvalues[0]?.types;
}

describe("scriptApiToRefDoc pipe-separated types", () => {
  it("splits a union type into one token per alternative", () => {
    expect(unionReturn("spaced")).toEqual(["string", "nil"]);
  });

  it("parses irregular spacing identically", () => {
    expect(unionReturn("tight")).toEqual(["string", "nil"]);
    const wide = functionElements(scriptApiToRefDoc(parse(UNION_TYPES))).find(
      (e) => e.name === "u.wide",
    );
    expect(wide?.parameters[0]?.types).toEqual(["string", "nil"]);
  });

  it("leaves a single-word type as a one-element array", () => {
    expect(unionReturn("plain")).toEqual(["string"]);
  });

  // The `.script_api` sources for the built-in extensions are fetched, not
  // committed, so the offline guard that the split moves no frozen golden runs
  // over the emitted fixtures: none of them carries a pipe-bearing type token,
  // therefore none of them can re-emit differently once `|` is split.
  it("no committed engine fixture carries a pipe-bearing type token", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith(".json")) continue;
        let doc: unknown;
        try {
          doc = JSON.parse(readFileSync(path, "utf8"));
        } catch {
          continue;
        }
        const elements = (doc as { elements?: unknown }).elements;
        if (!Array.isArray(elements)) continue;
        for (const element of elements as RefDocFunctionElement[]) {
          const slots = [...(element.parameters ?? []), ...(element.returnvalues ?? [])];
          for (const slot of slots) {
            for (const token of slot.types ?? []) {
              if (token.includes("|")) offenders.push(`${path}: ${element.name} -> ${token}`);
            }
          }
        }
      }
    };
    walk(resolve(import.meta.dir, "..", "fixtures"));
    expect(offenders).toEqual([]);
  });
});
