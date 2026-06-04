import { describe, expect, test } from "bun:test";
import goDoc from "../fixtures/go_doc.json" with { type: "json" };
import guiDoc from "../fixtures/gui_doc.json" with { type: "json" };
import physicsDoc from "../fixtures/physics_doc.json" with { type: "json" };
import resourceDoc from "../fixtures/resource_doc.json" with { type: "json" };
import sysDoc from "../fixtures/sys_doc.json" with { type: "json" };
import vmathDoc from "../fixtures/vmath_doc.json" with { type: "json" };
import { type ApiFunction, type ApiModule, parseDefoldApiDoc } from "./api-doc";
import {
  ARBITRARY_TABLE_SLOTS,
  buildTableDocResolver,
  emitDeclarations,
  HOMOGENEOUS_ARRAY_SLOTS,
  inlineTableType,
  MAPPING_TABLE_SLOTS,
  parseTableFields,
  recoverCallbackSignature,
  SLOT_LEVEL_LIST_PROSE,
} from "./emit-dts";

function requireFunction(module: ApiModule, name: string): ApiFunction {
  const fn = module.functions.find((candidate) => candidate.name === name);
  if (!fn) throw new Error(`missing function ${name}`);
  return fn;
}

describe("emitDeclarations", () => {
  test("empty module emits a bare namespace block with a trailing newline", () => {
    const empty: ApiModule = {
      namespace: "foo",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(empty)).toBe("declare namespace foo {\n}\n");
  });

  test("vmath emit contains the namespace header and key signatures", () => {
    const module = parseDefoldApiDoc(vmathDoc);
    const out = emitDeclarations(module);
    expect(out).toContain("declare namespace vmath {");
    expect(out).toContain("function vector3(): Vector3;");
    expect(out).toContain("function vector3(x: number, y: number, z: number): Vector3;");
    // vmath.dot accepts vector3 or vector4 — union types are the natural emission.
    expect(out).toContain("function dot(v1: Vector3 | Vector4, v2: Vector3 | Vector4): number;");
  });

  test("multi-type parameter emits a TypeScript union", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [
        {
          name: "thing.takes",
          brief: "",
          description: "",
          parameters: [{ name: "v", doc: "", types: ["number", "vector3"], isOptional: false }],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function takes(v: number | Vector3): void;");
  });

  test("unknown Defold type token falls through to unknown without throwing", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [
        {
          name: "thing.weird",
          brief: "",
          description: "",
          parameters: [{ name: "x", doc: "", types: ["frobnicator"], isOptional: false }],
          returnValues: [{ name: "", doc: "", types: ["frobnicator"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function weird(x: unknown): unknown;");
  });

  test("an opaque engine-handle token emits a branded Opaque type", () => {
    const module: ApiModule = {
      namespace: "gui",
      brief: "",
      description: "",
      functions: [
        {
          name: "gui.get_parent",
          brief: "",
          description: "",
          parameters: [{ name: "node", doc: "", types: ["node"], isOptional: false }],
          returnValues: [{ name: "", doc: "", types: ["node"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain('function get_parent(node: Opaque<"node">): Opaque<"node">;');
  });

  test("a callback-signature token emits an arity-preserving typed function", () => {
    const module: ApiModule = {
      namespace: "timer",
      brief: "",
      description: "",
      functions: [
        {
          name: "timer.delay",
          brief: "",
          description: "",
          parameters: [
            {
              name: "callback",
              doc: "",
              types: ["function(self, handle, time_elapsed)"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function delay(callback: (self: unknown, handle: unknown, time_elapsed: unknown) => void): void;",
    );
  });

  test("an out-of-scope token still emits unknown — the callback scope boundary holds", () => {
    const module: ApiModule = {
      namespace: "socket",
      brief: "",
      description: "",
      functions: [
        {
          name: "socket.select",
          brief: "",
          description: "",
          parameters: [{ name: "x", doc: "", types: ["any"], isOptional: false }],
          returnValues: [
            { name: "", doc: "", types: ["graphics.BUFFER_TYPE_COLOR"], isOptional: false },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function select(x: unknown): unknown;");
  });

  test("variables emit as const declarations inside the namespace", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [],
      variables: [{ name: "thing.PI", brief: "", description: "", types: ["number"] }],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("const PI: number;");
  });

  test("a CONSTANT emits a branded const sorted with the other members", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [{ name: "ns.FOO", brief: "", description: "" }],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      'const FOO: number & { readonly __brand: "ns.FOO" };',
    );
  });

  test("a param whose types are in-module constant FQNs emits a union of brand types", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.play",
          brief: "",
          description: "",
          parameters: [{ name: "mode", doc: "", types: ["ns.FOO", "ns.BAR"], isOptional: false }],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [
        { name: "ns.FOO", brief: "", description: "" },
        { name: "ns.BAR", brief: "", description: "" },
      ],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      'function play(mode: number & { readonly __brand: "ns.FOO" } | number & { readonly __brand: "ns.BAR" }): void;',
    );
  });

  test("a foreign constant FQN in knownConstantFqns brands the param; one absent still widens", () => {
    const module: ApiModule = {
      namespace: "render",
      brief: "",
      description: "",
      functions: [
        {
          name: "render.use",
          brief: "",
          description: "",
          parameters: [
            {
              name: "known",
              doc: "",
              types: ["graphics.BUFFER_TYPE_COLOR0_BIT"],
              isOptional: false,
            },
            { name: "missing", doc: "", types: ["graphics.NOT_A_REAL_ONE"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module, {
      knownConstantFqns: new Set(["graphics.BUFFER_TYPE_COLOR0_BIT"]),
    });
    expect(out).toContain(
      'function use(known: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" }, missing: unknown): void;',
    );
  });

  test("a param token naming a constant not defined in the module stays unknown", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.play",
          brief: "",
          description: "",
          parameters: [{ name: "mode", doc: "", types: ["other.MISSING"], isOptional: false }],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function play(mode: unknown): void;");
  });

  test("a trailing isOptional param (no nil token) emits name?: T", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.fn",
          brief: "",
          description: "",
          parameters: [
            { name: "a", doc: "", types: ["number"], isOptional: false },
            { name: "b", doc: "", types: ["number"], isOptional: true },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function fn(a: number, b?: number): void;");
  });

  test("a param with a nil token stays optional and nil is stripped from the union", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.fn",
          brief: "",
          description: "",
          parameters: [{ name: "a", doc: "", types: ["number", "nil"], isOptional: false }],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function fn(a?: number): void;");
  });

  test("a doc-optional param followed by a required param stays required", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.fn",
          brief: "",
          description: "",
          parameters: [
            { name: "a", doc: "", types: ["number"], isOptional: true },
            { name: "b", doc: "", types: ["string"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function fn(a: number, b: string): void;");
  });

  test("consecutive trailing optionals all emit ?", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.fn",
          brief: "",
          description: "",
          parameters: [
            { name: "a", doc: "", types: ["number"], isOptional: false },
            { name: "b", doc: "", types: ["number"], isOptional: true },
            { name: "c", doc: "", types: ["number"], isOptional: true },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function fn(a: number, b?: number, c?: number): void;",
    );
  });

  test("a two-return function recovers as a LuaMultiReturn 2-tuple with each slot mapped", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.pair",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            { name: "h", doc: "", types: ["hash"], isOptional: false },
            { name: "n", doc: "", types: ["number"], isOptional: false },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function pair(): LuaMultiReturn<[Hash, number]>;");
  });

  test("a three-return function recovers as a three-element tuple in declaration order", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.triple",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            { name: "a", doc: "", types: ["number"], isOptional: false },
            { name: "b", doc: "", types: ["string"], isOptional: false },
            { name: "c", doc: "", types: ["boolean"], isOptional: false },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function triple(): LuaMultiReturn<[number, string, boolean]>;",
    );
  });

  test("a multi-return slot with no declared types emits unknown in that position", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.partial",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            { name: "a", doc: "", types: [], isOptional: false },
            { name: "b", doc: "", types: ["number"], isOptional: false },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function partial(): LuaMultiReturn<[unknown, number]>;",
    );
  });

  test("a single-return function is unchanged — no LuaMultiReturn wrapper and no TODO marker", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.one",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [{ name: "r", doc: "", types: ["number"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function one(): number;");
    expect(out).not.toContain("LuaMultiReturn");
    expect(out).not.toContain("TODO multi-return");
  });

  test("a module with PROPERTY elements emits a sorted interface properties block", () => {
    const module: ApiModule = {
      namespace: "label",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [
        { name: "size", types: ["vector3"], brief: "", description: "" },
        { name: "color", types: ["vector4"], brief: "", description: "" },
      ],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("  interface properties {");
    expect(out).toContain("    color: Vector4;");
    expect(out).toContain("    size: Vector3;");
    expect(out.indexOf("color: Vector4")).toBeLessThan(out.indexOf("size: Vector3"));
  });

  test("a PROPERTY with multiple types emits a union member", () => {
    const module: ApiModule = {
      namespace: "label",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [{ name: "scale", types: ["number", "vector3"], brief: "", description: "" }],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("    scale: number | Vector3;");
  });

  test("a module with no PROPERTY elements emits no interface properties block", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).not.toContain("interface properties");
  });

  test("a non-identifier property name emits as a quoted key, not dropped", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [{ name: "some.dotted", types: ["number"], brief: "", description: "" }],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain('    "some.dotted": number;');
  });

  test("a TYPEDEF emits a per-namespace Opaque type alias, sorted by name", () => {
    const module: ApiModule = {
      namespace: "render",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [{ name: "render_target" }, { name: "constant_buffer" }],
    };
    const out = emitDeclarations(module);
    expect(out).toContain('  type render_target = Opaque<"render_target">;');
    expect(out).toContain('  type constant_buffer = Opaque<"constant_buffer">;');
    expect(out.indexOf("constant_buffer")).toBeLessThan(out.indexOf("render_target"));
  });

  test("a module with no TYPEDEF elements emits no type alias lines", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).not.toContain("type ");
  });

  test("a TYPEDEF whose name is not a valid TS identifier is not emitted", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [{ name: "bad.name" }],
    };
    const out = emitDeclarations(module);
    expect(out).not.toContain("type ");
    expect(out).not.toContain("bad.name");
  });

  test("a table return whose doc carries a <dl> field list emits an inline object type", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.get_info",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "info",
              doc: 'table with fields:\n<dl>\n<dt><code>a</code></dt>\n<dd><span class="type">string</span> the a field</dd>\n<dt><code>b</code></dt>\n<dd><span class="type">number</span> the b field</dd>\n</dl>',
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain("function get_info(): { a: string; b: number };");
  });

  test("a recovered table param emits optional fields (input option-bag)", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.load",
          brief: "",
          description: "",
          parameters: [
            {
              name: "options",
              doc: 'an optional options table:\n<dl>\n<dt><code>premultiply_alpha</code></dt>\n<dd><span class="type">boolean</span> premultiply</dd>\n<dt><code>flip_vertically</code></dt>\n<dd><span class="type">boolean</span> flip</dd>\n</dl>',
              types: ["table"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function load(options: { premultiply_alpha?: boolean; flip_vertically?: boolean }): void;",
    );
  });

  test("sys.get_sys_info options recover dash-list fields", () => {
    const module = parseDefoldApiDoc(sysDoc);
    expect(emitDeclarations(module)).toContain(
      "function get_sys_info(options?: { ignore_secure?: boolean }): { device_model: string; manufacturer: string; system_name: string; system_version: string; api_version: string; language: string; device_language: string; territory: string; gmt_offset: number; device_ident: string; user_agent: string };",
    );
  });

  test("sys.open_url recovers the code-dash target attribute", () => {
    const module = parseDefoldApiDoc(sysDoc);
    expect(emitDeclarations(module)).toContain(
      "function open_url(url: string, attributes?: { target?: string }): boolean;",
    );
  });

  test("a bare table slot with no <dl> still emits Record", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.opaque",
          brief: "",
          description: "",
          parameters: [
            { name: "t", doc: "an opaque key-value map", types: ["table"], isOptional: false },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function opaque(t: Record<string | number, unknown>): void;",
    );
  });

  test("a <dl> field typed table maps to Record (no recursion); a field typed int maps to number", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.desc",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "d",
              doc: 'table:\n<dl>\n<dt><code>nested</code></dt>\n<dd><span class="type">table</span> inner table</dd>\n<dt><code>count</code></dt>\n<dd><span class="type">int</span> a count</dd>\n</dl>',
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function desc(): { nested: Record<string | number, unknown>; count: number };",
    );
  });

  test("a recovered <ul> type-code table param emits optional fields", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.request",
          brief: "",
          description: "",
          parameters: [
            {
              name: "options",
              doc: 'request parameters:\n<ul>\n<li><span class="type">number</span> <code>timeout</code>: secs</li>\n<li><span class="type">string</span> <code>path</code>: where</li>\n</ul>',
              types: ["table"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function request(options: { timeout?: number; path?: string }): void;",
    );
  });

  test("a single table return field followed by a <ul> emits a nested inline object", () => {
    const module: ApiModule = {
      namespace: "window",
      brief: "",
      description: "",
      functions: [
        {
          name: "window.get_safe_area",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "safe_area",
              doc: 'safe area data\n<dl>\n<dt><code>safe_area</code></dt>\n<dd><span class="type">table</span> table containing these keys:</dd>\n</dl>\n<ul>\n<li><span class="type">number</span> <code>x</code></li>\n<li><span class="type">number</span> <code>y</code></li>\n<li><span class="type">number</span> <code>inset_top</code></li>\n</ul>',
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toContain(
      "function get_safe_area(): { safe_area: { x: number; y: number; inset_top: number } };",
    );
  });

  test("a flattened multi-table option bag emits nested inline objects without duplicate top-level keys", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    expect(out).toContain(
      'function create_atlas(path: string, table: { texture?: string | Hash; animations?: { id?: string; width?: number; height?: number; frame_start?: number; frame_end?: number; playback?: Opaque<"constant">; fps?: number; flip_vertical?: boolean; flip_horizontal?: boolean }[]; geometries?: { id?: string; width?: number; height?: number; pivot_x?: number; pivot_y?: number; rotated?: boolean }[]; vertices?: number[]; uvs?: number[]; indices?: number[] }): Hash;',
    );
    const createAtlasLine = out.split("\n").find((line) => line.includes("function create_atlas"));
    expect(createAtlasLine?.match(/ id\?:/g)).toHaveLength(2);
    expect(createAtlasLine?.match(/ width\?:/g)).toHaveLength(2);
    expect(createAtlasLine?.match(/ height\?:/g)).toHaveLength(2);
  });

  test("emits 'a list of' atlas table fields as arrays while opaque list fields stay Record", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    const createLine = out.split("\n").find((l) => l.includes("function create_atlas")) ?? "";
    expect(createLine).toContain("flip_horizontal?: boolean }[]");
    expect(createLine).toContain("rotated?: boolean }[]");
    const getLine = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(getLine).toContain("flip_horizontal: boolean }[]");
    expect(getLine).toContain("geometries: Record<string | number, unknown>");
    const setLine = out.split("\n").find((l) => l.includes("function set_atlas(")) ?? "";
    expect(setLine).toContain("flip_horizontal?: boolean }[]");
    expect(setLine).toContain("geometries?: Record<string | number, unknown>");
  });

  test("a reserved-name function emits an internal _name plus an export alias", () => {
    const module: ApiModule = {
      namespace: "go",
      brief: "",
      description: "",
      functions: [
        {
          name: "go.delete",
          brief: "",
          description: "",
          parameters: [{ name: "id", doc: "", types: ["string"], isOptional: true }],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function _delete(id?: string): void;");
    expect(out).toContain("export { _delete as delete };");
    expect(out).not.toContain("function delete(");
  });

  test("a reserved-name variable emits an internal _name plus an export alias", () => {
    const module: ApiModule = {
      namespace: "json",
      brief: "",
      description: "",
      functions: [],
      variables: [{ name: "json.null", brief: "", description: "", types: [] }],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("const _null: unknown;");
    expect(out).toContain("export { _null as null };");
    expect(out).not.toContain("const null:");
  });

  test("a non-reserved function and variable emit unchanged — no _ prefix, no export alias", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.run",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [],
        },
      ],
      variables: [{ name: "ns.PI", brief: "", description: "", types: ["number"] }],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function run(): void;");
    expect(out).toContain("const PI: number;");
    expect(out).not.toContain("_run");
    expect(out).not.toContain("_PI");
    expect(out).not.toContain("export {");
  });

  test("emits physics.set_shape's cross-referenced data param as an inline object, not Record", () => {
    const module = parseDefoldApiDoc(physicsDoc);
    const out = emitDeclarations(module);
    const line = out.split("\n").find((l) => l.includes("function set_shape(")) ?? "";
    expect(line).toContain("type?: number");
    expect(line).not.toContain("Record<");
  });

  test("vmath emit matches the committed snapshot", () => {
    const module = parseDefoldApiDoc(vmathDoc);
    const out = emitDeclarations(module);
    expect(out).toMatchSnapshot();
  });
});

function jsdocBefore(out: string, fnSignature: string): string {
  const lines = out.split("\n");
  const idx = lines.findIndex((line) => line.includes(fnSignature));
  if (idx === -1) throw new Error(`missing ${fnSignature}`);
  const block: string[] = [];
  for (let i = idx - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line === undefined) break;
    block.unshift(line);
    if (line.trim().startsWith("/**")) break;
  }
  return block.join("\n");
}

describe("function JSDoc emission", () => {
  test("go.get_position emits a JSDoc block with its summary and @param id doc", () => {
    const module = parseDefoldApiDoc(goDoc);
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "function get_position(");
    expect(block.startsWith("  /**")).toBe(true);
    expect(block).toContain(" * The position is relative the parent");
    expect(block).toContain(
      " * @param id - optional id of the game object instance to get the position for, by default the instance of the calling script",
    );
  });

  test("a function with a single documented return emits @returns with the rendered doc", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [
        {
          name: "ns.measure",
          brief: "measure something",
          description: "",
          parameters: [],
          returnValues: [{ name: "size", doc: "the measured size", types: ["number"] }].map(
            (r) => ({
              ...r,
              isOptional: false,
            }),
          ),
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "function measure(");
    expect(block).toContain(" * @returns the measured size");
  });

  test("a reserved-name function emits its JSDoc on the internal _name declaration", () => {
    const module: ApiModule = {
      namespace: "go",
      brief: "",
      description: "",
      functions: [
        {
          name: "go.delete",
          brief: "",
          description: "deletes a game object instance",
          parameters: [
            { name: "id", doc: "the instance to delete", types: ["string"], isOptional: true },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "function _delete(");
    expect(block.startsWith("  /**")).toBe(true);
    expect(block).toContain(" * deletes a game object instance");
    expect(block).toContain(" * @param id - the instance to delete");
    expect(out).toContain("export { _delete as delete };");
  });

  test("an undocumented function emits no comment — byte-identical to the pre-change line", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [{ name: "ns.run", brief: "", description: "", parameters: [], returnValues: [] }],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toBe("declare namespace ns {\n  function run(): void;\n}\n");
  });

  test("HTML in a description is rendered — no raw <code>/<a> tags survive", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: 'Uses <code>go.set</code> and <a href="/ref/go">go</a> to apply.',
      functions: [
        {
          name: "ns.apply",
          brief: "",
          description: 'Uses <code>go.set</code> and <a href="/ref/go">go</a> to apply.',
          parameters: [],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "function apply(");
    expect(block).toContain(" * Uses `go.set` and go to apply.");
    expect(out).not.toContain("<code>");
    expect(out).not.toContain("<a ");
  });
});

describe("constant, variable, and property JSDoc emission", () => {
  test("a documented constant emits a summary JSDoc block before its const line", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [
        { name: "ns.FOO", brief: "the foo flag", description: "Enables the foo behaviour." },
      ],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "const FOO:");
    expect(block.startsWith("  /**")).toBe(true);
    expect(block).toContain(" * Enables the foo behaviour.");
  });

  test("a documented variable emits its summary block", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "pi",
      description: "",
      functions: [],
      variables: [
        { name: "ns.PI", brief: "pi", description: "The ratio of a circle's circumference." },
      ].map((v) => ({ ...v, types: ["number"] })),
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "const PI:");
    expect(block.startsWith("  /**")).toBe(true);
    expect(block).toContain(" * The ratio of a circle's circumference.");
  });

  test("a reserved-name variable documents the _name declaration the alias re-exports", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [
        { name: "ns.default", brief: "", description: "The default value.", types: ["number"] },
      ],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "const _default:");
    expect(block.startsWith("  /**")).toBe(true);
    expect(block).toContain(" * The default value.");
    expect(out).toContain("export { _default as default };");
  });

  test("a documented property member emits a summary block before its member line", () => {
    const module: ApiModule = {
      namespace: "label",
      brief: "",
      description: "",
      functions: [],
      variables: [],
      constants: [],
      properties: [
        {
          name: "color",
          types: ["vector4"],
          brief: '<span class="type">vector4</span> label color',
          description: "The color of the label.",
        },
      ],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "color: Vector4");
    expect(block.startsWith("    /**")).toBe(true);
    expect(block).toContain("     * The color of the label.");
  });

  test("an undocumented constant, variable, and property emit no comment — byte-identical", () => {
    const module: ApiModule = {
      namespace: "ns",
      brief: "",
      description: "",
      functions: [],
      variables: [{ name: "ns.PI", brief: "", description: "", types: ["number"] }],
      constants: [{ name: "ns.FOO", brief: "", description: "" }],
      properties: [{ name: "color", types: ["vector4"], brief: "", description: "" }],
      typedefs: [],
    };
    expect(emitDeclarations(module)).toBe(
      "declare namespace ns {\n" +
        '  const FOO: number & { readonly __brand: "ns.FOO" };\n' +
        "  const PI: number;\n" +
        "  interface properties {\n" +
        "    color: Vector4;\n" +
        "  }\n" +
        "}\n",
    );
  });
});

describe("parseTableFields", () => {
  test("returns the ordered fields for a <dl> field-list doc", () => {
    const doc =
      'table with information in the following fields:\n<dl>\n<dt><code>device_model</code></dt>\n<dd><span class="type">string</span> Only on iOS and Android.</dd>\n<dt><code>gmt_offset</code></dt>\n<dd><span class="type">number</span> Offset from GMT.</dd>\n</dl>';
    expect(parseTableFields(doc)).toEqual([
      { name: "device_model", types: ["string"] },
      { name: "gmt_offset", types: ["number"] },
    ]);
  });

  test("returns null for a doc with no <dl> field list", () => {
    expect(parseTableFields("optional options table, an opaque key-value map")).toBeNull();
  });

  test("returns the ordered fields for a <ul> type-code field list (type before name)", () => {
    const doc =
      'request parameters:\n<ul>\n<li><span class="type">number</span> <code>timeout</code>: timeout in seconds</li>\n<li><span class="type">hash | string</span> <code>id</code>: an id</li>\n</ul>';
    expect(parseTableFields(doc)).toEqual([
      { name: "timeout", types: ["number"] },
      { name: "id", types: ["hash", "string"] },
    ]);
  });

  test("prefers the <dl> field list when a doc carries both <dl> and <ul>", () => {
    const doc =
      'table:\n<dl>\n<dt><code>from_dl</code></dt>\n<dd><span class="type">string</span> a field</dd>\n</dl>\n<ul>\n<li><span class="type">number</span> <code>from_ul</code>: ignored</li>\n</ul>';
    expect(parseTableFields(doc)).toEqual([{ name: "from_dl", types: ["string"] }]);
  });

  test("returns null for a <ul> whose items carry no typed fields", () => {
    const doc =
      "buffer types:\n<ul>\n<li><code>graphics.BUFFER_TYPE_COLOR0</code></li>\n<li><code>graphics.BUFFER_TYPE_DEPTH</code></li>\n</ul>";
    expect(parseTableFields(doc)).toBeNull();
  });

  test("attaches a nested fields list for a single table field followed by a <ul>", () => {
    const doc =
      'safe area data\n<dl>\n<dt><code>safe_area</code></dt>\n<dd><span class="type">table</span> table containing these keys:</dd>\n</dl>\n<ul>\n<li><span class="type">number</span> <code>x</code></li>\n<li><span class="type">number</span> <code>y</code></li>\n<li><span class="type">number</span> <code>width</code></li>\n<li><span class="type">number</span> <code>height</code></li>\n<li><span class="type">number</span> <code>inset_left</code></li>\n<li><span class="type">number</span> <code>inset_top</code></li>\n<li><span class="type">number</span> <code>inset_right</code></li>\n<li><span class="type">number</span> <code>inset_bottom</code></li>\n</ul>';
    expect(parseTableFields(doc)).toEqual([
      {
        name: "safe_area",
        types: ["table"],
        fields: [
          { name: "x", types: ["number"] },
          { name: "y", types: ["number"] },
          { name: "width", types: ["number"] },
          { name: "height", types: ["number"] },
          { name: "inset_left", types: ["number"] },
          { name: "inset_top", types: ["number"] },
          { name: "inset_right", types: ["number"] },
          { name: "inset_bottom", types: ["number"] },
        ],
      },
    ]);
  });

  test("a plain <dl> with no trailing <ul> returns flat fields with no nested key", () => {
    const doc =
      'table:\n<dl>\n<dt><code>device_model</code></dt>\n<dd><span class="type">string</span> device.</dd>\n</dl>';
    expect(parseTableFields(doc)).toEqual([{ name: "device_model", types: ["string"] }]);
  });

  test("does not attach a trailing <ul> when the <dl> yields two fields", () => {
    const doc =
      'table:\n<dl>\n<dt><code>first</code></dt>\n<dd><span class="type">table</span> a table</dd>\n<dt><code>second</code></dt>\n<dd><span class="type">table</span> a table</dd>\n</dl>\n<ul>\n<li><span class="type">number</span> <code>x</code></li>\n</ul>';
    expect(parseTableFields(doc)).toEqual([
      { name: "first", types: ["table"] },
      { name: "second", types: ["table"] },
    ]);
  });

  test("recovers dash-list name-before-type fields from real go.get options", () => {
    const module = parseDefoldApiDoc(goDoc);
    const doc = requireFunction(module, "go.get").parameters[2]?.doc ?? "";
    expect(parseTableFields(doc)).toEqual([
      { name: "index", types: ["number"] },
      { name: "key", types: ["hash"] },
      { name: "keys", types: ["table"] },
    ]);
  });

  test("recovers dash-list code-name-before-type fields from real gui.set options", () => {
    const module = parseDefoldApiDoc(guiDoc);
    const doc = requireFunction(module, "gui.set").parameters[3]?.doc ?? "";
    expect(parseTableFields(doc)).toEqual([
      { name: "index", types: ["number"] },
      { name: "key", types: ["hash"] },
    ]);
  });

  test("recovers a code-dash typed field from the real sys.open_url attributes doc", () => {
    const module = parseDefoldApiDoc(sysDoc);
    const doc = requireFunction(module, "sys.open_url").parameters[1]?.doc ?? "";
    expect(parseTableFields(doc)).toEqual([{ name: "target", types: ["string"] }]);
  });

  test("returns null for a code-dash value list that carries no type span", () => {
    const doc =
      "table with attributes\n- <code>_self</code> - URL replaces the current page.\n- <code>_blank</code> - URL is loaded into a new window.";
    expect(parseTableFields(doc)).toBeNull();
  });

  test("groups the flattened resource atlas option bag under table headers", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const doc = requireFunction(module, "resource.create_atlas").parameters[1]?.doc ?? "";
    expect(parseTableFields(doc)).toEqual([
      { name: "texture", types: ["string", "hash"] },
      {
        name: "animations",
        types: ["table"],
        isList: true,
        fields: [
          { name: "id", types: ["string"] },
          { name: "width", types: ["number"] },
          { name: "height", types: ["number"] },
          { name: "frame_start", types: ["number"] },
          { name: "frame_end", types: ["number"] },
          { name: "playback", types: ["constant"] },
          { name: "fps", types: ["number"] },
          { name: "flip_vertical", types: ["boolean"] },
          { name: "flip_horizontal", types: ["boolean"] },
        ],
      },
      {
        name: "geometries",
        types: ["table"],
        isList: true,
        fields: [
          { name: "id", types: ["string"] },
          { name: "width", types: ["number"] },
          { name: "height", types: ["number"] },
          { name: "pivot_x", types: ["number"] },
          { name: "pivot_y", types: ["number"] },
          { name: "rotated", types: ["boolean"] },
        ],
      },
      { name: "vertices", types: ["table"], isList: true, numberList: true },
      { name: "uvs", types: ["table"], isList: true, numberList: true },
      { name: "indices", types: ["table"], isList: true, numberList: true },
    ]);
  });

  test("marks a table field whose dd prose reads 'a list of' as a list, others unmarked", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const doc = requireFunction(module, "resource.create_atlas").parameters[1]?.doc ?? "";
    const fields = parseTableFields(doc) ?? [];
    const byName = (name: string) => fields.find((f) => f.name === name);
    expect(byName("animations")?.isList).toBe(true);
    expect(byName("geometries")?.isList).toBe(true);
    expect(byName("texture")?.isList).toBeUndefined();
  });

  test("does not mark a table field whose dd prose lacks 'a list of'", () => {
    const doc =
      'options\n<dl>\n<dt><code>safe_area</code></dt>\n<dd><span class="type">table</span> table containing the screen safe area</dd>\n</dl>';
    const fields = parseTableFields(doc) ?? [];
    expect(fields[0]?.name).toBe("safe_area");
    expect(fields[0]?.isList).toBeUndefined();
  });
});

