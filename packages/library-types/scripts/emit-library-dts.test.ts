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

test("emits a base's self-receiving hook fields as permissive optional methods, preserving the return", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "base",
        generics: [],
        fields: [
          {
            name: "on_style_change",
            types: ["fun(self:base, style: table)|nil"],
            doc: "Called when style changes.",
            isOptional: false,
          },
          { name: "measure", types: ["fun(self:base):number"], doc: "", isOptional: false },
        ],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("on_style_change?(...args: any[]): void;");
  expect(out).toContain("measure?(...args: any[]): number;");
  expect(out).not.toContain("on_style_change: ((");
});

test("keeps both the extends clause and a subinterface's refined override of a base hook method", () => {
  const model: LibraryModel = {
    interfaces: [
      { name: "refined", generics: [], fields: [], methods: [], brief: "" },
      {
        name: "base",
        generics: [],
        fields: [
          {
            name: "on_style_change",
            types: ["fun(self:base, style: table)|nil"],
            doc: "",
            isOptional: false,
          },
        ],
        methods: [],
        brief: "",
      },
      {
        name: "child",
        extends: "base",
        generics: [],
        fields: [],
        methods: [
          {
            name: "on_style_change",
            brief: "",
            generics: [],
            params: [
              { name: "style", types: ["refined"], doc: "", isOptional: false, isVararg: false },
            ],
            returns: [],
          },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface child extends base {");
  expect(out).toContain("on_style_change(style: refined): void;");
  expect(out).toContain("on_style_change?(...args: any[]): void;");
});

test("leaves a hook field with an untyped self as a data field", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "stylebag",
        generics: [],
        fields: [{ name: "on_init", types: ["fun(self)|nil"], doc: "", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("on_init: ((self: unknown) => void) | undefined;");
  expect(out).not.toContain("on_init?(...args: any[])");
});

test("leaves a hook field whose self is a different declared interface as a data field", () => {
  const model: LibraryModel = {
    interfaces: [
      { name: "other", generics: [], fields: [], methods: [], brief: "" },
      {
        name: "stylebag",
        generics: [],
        fields: [{ name: "on_init", types: ["fun(self: other)|nil"], doc: "", isOptional: false }],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("on_init: ((self: other) => void) | undefined;");
  expect(out).not.toContain("on_init?(...args: any[])");
});

test("preserves a self-hook's union return when lowering to an optional method", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "base",
        generics: [],
        fields: [
          { name: "measure", types: ["fun(self:base): number|string"], doc: "", isOptional: false },
        ],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("measure?(...args: any[]): number | string;");
  expect(out).not.toContain("measure: (");
});

test("preserves a self-hook's nullable return when lowering to an optional method", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "base",
        generics: [],
        fields: [
          { name: "probe", types: ["fun(self:base): number|nil"], doc: "", isOptional: false },
        ],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("probe?(...args: any[]): number | undefined;");
  expect(out).not.toContain("probe: (");
});

test("preserves a self-hook's union + nullable + multi-return when lowering to an optional method", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "base",
        generics: [],
        fields: [
          {
            name: "sample",
            types: ["fun(self:base): number|nil, string"],
            doc: "",
            isOptional: false,
          },
        ],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("sample?(...args: any[]): LuaMultiReturn<[number | undefined, string]>;");
  expect(out).not.toContain("sample: (");
});

test("emits a bare generic param when the constraint resolves to unknown, not <T extends unknown>", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "bag",
        generics: [{ name: "T", constraint: "not_declared" }],
        fields: [],
        methods: [],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("interface bag<T> {");
  expect(out).not.toContain("extends unknown");
});

const EMIT_TARGETS = readLualsTargets(join(import.meta.dir, "..")).map(
  (target) => [target.namespace, target] as const,
);

test("the luals corpus carries more than one target, proving the pipeline generalizes beyond druid", () => {
  const namespaces = EMIT_TARGETS.map(([namespace]) => namespace);
  expect(namespaces).toContain("druid");
  expect(namespaces.length).toBeGreaterThan(1);
});

test.each(
  EMIT_TARGETS,
)("regenerating %s from the committed fixtures matches the committed golden byte-for-byte", (namespace, target) => {
  const packageRoot = join(import.meta.dir, "..");
  const model = buildTargetModel(packageRoot, target);
  const emitted = emitLibraryDeclarations(model, {
    moduleId: target.moduleId,
    typeRenames: target.typeRenames,
  });
  const golden = readFileSync(join(packageRoot, "generated", `${namespace}.d.ts`), "utf8");

  expect(emitted).toBe(golden);
});
