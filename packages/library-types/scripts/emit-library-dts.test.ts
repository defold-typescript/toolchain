import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emitLibraryDeclarations,
  isPublicField,
  isPublicMethod,
  sanitizeTypeName,
} from "./emit-library-dts";
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

test("omits a non-public field and method but keeps public members and a public self-hook field", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "comp",
        generics: [],
        fields: [
          { name: "secret", types: ["number"], doc: "", isOptional: false, visibility: "private" },
          { name: "count", types: ["number"], doc: "", isOptional: false },
          { name: "on_init", types: ["fun(self:comp):number"], doc: "", isOptional: false },
        ],
        methods: [
          {
            name: "hidden",
            brief: "",
            generics: [],
            params: [],
            returns: [],
            visibility: "local",
          },
          { name: "shown", brief: "", generics: [], params: [], returns: [] },
        ],
        brief: "",
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).not.toContain("secret");
  expect(out).not.toContain("hidden");
  expect(out).toContain("count: number;");
  expect(out).toContain("on_init?(...args: any[]): number;");
  expect(out).toContain("shown(): void;");
});

test("omits a non-public moduleFunction while keeping a public one", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      { name: "helper", brief: "", generics: [], params: [], returns: [], visibility: "local" },
      { name: "create", brief: "", generics: [], params: [], returns: [] },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).not.toContain("helper");
  expect(out).toContain("export function create(this: void): void;");
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

test("renders a trailing vararg return as a rest tuple element", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "world", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "spawn",
        brief: "",
        generics: [],
        params: [],
        returns: [
          { name: "w", types: ["world"], doc: "", isOptional: false, isVararg: false },
          { name: "", types: ["..."], doc: "", isOptional: false, isVararg: false },
        ],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("): LuaMultiReturn<[world, ...unknown[]]>;");
});