describe("inlineTableType list arrays", () => {
  const identity = (t: string): string => t;

  test("emits a list field with recovered members as an array of the element shape", () => {
    const out = inlineTableType(
      [
        {
          name: "items",
          types: ["table"],
          isList: true,
          fields: [{ name: "id", types: ["string"] }],
        },
      ],
      identity,
      false,
    );
    expect(out).toBe("{ items: { id: string }[] }");
  });

  test("leaves a list field with no recovered members unchanged — no stray []", () => {
    const out = inlineTableType(
      [{ name: "items", types: ["table"], isList: true }],
      identity,
      false,
    );
    expect(out).toBe("{ items: table }");
    expect(out).not.toContain("[]");
  });

  test("a non-list field with recovered members stays a single object", () => {
    const out = inlineTableType(
      [
        {
          name: "items",
          types: ["table"],
          fields: [{ name: "id", types: ["string"] }],
        },
      ],
      identity,
      false,
    );
    expect(out).toBe("{ items: { id: string } }");
  });
});

describe("number-list table-field recovery", () => {
  const identity = (t: string): string => t;

  test("marks vertices/uvs/indices as numberList; recovered-shape list fields are not", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const doc = requireFunction(module, "resource.create_atlas").parameters[1]?.doc ?? "";
    const fields = parseTableFields(doc) ?? [];
    const byName = (name: string) => fields.find((f) => f.name === name);
    expect(byName("vertices")?.numberList).toBe(true);
    expect(byName("uvs")?.numberList).toBe(true);
    expect(byName("indices")?.numberList).toBe(true);
    expect(byName("animations")?.numberList).toBeUndefined();
    expect(byName("geometries")?.numberList).toBeUndefined();
  });

  test("does not mark a 'a list of' table field whose brace form is not flat-numeric", () => {
    const quoted =
      'options\n<dl>\n<dt><code>letters</code></dt>\n<dd><span class="type">table</span> a list of letters in the form { "a", "b" }</dd>\n</dl>';
    const quotedFields = parseTableFields(quoted) ?? [];
    expect(quotedFields[0]?.isList).toBe(true);
    expect(quotedFields[0]?.numberList).toBeUndefined();

    const idents =
      'options\n<dl>\n<dt><code>names</code></dt>\n<dd><span class="type">table</span> a list of names in the form {foo, bar}</dd>\n</dl>';
    const identFields = parseTableFields(idents) ?? [];
    expect(identFields[0]?.isList).toBe(true);
    expect(identFields[0]?.numberList).toBeUndefined();
  });

  test("emits a numberList field with no members as number[]", () => {
    const out = inlineTableType(
      [{ name: "vertices", types: ["table"], isList: true, numberList: true }],
      identity,
      false,
    );
    expect(out).toBe("{ vertices: number[] }");
  });

  test("a list field with recovered members still emits the element object array, not number[]", () => {
    const out = inlineTableType(
      [
        {
          name: "items",
          types: ["table"],
          isList: true,
          fields: [{ name: "id", types: ["string"] }],
        },
      ],
      identity,
      false,
    );
    expect(out).toBe("{ items: { id: string }[] }");
    expect(out).not.toContain("number[]");
  });

  test("a non-list table field with no members stays its token mapping — no stray number[]", () => {
    const out = inlineTableType([{ name: "opaque", types: ["table"] }], identity, false);
    expect(out).toBe("{ opaque: table }");
    expect(out).not.toContain("number[]");
  });

  test("emits create_atlas/set_atlas number-lists as number[] while geometries stays Record", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    const createLine = out.split("\n").find((l) => l.includes("function create_atlas")) ?? "";
    expect(createLine).toContain("vertices?: number[]");
    expect(createLine).toContain("uvs?: number[]");
    expect(createLine).toContain("indices?: number[]");
    const setLine = out.split("\n").find((l) => l.includes("function set_atlas(")) ?? "";
    expect(setLine).toContain("vertices?: number[]");
    expect(setLine).toContain("uvs?: number[]");
    expect(setLine).toContain("indices?: number[]");
    expect(setLine).toContain("geometries?: Record<string | number, unknown>");
    const getLine = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(getLine).toContain("geometries: Record<string | number, unknown>");
  });
});

