import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emitLibraryDeclarations } from "./emit-library-dts";
import type { LibraryModel } from "./parse-luals";
import { buildTargetModel, readLualsTargets } from "./sync-luals-types";

test("emits a declare module block with an interface, its field and method, and a module function", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "widget",
        generics: [],
        fields: [{ name: "count", types: ["integer"], doc: "", isOptional: false }],
        methods: [
          {
            name: "resize",
            brief: "Resize the widget.",
            generics: [],
            params: [
              { name: "size", types: ["number"], doc: "", isOptional: false, isVararg: false },
            ],
            returns: [
              { name: "ok", types: ["boolean"], doc: "", isOptional: false, isVararg: false },
            ],
          },
        ],
        brief: "A widget.",
      },
    ],
    aliases: [],
    moduleFunctions: [
      {
        name: "create",
        brief: "Create a widget.",
        generics: [],
        params: [],
        returns: [
          { name: "widget", types: ["widget"], doc: "", isOptional: false, isVararg: false },
        ],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "demo.demo" });

  expect(out).toMatchSnapshot();
  expect(out).toContain("declare module 'demo.demo' {");
  expect(out).toContain("interface widget {");
  expect(out).toContain("count: number;");
  expect(out).toContain("resize(size: number): boolean;");
  expect(out).toContain("export function create(this: void): widget;");
});

test("emits a reserved-word member through the reserved-name path, not raw", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "opts",
        generics: [],
        fields: [{ name: "default", types: ["boolean"], doc: "", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain('"default"');
  expect(out).not.toMatch(/default\s*:/);
});

test("emits a constrained generic param and an extends clause when the parent is a declared interface", () => {
  const model: LibraryModel = {
    interfaces: [
      { name: "druid.component", generics: [], fields: [], methods: [], brief: "" },
      {
        name: "box",
        extends: "druid.component",
        generics: [{ name: "T", constraint: "druid.component" }],
        fields: [],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface box<T extends druid_component> extends druid_component {");
});

test("emits a bare generic param when the generic has no constraint", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "bag", generics: [{ name: "T" }], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface bag<T> {");
});

test("scopes a method generic so its param and return resolve to the param, not unknown", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "mapper",
        generics: [],
        fields: [],
        methods: [
          {
            name: "map",
            brief: "",
            generics: [{ name: "T" }],
            params: [{ name: "x", types: ["T"], doc: "", isOptional: false, isVararg: false }],
            returns: [{ name: "y", types: ["T"], doc: "", isOptional: false, isVararg: false }],
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("map<T>(x: T): T;");
  expect(out).not.toContain("unknown");
});

test("omits the extends clause when the parent is not a declared interface", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "lonely",
        extends: "not_declared",
        generics: [],
        fields: [],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface lonely {");
  expect(out).not.toContain("extends");
});

test("regenerating druid from the committed fixtures matches the committed golden byte-for-byte", () => {
  const packageRoot = join(import.meta.dir, "..");
  const druid = readLualsTargets(packageRoot).find((t) => t.namespace === "druid");
  if (!druid) throw new Error("druid target missing from luals-targets.json");

  const model = buildTargetModel(packageRoot, druid);
  const emitted = emitLibraryDeclarations(model, {
    moduleId: druid.moduleId,
    typeRenames: druid.typeRenames,
  });
  const golden = readFileSync(join(packageRoot, "generated", `${druid.namespace}.d.ts`), "utf8");

  expect(emitted).toBe(golden);
});