test("keeps a fixed-arity multi-return unchanged", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "world", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [
      {
        name: "spawn",
        brief: "",
        generics: [],
        params: [],
        returns: [
          { name: "w", types: ["world"], doc: "", isOptional: false, isVararg: false },
          { name: "s", types: ["string"], doc: "", isOptional: false, isVararg: false },
        ],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("): LuaMultiReturn<[world, string]>;");
});

test("renders a self-hook's trailing vararg return as a rest tuple element", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "base",
        generics: [],
        fields: [
          { name: "sample", types: ["fun(self:base): world, ..."], doc: "", isOptional: false },
        ],
        methods: [],
        brief: "",
      },
      { name: "world", generics: [], fields: [], methods: [], brief: "" },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("sample?(...args: any[]): LuaMultiReturn<[world, ...unknown[]]>;");
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

test("renders a trailing run of nil-bearing params as optional, stopping at the first required from the right", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "f",
        brief: "",
        generics: [],
        params: [
          {
            name: "a",
            types: ["string|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          { name: "b", types: ["string"], doc: "", isOptional: false, isVararg: false },
          {
            name: "c",
            types: ["string|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
        ],
        returns: [],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain(
    "export function f(this: void, a: string | undefined, b: string, c?: string | undefined): void;",
  );
});

test("a trailing vararg does not block the preceding nil-bearing run from being optional", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "g",
        brief: "",
        generics: [],
        params: [
          {
            name: "a",
            types: ["string|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          { name: "...", types: ["number"], doc: "", isOptional: false, isVararg: true },
        ],
        returns: [],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain(
    "export function g(this: void, a?: string | undefined, ...args: number[]): void;",
  );
});

test("renders trailing type-suffix nil-bearing params optional and a nilable field with a `?`", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "opts",
        generics: [],
        brief: "",
        methods: [],
        fields: [
          { name: "loader", types: ["function|nil"], doc: "", isOptional: true },
          { name: "id", types: ["string"], doc: "", isOptional: false },
        ],
      },
    ],
    aliases: [],
    moduleFunctions: [
      {
        name: "h",
        brief: "",
        generics: [],
        params: [
          {
            name: "a",
            types: ["string?"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          {
            name: "b",
            types: ["function?"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
        ],
        returns: [],
      },
      {
        name: "both",
        brief: "",
        generics: [],
        params: [
          {
            name: "cb",
            types: ["function|nil"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          {
            name: "params",
            types: ["any?"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
        ],
        returns: [],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("loader?: ((...args: any[]) => unknown) | undefined;");
  expect(out).toContain("id: string;");
  expect(out).toContain(
    "export function h(this: void, a?: string | undefined, b?: ((...args: any[]) => unknown) | undefined): void;",
  );
  // The back_handler shape: two adjacent trailing nil-bearing params are both optional.
  expect(out).toContain(
    "export function both(this: void, cb?: ((...args: any[]) => unknown) | undefined, params?: unknown | undefined): void;",
  );
});

test("a nil-bearing param that precedes a required one stays `| undefined` with no `?` (contiguity)", () => {
  const model: LibraryModel = {
    interfaces: [],
    aliases: [],
    moduleFunctions: [
      {
        name: "pre",
        brief: "",
        generics: [],
        params: [
          {
            name: "a",
            types: ["string?"],
            doc: "",
            isOptional: false,
            isVararg: false,
            isNilable: true,
          },
          { name: "b", types: ["string"], doc: "", isOptional: false, isVararg: false },
        ],
        returns: [],
      },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("export function pre(this: void, a: string | undefined, b: string): void;");
});

test("renders each interface @overload as a call signature line inside the interface block", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "widget",
        generics: [],
        fields: [],
        methods: [],
        brief: "",
        overloads: [
          { type: "fun(vararg:any): any|nil", doc: "Trigger it." },
          { type: "fun(): nil", doc: "" },
        ],
      },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain("(vararg: unknown): unknown | undefined;");
  expect(out).toContain("(): undefined;");
  // The call signatures live inside the interface block, after any members.
  expect(out).toMatch(
    /interface widget \{[\s\S]*\(vararg: unknown\): unknown \| undefined;[\s\S]*\}/,
  );
});

test("renders @deprecated on a tagged interface, alias, method and module function, and nowhere else", () => {
  const model: LibraryModel = {
    interfaces: [
      {
        name: "gone",
        deprecated: "Use `kept` instead.",
        generics: [],
        fields: [],
        methods: [
          {
            name: "old_call",
            brief: "",
            deprecated: "",
            generics: [],
            params: [],
            returns: [],
          },
          { name: "new_call", brief: "", generics: [], params: [], returns: [] },
        ],
        brief: "",
      },
      { name: "kept", generics: [], fields: [], methods: [], brief: "" },
    ],
    aliases: [
      { name: "old_mode", types: ["string"], doc: "", deprecated: "Use `mode`." },
      { name: "mode", types: ["string"], doc: "" },
    ],
    moduleFunctions: [
      {
        name: "old_fn",
        brief: "Legacy.",
        deprecated: "Gone in 2.0.",
        generics: [],
        params: [],
        returns: [],
      },
      { name: "new_fn", brief: "", generics: [], params: [], returns: [] },
    ],
  };

  const out = emitLibraryDeclarations(model, { moduleId: "x.x" });

  expect(out).toContain(" * @deprecated Use `kept` instead.");
  expect(out).toContain(" * @deprecated Use `mode`.");
  expect(out).toContain(" * @deprecated Gone in 2.0.");
  // The bare tag on `old_call` renders with no trailing text.
  expect(out).toMatch(/^\s+\* @deprecated$/m);
  // 4 = the four deprecated members in the fixture above; this is what proves the
  // tag did not also land on `new_fn`, which declares no deprecation.
  expect(out.match(/@deprecated/g)).toHaveLength(4);
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
    externalTypes: target.externalTypes,
  });
  const golden = readFileSync(join(packageRoot, "generated", `${namespace}.d.ts`), "utf8");

  expect(emitted).toBe(golden);
});

// The neighbouring round-trip proves the golden matches a rebuild; this names the
// contract, so a regeneration that silently drops parameters reports as an arity
// regression rather than as an opaque golden diff.
test("the committed druid golden carries drag's full six-parameter callback signature", () => {
  const golden = readFileSync(join(import.meta.dir, "..", "generated", "druid.d.ts"), "utf8");

  expect(golden).toContain(
    "on_drag_callback: (self: unknown, dx: number, dy: number, x: number, y: number, touch: touch) => void",
  );
});

// A declaration is present for every public modeled surface: each non-moduleObject
// interface, each moduleObject field (as an `export const`), and each module function
// (its identifier, or its reserved-name `as <name>` re-export). Catches root cause C:
// a public member silently dropped from the emitted `.d.ts`.
function missingDeclarations(model: LibraryModel, out: string): string[] {
  const missing: string[] = [];
  for (const iface of model.interfaces) {
    if (iface.name === model.moduleObject) {
      for (const field of iface.fields) {
        if (!isPublicField(field)) continue;
        if (!out.includes(`export const ${field.name}:`)) missing.push(`const ${field.name}`);
      }
      continue;
    }
    if (!out.includes(`interface ${sanitizeTypeName(iface.name)}`)) {
      missing.push(`interface ${iface.name}`);
    }
  }
  for (const fn of model.moduleFunctions) {
    if (!isPublicMethod(fn)) continue;
    // A plain function emits `export function name(` or, when generic, `export function
    // name<`; a reserved name is re-exported `as name }`.
    const direct =
      out.includes(`export function ${fn.name}(`) || out.includes(`export function ${fn.name}<`);
    const reExported = out.includes(`as ${fn.name} }`);
    if (!direct && !reExported) missing.push(`function ${fn.name}`);
  }
  return missing;
}

const moduleObjectModel: LibraryModel = {
  moduleObject: "Squid",
  interfaces: [
    {
      name: "Squid",
      generics: [],
      fields: [
        { name: "TRACE", types: ["integer"], doc: "trace level", isOptional: false },
        { name: "ALLOWLIST", types: ["table"], doc: "", isOptional: false },
      ],
      methods: [],
      brief: "The squid module.\nSaveable logging.",
    },
    {
      name: "SquidInstance",
      generics: [],
      fields: [],
      methods: [
        {
          name: "log",
          brief: "",
          generics: [],
          params: [
            {
              name: "message",
              types: ["string|number"],
              doc: "",
              isOptional: false,
              isVararg: false,
            },
            { name: "data", types: ["any"], doc: "", isOptional: true, isVararg: false },
          ],
          returns: [],
        },
      ],
      brief: "",
    },
  ],
  aliases: [],
  moduleFunctions: [
    {
      name: "new",
      brief: "Create a new instance.",
      generics: [],
      params: [{ name: "tag", types: ["string"], doc: "", isOptional: true, isVararg: false }],
      returns: [
        { name: "", types: ["SquidInstance"], doc: "", isOptional: false, isVararg: false },
      ],
    },
  ],
};

test("a moduleObject lifts its fields to export consts, drops its interface, and keeps full-typed instance methods", () => {
  const out = emitLibraryDeclarations(moduleObjectModel, { moduleId: "squid.squid" });
  // Module constants become module-level export consts.
  expect(out).toContain("export const TRACE: number;");
  expect(out).toContain("export const ALLOWLIST: LuaTable;");
  // The module-object class itself is not a standalone interface.
  expect(out).not.toContain("interface Squid {");
  // The captured instance interface survives with a full-typed method (not a hook).
  expect(out).toContain("interface SquidInstance {");
  expect(out).toContain("log(message: string | number, data?: unknown): void;");
  expect(out).not.toContain("log?(...args: any[])");
  // The inferred return flows through: `new` (reserved) is aliased and returns the instance.
  expect(out).toContain("export function new_(this: void, tag?: string): SquidInstance;");
  expect(out).toContain("export { new_ as new };");
});

test("emit drops no public modeled surface for a hand-built moduleObject model", () => {
  const out = emitLibraryDeclarations(moduleObjectModel, { moduleId: "squid.squid" });
  expect(missingDeclarations(moduleObjectModel, out)).toEqual([]);
});

test("the structural drop guard reds when a modeled declaration is absent from the output", () => {
  const emptyOut = "/** @noResolution */\ndeclare module 'squid.squid' {\n}\n";
  expect(missingDeclarations(moduleObjectModel, emptyOut).length).toBeGreaterThan(0);
});

test.each(
  EMIT_TARGETS,
)("emit drops no public modeled surface for the real %s model", (_namespace, target) => {
  const packageRoot = join(import.meta.dir, "..");
  const model = buildTargetModel(packageRoot, target);
  const out = emitLibraryDeclarations(model, {
    moduleId: target.moduleId,
    typeRenames: target.typeRenames,
    externalTypes: target.externalTypes,
  });
  expect(missingDeclarations(model, out)).toEqual([]);
});

const externalModel: LibraryModel = {
  interfaces: [
    {
      name: "holder",
      generics: [],
      fields: [{ name: "hook", types: ["ext"], doc: "", isOptional: false }],
      methods: [],
      brief: "",
    },
  ],
  aliases: [],
  moduleFunctions: [],
};

test("an external token emits an import as the first line in the block and types the field", () => {
  const out = emitLibraryDeclarations(externalModel, {
    moduleId: "demo.demo",
    externalTypes: { ext: { module: "other.mod", name: "ext" } },
  });

  expect(out.split("\n")[2]).toBe("\timport { ext } from 'other.mod';");
  expect(out).toContain("hook: ext;");
  expect(out).not.toContain("unknown");
});

test("two tokens from one external module emit a single sorted import, rendered deterministically", () => {
  const opts = {
    moduleId: "demo.demo",
    externalTypes: {
      zeta: { module: "other.mod", name: "zeta" },
      ext: { module: "other.mod", name: "ext" },
    },
  };

  const out = emitLibraryDeclarations(externalModel, opts);

  expect(out).toContain("import { ext, zeta } from 'other.mod';");
  expect(out.match(/import /g)).toHaveLength(1);
  expect(emitLibraryDeclarations(externalModel, opts)).toBe(out);
});

test("two external modules emit two imports sorted by module id", () => {
  const out = emitLibraryDeclarations(externalModel, {
    moduleId: "demo.demo",
    externalTypes: {
      ext: { module: "zed.mod", name: "ext" },
      other: { module: "alpha.mod", name: "other" },
    },
  });

  const imports = out.split("\n").filter((line) => line.includes("import "));
  expect(imports).toEqual([
    "\timport { other } from 'alpha.mod';",
    "\timport { ext } from 'zed.mod';",
  ]);
});

test("an external alias colliding with a declared name throws, naming the token and the declaration", () => {
  const model: LibraryModel = {
    interfaces: [{ name: "ext", generics: [], fields: [], methods: [], brief: "" }],
    aliases: [],
    moduleFunctions: [],
  };

  expect(() =>
    emitLibraryDeclarations(model, {
      moduleId: "demo.demo",
      externalTypes: { ext: { module: "other.mod", name: "ext" } },
    }),
  ).toThrow(/ext/);
});

test("an extends naming an external token emits the clause; an undeclared parent still emits none", () => {
  const model: LibraryModel = {
    interfaces: [
      { name: "child", extends: "ext", generics: [], fields: [], methods: [], brief: "" },
      { name: "orphan", extends: "nope", generics: [], fields: [], methods: [], brief: "" },
    ],
    aliases: [],
    moduleFunctions: [],
  };

  const out = emitLibraryDeclarations(model, {
    moduleId: "demo.demo",
    externalTypes: { ext: { module: "other.mod", name: "ext" } },
  });

  expect(out).toContain("interface child extends ext {");
  expect(out).toContain("interface orphan {");
});

const stdlibRenameModel: LibraryModel = {
  interfaces: [],
  aliases: [],
  moduleFunctions: [
    {
      name: "get_default_logger_name",
      brief: "",
      generics: [],
      params: [
        { name: "debuginfo", types: ["debuginfo"], doc: "", isOptional: false, isVararg: false },
      ],
      returns: [{ name: "", types: ["string"], doc: "", isOptional: false, isVararg: false }],
    },
  ],
};

test("an ambient stdlib rename types the param as the dotted global and emits no import", () => {
  const out = emitLibraryDeclarations(stdlibRenameModel, {
    moduleId: "demo.demo",
    typeRenames: { debuginfo: "debug.FunctionInfo" },
  });

  expect(out).toContain(
    "export function get_default_logger_name(this: void, debuginfo: debug.FunctionInfo): string;",
  );
  expect(out).not.toContain("import");
  expect(out).not.toContain("unknown");
});

test("a model declaring the token itself wins over the ambient stdlib rename", () => {
  const model: LibraryModel = {
    ...stdlibRenameModel,
    interfaces: [{ name: "debuginfo", generics: [], fields: [], methods: [], brief: "" }],
  };

  const out = emitLibraryDeclarations(model, {
    moduleId: "demo.demo",
    typeRenames: { debuginfo: "debug.FunctionInfo" },
  });

  expect(out).toContain(
    "export function get_default_logger_name(this: void, debuginfo: debuginfo): string;",
  );
  expect(out).not.toContain("debug.FunctionInfo");
});