describe("cross-reference table-field recovery", () => {
  const physicsModule = parseDefoldApiDoc(physicsDoc);
  const setShapeDoc = requireFunction(physicsModule, "physics.set_shape").parameters[2]?.doc ?? "";
  const getShapeDoc =
    requireFunction(physicsModule, "physics.get_shape").returnValues[0]?.doc ?? "";
  const physicsResolver = buildTableDocResolver(
    physicsModule.functions.map((fn) => ({
      name: fn.name,
      slots: [...fn.parameters, ...fn.returnValues],
    })),
  );

  test("returns null for the cross-ref-only set_shape doc when no resolver is passed", () => {
    expect(parseTableFields(setShapeDoc)).toBeNull();
  });

  test("adopts the referenced element's fields when a resolver resolves the anchor", () => {
    expect(parseTableFields(setShapeDoc, physicsResolver)).toEqual(parseTableFields(getShapeDoc));
  });

  test("ignores the resolver when the direct parsers already recover fields", () => {
    let consulted = false;
    const spy = (name: string): string | undefined => {
      consulted = true;
      return physicsResolver(name);
    };
    expect(parseTableFields(getShapeDoc, spy)).toEqual(parseTableFields(getShapeDoc));
    expect(consulted).toBe(false);
  });

  test("resolves at most one hop — a referenced cross-ref-only doc recovers nothing", () => {
    const docA = 'See <a href="/ref/test#test.b">test.b</a> for the fields.';
    const docB = 'See <a href="/ref/test#test.c">test.c</a> for the fields.';
    const resolver = (name: string): string | undefined => (name === "test.b" ? docB : undefined);
    expect(parseTableFields(docA, resolver)).toBeNull();
  });
});

