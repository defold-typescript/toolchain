import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { lowerLibraryModel } from "./lower-api-doc";
import type { LibraryModel } from "./parse-luals";
import { buildTargetModel, readLualsTargets } from "./sync-luals-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function elementsOf(lowered: unknown): Record<string, unknown>[] {
  if (!isRecord(lowered) || !Array.isArray(lowered.elements)) throw new Error("no elements");
  return lowered.elements.filter(isRecord);
}

test("a module function with an optional param and a return lowers to a FUNCTION element", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "new_button",
        brief: "Create a button.\nLonger description.",
        generics: [],
        params: [
          { name: "node", types: ["node"], doc: "the node", isOptional: false, isVararg: false },
          {
            name: "callback",
            types: ["function"],
            doc: "the callback",
            isOptional: true,
            isVararg: false,
          },
        ],
        returns: [
          {
            name: "button",
            types: ["druid.button"],
            doc: "the button",
            isOptional: false,
            isVararg: false,
          },
        ],
      },
    ],
  };

  const [fn] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(fn?.type).toBe("FUNCTION");
  expect(fn?.name).toBe("new_button");
  expect(fn?.brief).toBe("Create a button.\nLonger description.");
  expect(fn?.description).toBe("Create a button.\nLonger description.");
  expect(fn?.parameters).toEqual([
    { name: "node", doc: "the node", types: ["node"], is_optional: "False" },
    { name: "callback", doc: "the callback", types: ["function"], is_optional: "True" },
  ]);
  expect(fn?.returnvalues).toEqual([{ name: "", doc: "the button", types: ["druid.button"] }]);
});

test("an interface lowers to a TYPEDEF with functions from methods and properties from public fields", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "druid_button",
        generics: [],
        fields: [
          { name: "hover", types: ["druid.hover"], doc: "the hover component", isOptional: false },
        ],
        methods: [
          {
            name: "set_enabled",
            brief: "Enable or disable.",
            generics: [],
            params: [
              {
                name: "state",
                types: ["boolean"],
                doc: "on/off",
                isOptional: false,
                isVararg: false,
              },
            ],
            returns: [
              {
                name: "self",
                types: ["druid.button"],
                doc: "",
                isOptional: false,
                isVararg: false,
              },
            ],
          },
        ],
        brief: "A button.",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(typedef?.type).toBe("TYPEDEF");
  expect(typedef?.name).toBe("druid_button");
  expect(typedef?.functions).toEqual([
    {
      type: "FUNCTION",
      name: "set_enabled",
      brief: "Enable or disable.",
      description: "Enable or disable.",
      parameters: [{ name: "state", doc: "on/off", types: ["boolean"], is_optional: "False" }],
      returnvalues: [{ name: "", doc: "", types: ["druid.button"] }],
    },
  ]);
  expect(typedef?.properties).toEqual([
    {
      name: "hover",
      brief: "the hover component",
      description: "the hover component",
      types: ["druid.hover"],
    },
  ]);
});

test("a non-public field is dropped from the TYPEDEF properties; a field with no visibility is kept", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [
          { name: "kept", types: ["number"], doc: "", isOptional: false },
          { name: "secret", types: ["number"], doc: "", isOptional: false, visibility: "private" },
          {
            name: "shared",
            types: ["number"],
            doc: "",
            isOptional: false,
            visibility: "protected",
          },
          { name: "pkg", types: ["number"], doc: "", isOptional: false, visibility: "package" },
          { name: "shown", types: ["number"], doc: "", isOptional: false, visibility: "public" },
        ],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const [typedef] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  const props = typedef?.properties as { name: string }[];
  expect(props.map((p) => p.name)).toEqual(["kept", "shown"]);
});

test("an alias lowers to a bare TYPEDEF with no functions or properties", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [{ name: "druid.callback", types: ["fun():void"], doc: "" }],
    moduleFunctions: [],
  };

  const [alias] = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(alias).toEqual({ type: "TYPEDEF", name: "druid.callback" });
});

test("emits moduleFunctions, then interfaces, then aliases in order", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "iface", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [{ name: "al", types: ["x"], doc: "" }],
    moduleFunctions: [{ name: "fn", brief: "", generics: [], params: [], returns: [] }],
  };
  const elements = elementsOf(lowerLibraryModel(model, { namespace: "druid" }));
  expect(elements.map((e) => [e.type, e.name])).toEqual([
    ["FUNCTION", "fn"],
    ["TYPEDEF", "iface"],
    ["TYPEDEF", "al"],
  ]);
});

test("the lowered object round-trips through parseDefoldApiDoc", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [{ name: "x", types: ["number"], doc: "", isOptional: false }],
        methods: [{ name: "m", brief: "", generics: [], params: [], returns: [] }],
        brief: "",
      },
    ],
    aliases: [{ name: "al", types: ["x"], doc: "" }],
    moduleFunctions: [{ name: "fn", brief: "", generics: [], params: [], returns: [] }],
  };
  const lowered = lowerLibraryModel(model, { namespace: "druid" });
  const parsed = parseDefoldApiDoc(lowered);
  expect(parsed.namespace).toBe("druid");
  expect(parsed.functions).toHaveLength(1);
  expect(parsed.typedefs).toHaveLength(2);
  expect(parsed.typedefs[0]?.functions).toHaveLength(1);
  expect(parsed.typedefs[0]?.properties).toHaveLength(1);
});

test("regenerating druid from the committed fixtures matches the committed golden api-doc byte-for-byte", () => {
  const packageRoot = join(import.meta.dir, "..");
  const druid = readLualsTargets(packageRoot).find((t) => t.namespace === "druid");
  if (!druid) throw new Error("druid target missing from luals-targets.json");

  const model = buildTargetModel(packageRoot, druid);
  const lowered = lowerLibraryModel(model, { namespace: druid.namespace });
  const emitted = `${JSON.stringify(lowered, null, 2)}\n`;
  const golden = readFileSync(join(packageRoot, "api-doc", `${druid.namespace}.json`), "utf8");

  expect(emitted).toBe(golden);
});