describe("supplementary cross-reference table-field recovery", () => {
  const resourceModule = parseDefoldApiDoc(resourceDoc);
  const getAtlasDoc =
    requireFunction(resourceModule, "resource.get_atlas").returnValues[0]?.doc ?? "";
  const setAtlasDoc =
    requireFunction(resourceModule, "resource.set_atlas").parameters[1]?.doc ?? "";
  const resourceResolver = buildTableDocResolver(
    resourceModule.functions.map((fn) => ({
      name: fn.name,
      slots: [...fn.parameters, ...fn.returnValues],
    })),
  );

  test("returns null for the untyped-name-list get_atlas doc when no resolver is passed", () => {
    expect(parseTableFields(getAtlasDoc)).toBeNull();
  });

  test("adopts the referenced element's fields filtered to the own <ul> names", () => {
    const resolved = parseTableFields(setAtlasDoc);
    if (resolved === null) throw new Error("expected set_atlas to recover fields");
    const own = new Set(["texture", "geometries", "animations"]);
    const expected = resolved.filter((field) => own.has(field.name));
    const recovered = parseTableFields(getAtlasDoc, resourceResolver);
    expect(recovered).toEqual(expected);
    expect(recovered?.map((field) => field.name)).toEqual(["texture", "animations", "geometries"]);
  });

  test("filters out the sibling's unlisted fields (vertices/uvs/indices)", () => {
    const recovered = parseTableFields(getAtlasDoc, resourceResolver) ?? [];
    const names = recovered.map((field) => field.name);
    expect(names).not.toContain("vertices");
    expect(names).not.toContain("uvs");
    expect(names).not.toContain("indices");
  });

  test("a typed own field list beside a See anchor wins and ignores the resolver", () => {
    const doc =
      '<dl><dt><code>from_dl</code></dt><dd><span class="type">string</span> x</dd></dl> ' +
      'See <a href="/ref/test#test.other">test.other</a> for a description.';
    let consulted = false;
    const spy = (name: string): string | undefined => {
      consulted = true;
      return resourceResolver(name);
    };
    expect(parseTableFields(doc, spy)).toEqual([{ name: "from_dl", types: ["string"] }]);
    expect(consulted).toBe(false);
  });

  test("resolves at most one hop — a referenced cross-ref-only doc recovers nothing", () => {
    const docA =
      'A table:\n<ul>\n<li>alpha</li>\n<li>beta</li>\n</ul>\nSee <a href="/ref/test#test.b">test.b</a>.';
    const docB = 'See <a href="/ref/test#test.c">test.c</a> for the fields.';
    const resolver = (name: string): string | undefined => (name === "test.b" ? docB : undefined);
    expect(parseTableFields(docA, resolver)).toBeNull();
  });

  test("emits get_atlas's return as the inline object adopted from set_atlas, not Record", () => {
    const out = emitDeclarations(resourceModule);
    const line = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(line).toContain(
      'function get_atlas(path: Hash | string): { texture: string | Hash; animations: { id: string; width: number; height: number; frame_start: number; frame_end: number; playback: Opaque<"constant">; fps: number; flip_vertical: boolean; flip_horizontal: boolean }[]; geometries: Record<string | number, unknown> };',
    );
    expect(line).not.toContain("vertices");
  });
});

describe("recoverCallbackSignature", () => {
  test("recovers a named-parameter callback to a typed function", () => {
    expect(recoverCallbackSignature("function(self, url, result)")).toBe(
      "(self: unknown, url: unknown, result: unknown) => void",
    );
  });

  test("recovers a zero-parameter callback", () => {
    expect(recoverCallbackSignature("function()")).toBe("() => void");
  });

  test("names a non-identifier parameter positionally", () => {
    expect(recoverCallbackSignature("function(function())")).toBe("(arg0: unknown) => void");
  });

  test("returns null for non-callback tokens (scope boundary)", () => {
    expect(recoverCallbackSignature("node")).toBeNull();
    expect(recoverCallbackSignature("any")).toBeNull();
  });
});

describe("ARBITRARY_TABLE_SLOTS", () => {
  test("holds exactly the serialization/JSON passthrough element names", () => {
    expect([...ARBITRARY_TABLE_SLOTS].sort()).toEqual([
      "json.decode",
      "json.encode",
      "sys.deserialize",
      "sys.load",
      "sys.save",
      "sys.serialize",
    ]);
  });
});

describe("MAPPING_TABLE_SLOTS", () => {
  test("maps the three gui mapping-table returns to their curated key/value token pairs", () => {
    expect(MAPPING_TABLE_SLOTS.get("gui.clone_tree")).toEqual({ key: "hash", value: "node" });
    expect(MAPPING_TABLE_SLOTS.get("gui.get_tree")).toEqual({ key: "hash", value: "node" });
    expect(MAPPING_TABLE_SLOTS.get("gui.get_layouts")).toEqual({ key: "hash", value: "vector3" });
    expect(MAPPING_TABLE_SLOTS.size).toBe(3);
  });

  function guiModule(functions: ApiFunction[]): ApiModule {
    return {
      namespace: "gui",
      brief: "",
      description: "",
      functions,
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
  }

  test('clone_tree/get_tree emit LuaMap<Hash, Opaque<"node">>; get_layouts emits LuaMap<Hash, Vector3>', () => {
    const out = emitDeclarations(
      guiModule([
        {
          name: "gui.clone_tree",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "clones",
              doc: "a table mapping node ids to the corresponding cloned nodes",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
        {
          name: "gui.get_tree",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "clones",
              doc: "a table mapping node ids to the corresponding nodes",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
        {
          name: "gui.get_layouts",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "",
              doc: "layout_id_hash -&gt; vmath.vector3(width, height, 0)",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain('function clone_tree(): LuaMap<Hash, Opaque<"node">>;');
    expect(out).toContain('function get_tree(): LuaMap<Hash, Opaque<"node">>;');
    expect(out).toContain("function get_layouts(): LuaMap<Hash, Vector3>;");
  });

  test("a table return on an element absent from MAPPING_TABLE_SLOTS still emits Record", () => {
    const out = emitDeclarations(
      guiModule([
        {
          name: "gui.get_unmapped",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "t",
              doc: "a table mapping node ids to the corresponding nodes",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("function get_unmapped(): Record<string | number, unknown>;");
  });
});

describe("HOMOGENEOUS_ARRAY_SLOTS", () => {
  test("maps the four primitive slots unchanged and adds the two id-array slots", () => {
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("buffer.set_metadata")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("buffer.get_metadata")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("vmath.vector")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("sound.get_groups")).toBe("hash");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("iap.list")).toBe("string");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("go.delete")).toEqual(["string", "hash", "url"]);
    expect(HOMOGENEOUS_ARRAY_SLOTS.size).toBe(6);
  });

  function moduleOf(namespace: string, functions: ApiFunction[]): ApiModule {
    return {
      namespace,
      brief: "",
      description: "",
      functions,
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
  }

  test("set_metadata param and vmath.vector param emit number[]; get_groups return emits Hash[]", () => {
    const out = emitDeclarations(
      moduleOf("buffer", [
        {
          name: "buffer.set_metadata",
          brief: "",
          description: "",
          parameters: [
            {
              name: "values",
              doc: "actual metadata, an array of numeric values",
              types: ["table"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("function set_metadata(values: number[]): void;");

    const vmathOut = emitDeclarations(
      moduleOf("vmath", [
        {
          name: "vmath.vector",
          brief: "",
          description: "",
          parameters: [{ name: "t", doc: "table of numbers", types: ["table"], isOptional: false }],
          returnValues: [],
        },
      ]),
    );
    expect(vmathOut).toContain("function vector(t: number[]): void;");

    const soundOut = emitDeclarations(
      moduleOf("sound", [
        {
          name: "sound.get_groups",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "groups",
              doc: "table of mixer group names",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(soundOut).toContain("function get_groups(): Hash[];");
  });

  test("get_metadata's table | nil return emits the number[] member on the union path", () => {
    const out = emitDeclarations(
      moduleOf("buffer", [
        {
          name: "buffer.get_metadata",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "values",
              doc: "table of metadata values or nil if the entry does not exist",
              types: ["table", "nil"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("number[]");
  });

  test("iap.list emits the ids param as string[]", () => {
    const out = emitDeclarations(
      moduleOf("iap", [
        {
          name: "iap.list",
          brief: "",
          description: "",
          parameters: [
            {
              name: "ids",
              doc: "table (array) of identifiers to get products from",
              types: ["table"],
              isOptional: false,
            },
            { name: "callback", doc: "result callback", types: ["function"], isOptional: false },
          ],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("ids: string[]");
  });

  test("go.delete emits the table union member as (string | Hash | Url)[]", () => {
    const out = emitDeclarations(
      moduleOf("go", [
        {
          name: "go.delete",
          brief: "",
          description: "",
          parameters: [
            {
              name: "id",
              doc: "optional id or table of id's of the instance(s) to delete",
              types: ["string", "hash", "url", "table"],
              isOptional: true,
            },
          ],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("string | Hash | Url | (string | Hash | Url)[]");
  });

  test("a table slot on an element absent from HOMOGENEOUS_ARRAY_SLOTS still emits Record", () => {
    const out = emitDeclarations(
      moduleOf("buffer", [
        {
          name: "buffer.other",
          brief: "",
          description: "",
          parameters: [{ name: "t", doc: "some table", types: ["table"], isOptional: false }],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("function other(t: Record<string | number, unknown>): void;");
  });
});

describe("slot-level array-of-object recovery", () => {
  function moduleOf(namespace: string, functions: ApiFunction[]): ApiModule {
    return {
      namespace,
      brief: "",
      description: "",
      functions,
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
  }

  const fieldList =
    '<dl><dt><code>a</code></dt><dd><span class="type">string</span> a field</dd>' +
    '<dt><code>n</code></dt><dd><span class="type">number</span> n field</dd></dl>';

  test("SLOT_LEVEL_LIST_PROSE matches array/list markers", () => {
    expect(SLOT_LEVEL_LIST_PROSE.test("an array of tables")).toBe(true);
    expect(SLOT_LEVEL_LIST_PROSE.test("a list of things")).toBe(true);
    expect(SLOT_LEVEL_LIST_PROSE.test("a single table")).toBe(false);
  });

  test("array prose before the field list wraps the recovered object in []", () => {
    const out = emitDeclarations(
      moduleOf("demo", [
        {
          name: "demo.f",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "r",
              doc: `an array of tables. ${fieldList}`,
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("function f(): { a: string; n: number }[];");
  });

  test("control: plain slot prose with the identical field list stays unwrapped", () => {
    const out = emitDeclarations(
      moduleOf("demo", [
        {
          name: "demo.f",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            { name: "r", doc: `a single table. ${fieldList}`, types: ["table"], isOptional: false },
          ],
        },
      ]),
    );
    expect(out).toContain("function f(): { a: string; n: number };");
    expect(out).not.toContain("{ a: string; n: number }[]");
  });

  test("scoping guard: a list marker inside a field's <dd> does not wrap the slot", () => {
    const out = emitDeclarations(
      moduleOf("demo", [
        {
          name: "demo.f",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "r",
              doc: '<dl><dt><code>a</code></dt><dd><span class="type">string</span> a list of names</dd></dl>',
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("function f(): { a: string };");
    expect(out).not.toContain("{ a: string }[]");
  });

  test("real sys.get_ifaddrs return emits the field object array", () => {
    const module = parseDefoldApiDoc(sysDoc);
    const out = emitDeclarations(module);
    expect(out).toContain(
      "function get_ifaddrs(): { name: string; address: string; mac: string; up: boolean; running: boolean }[];",
    );
  });
});
