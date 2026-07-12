import { describe, expect, test } from "bun:test";
import bufferDoc from "../fixtures/buffer_doc.json" with { type: "json" };
import collectionfactoryDoc from "../fixtures/collectionfactory_doc.json" with { type: "json" };
import collectionproxyDoc from "../fixtures/collectionproxy_doc.json" with { type: "json" };
import b2dWorldDoc from "../fixtures/defold-1.13.0/b2d_world_doc.json" with { type: "json" };
import computeDoc from "../fixtures/defold-1.13.0/compute_doc.json" with { type: "json" };
import graphicsDoc from "../fixtures/defold-1.13.0/graphics_doc.json" with { type: "json" };
import materialDoc from "../fixtures/defold-1.13.0/material_doc.json" with { type: "json" };
import model113Doc from "../fixtures/defold-1.13.0/model_doc.json" with { type: "json" };
import goDoc from "../fixtures/go_doc.json" with { type: "json" };
import guiDoc from "../fixtures/gui_doc.json" with { type: "json" };
import httpDoc from "../fixtures/http_doc.json" with { type: "json" };
import iapDoc from "../fixtures/iap_doc.json" with { type: "json" };
import liveupdateDoc from "../fixtures/liveupdate_doc.json" with { type: "json" };
import modelDoc from "../fixtures/model_doc.json" with { type: "json" };
import physicsDoc from "../fixtures/physics_doc.json" with { type: "json" };
import profilerDoc from "../fixtures/profiler_doc.json" with { type: "json" };
import pushDoc from "../fixtures/push_doc.json" with { type: "json" };
import renderDoc from "../fixtures/render_doc.json" with { type: "json" };
import resourceDoc from "../fixtures/resource_doc.json" with { type: "json" };
import socketDoc from "../fixtures/socket_doc.json" with { type: "json" };
import sysDoc from "../fixtures/sys_doc.json" with { type: "json" };
import tilemapDoc from "../fixtures/tilemap_doc.json" with { type: "json" };
import typesDoc from "../fixtures/types_doc.json" with { type: "json" };
import vmathDoc from "../fixtures/vmath_doc.json" with { type: "json" };
import { type ApiFunction, type ApiModule, parseDefoldApiDoc } from "./api-doc";
import {
  ARBITRARY_TABLE_SLOTS,
  applyNestedFieldCurations,
  buildTableDocResolver,
  collectHandleMethodGroups,
  emitDeclarations,
  HOMOGENEOUS_ARRAY_SLOTS,
  inlineTableType,
  MAPPING_TABLE_SLOTS,
  NESTED_FIELD_CURATIONS,
  OVERLOAD_COVERED_SKIPS,
  parseTableFields,
  recoverCallbackSignature,
  SLOT_LEVEL_LIST_PROSE,
  TABLE_SLOT_CURATIONS,
} from "./emit-dts";

function requireFunction(module: ApiModule, name: string): ApiFunction {
  const fn = module.functions.find((candidate) => candidate.name === name);
  if (!fn) throw new Error(`missing function ${name}`);
  return fn;
}

describe("emitDeclarations", () => {
  test("module metadata emits namespace JSDoc before the declaration", () => {
    const module = parseDefoldApiDoc(bufferDoc);
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "declare namespace buffer {");
    expect(block.startsWith("/**")).toBe(true);
    expect(block).toContain(" * Functions for manipulating buffers and streams");
    expect(block).not.toContain("(synthesized)");
  });

  test("undocumented module emits a synthesized namespace JSDoc marker", () => {
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
    const out = emitDeclarations(empty);
    const block = jsdocBefore(out, "declare namespace foo {");
    expect(block).toBe("/**\n * (synthesized)\n * Defold `foo` API namespace.\n */");
  });

  test("empty module emits synthesized namespace docs with a trailing newline", () => {
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
    expect(emitDeclarations(empty)).toBe(
      "/**\n" +
        " * (synthesized)\n" +
        " * Defold `foo` API namespace.\n" +
        " */\n" +
        "declare namespace foo {\n" +
        "}\n",
    );
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

  test("a return-type override forces unknown despite empty doc returnvalues", () => {
    const module: ApiModule = {
      namespace: "gui",
      brief: "",
      description: "",
      functions: [
        {
          name: "gui.get",
          brief: "",
          description: "",
          parameters: [
            { name: "node", doc: "", types: ["node"], isOptional: false },
            { name: "property", doc: "", types: ["string"], isOptional: false },
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
    expect(out).toContain('function get(node: Opaque<"node">, property: string): unknown;');
    expect(out).not.toContain('function get(node: Opaque<"node">, property: string): void;');
  });

  test("an empty-returnvalues function not in the override map still emits void", () => {
    const module: ApiModule = {
      namespace: "gui",
      brief: "",
      description: "",
      functions: [
        {
          name: "gui.set",
          brief: "",
          description: "",
          parameters: [
            { name: "node", doc: "", types: ["node"], isOptional: false },
            { name: "property", doc: "", types: ["string"], isOptional: false },
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
    expect(out).toContain('function set(node: Opaque<"node">, property: string): void;');
  });

  test("types.is_* emit as user-defined type guards over core-types", () => {
    const module = parseDefoldApiDoc(typesDoc);
    const out = emitDeclarations(module);
    expect(out).toContain("function is_vector3(var_: unknown): var_ is Vector3;");
    expect(out).toContain("function is_hash(var_: unknown): var_ is Hash;");
    expect(out).toContain("function is_quat(var_: unknown): var_ is Quaternion;");
    expect(out).not.toContain(": boolean;");
  });

  test("a single-arg boolean function not in TYPE_PREDICATES still emits boolean", () => {
    const module: ApiModule = {
      namespace: "types",
      brief: "",
      description: "",
      functions: [
        {
          name: "types.is_frob",
          brief: "",
          description: "",
          parameters: [{ name: "var_", doc: "", types: [], isOptional: false }],
          returnValues: [{ name: "", doc: "", types: ["boolean"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function is_frob(var_: unknown): boolean;");
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

  test("window.set_listener's callback is curated with a typed event union and record data", () => {
    const module: ApiModule = {
      namespace: "window",
      brief: "",
      description: "",
      functions: [
        {
          name: "window.set_listener",
          brief: "",
          description: "",
          parameters: [
            {
              name: "callback",
              doc: "",
              types: ["function(self, event, data)"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
        {
          name: "window.other",
          brief: "",
          description: "",
          parameters: [
            {
              name: "callback",
              doc: "",
              types: ["function(self, event, data)"],
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
    const out = emitDeclarations(module);
    expect(out).toContain(
      "function set_listener(callback: (self: unknown, event: typeof WINDOW_EVENT_FOCUS_LOST | typeof WINDOW_EVENT_FOCUS_GAINED | typeof WINDOW_EVENT_RESIZED | typeof WINDOW_EVENT_ICONFIED | typeof WINDOW_EVENT_DEICONIFIED, data: Record<string | number, unknown>) => void): void;",
    );
    // A non-keyed callback param still widens to the recoverCallbackSignature form.
    expect(out).toContain(
      "function other(callback: (self: unknown, event: unknown, data: unknown) => void): void;",
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

  test("a doc-optional param followed by a required param emits | undefined", () => {
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
    expect(emitDeclarations(module)).toContain(
      "function fn(a: number | undefined, b: string): void;",
    );
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

  test("emits 'a list of' atlas table fields as arrays while geometries recovers a nested array", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    const createLine = out.split("\n").find((l) => l.includes("function create_atlas")) ?? "";
    expect(createLine).toContain("flip_horizontal?: boolean }[]");
    expect(createLine).toContain("rotated?: boolean }[]");
    const getLine = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(getLine).toContain("flip_horizontal: boolean }[]");
    expect(getLine).toContain(
      "geometries: { vertices: number[]; uvs: number[]; indices: number[] }[]",
    );
    expect(getLine).not.toContain("geometries: Record");
    const setLine = out.split("\n").find((l) => l.includes("function set_atlas(")) ?? "";
    expect(setLine).toContain("flip_horizontal?: boolean }[]");
    expect(setLine).toContain(
      "geometries?: { vertices?: number[]; uvs?: number[]; indices?: number[] }[]",
    );
    expect(setLine).not.toContain("geometries?: Record");
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

  test("a reserved-word parameter name takes the trailing-underscore escape", () => {
    const module: ApiModule = {
      namespace: "thing",
      brief: "",
      description: "",
      functions: [
        {
          name: "thing.is_vector3",
          brief: "",
          description: "",
          parameters: [
            { name: "var", doc: "Variable to check type", types: ["any"], isOptional: false },
          ],
          returnValues: [{ name: "", doc: "", types: ["boolean"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("function is_vector3(var_: unknown): boolean;");
    expect(out).not.toContain("var: unknown");
    // the @param tag uses the same emitted name so the hover doc still resolves
    expect(out).toContain("@param var_ - Variable to check type");
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

  test("a function whose fixture carries an example emits a fenced @example block", () => {
    const module = parseDefoldApiDoc(goDoc);
    const out = emitDeclarations(module);
    const block = jsdocBefore(out, "function get_position(");
    expect(block).toContain(" * @example");
    expect(block).toContain(" * ```lua");
    expect(block).toContain(" * local p = go.get_position()");
    expect(block).not.toContain("<span");
    expect(block).not.toContain("class=");
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

  test("an undocumented function emits no member comment beyond namespace docs", () => {
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
    expect(emitDeclarations(module)).toBe(
      "/**\n" +
        " * (synthesized)\n" +
        " * Defold `ns` API namespace.\n" +
        " */\n" +
        "declare namespace ns {\n" +
        "  function run(): void;\n" +
        "}\n",
    );
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

  test("undocumented constants, variables, and properties emit no member comments beyond namespace docs", () => {
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
      "/**\n" +
        " * (synthesized)\n" +
        " * Defold `ns` API namespace.\n" +
        " */\n" +
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

  test("emits create_atlas/set_atlas top-level number-lists as number[] alongside the recovered geometries array", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    const createLine = out.split("\n").find((l) => l.includes("function create_atlas")) ?? "";
    expect(createLine).toContain("vertices?: number[]");
    expect(createLine).toContain("uvs?: number[]");
    expect(createLine).toContain("indices?: number[]");
    const setLine = out.split("\n").find((l) => l.includes("function set_atlas(")) ?? "";
    // The top-level vertices/uvs/indices number-lists stay byte-identical; only
    // the curated geometries field flips from Record to the nested array.
    expect(setLine).toContain(
      "geometries?: { vertices?: number[]; uvs?: number[]; indices?: number[] }[]; vertices?: number[]; uvs?: number[]; indices?: number[] }",
    );
    expect(setLine).not.toContain("geometries?: Record");
    const getLine = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(getLine).toContain(
      "geometries: { vertices: number[]; uvs: number[]; indices: number[] }[]",
    );
    expect(getLine).not.toContain("geometries: Record");
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

  test("emits get_atlas's return as the inline object adopted from set_atlas, with the curated geometries array", () => {
    const out = emitDeclarations(resourceModule);
    const line = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(line).toContain(
      'function get_atlas(path: Hash | string): { texture: string | Hash; animations: { id: string; width: number; height: number; frame_start: number; frame_end: number; playback: Opaque<"constant">; fps: number; flip_vertical: boolean; flip_horizontal: boolean }[]; geometries: { vertices: number[]; uvs: number[]; indices: number[] }[] };',
    );
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

describe("OVERLOAD_COVERED_SKIPS", () => {
  test("is exactly the FQNs served by the hand-written go/msg/vmath overloads, in sort order", () => {
    expect([...OVERLOAD_COVERED_SKIPS].sort()).toEqual([
      "go.get",
      "go.property",
      "go.set",
      "msg.post",
      "msg.url",
      "vmath.clamp",
      "vmath.lerp",
      "vmath.mul_per_elem",
      "vmath.normalize",
      "vmath.slerp",
    ]);
  });
});

describe("ARBITRARY_TABLE_SLOTS", () => {
  test("holds the serialization/JSON passthrough, platform-opaque, runtime-owned passthrough, engine-formatted blob, dead cross-ref, OS-resolver, and engine-built render-target element names", () => {
    expect([...ARBITRARY_TABLE_SLOTS].sort()).toEqual([
      "collectionfactory.create",
      "crash.get_backtrace",
      "crash.get_modules",
      "factory.create",
      "iac.set_listener",
      "json.decode",
      "json.encode",
      "on_message",
      "push.get_all_scheduled",
      "push.get_scheduled",
      "render.render_target",
      "render.set_render_target",
      "socket.dns.getaddrinfo",
      "socket.dns.getnameinfo",
      "socket.dns.tohostname",
      "socket.dns.toip",
      "sys.deserialize",
      "sys.load",
      "sys.save",
      "sys.serialize",
      "webview.open_raw",
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

describe("TABLE_SLOT_CURATIONS", () => {
  test("holds exactly the mixed-slot table recoveries", () => {
    // The exact ordered curation keys. Full per-entry field shapes are validated
    // by the regen byte-compare (test/regen.test.ts) and the fidelity audit
    // (scripts/fidelity-audit.test.ts); this guards that no curation slot is
    // silently added, removed, or reordered. Representative entries are
    // spot-checked structurally below, one per curation kind the promoted 1.13.0
    // surface introduced.
    expect([...TABLE_SLOT_CURATIONS.keys()]).toEqual([
      "collectionfactory.create:return:ids",
      "font.get_info:return:info",
      "iap.finish:param:transaction",
      "iap.acknowledge:param:transaction",
      "iap.buy:param:options",
      "liveupdate.get_mounts:return:mounts",
      "model.get_aabb:return:aabb",
      "model.get_mesh_aabb:return:aabb",
      "physics.raycast:param:groups",
      "physics.raycast_async:param:groups",
      "push.schedule:param:notification_settings",
      "socket.select:param:recvt",
      "socket.select:param:sendt",
      "socket.select:return:sockets_r",
      "socket.select:return:sockets_w",
      "tilemap.get_tile_info:return:tile_info",
      "tilemap.get_tiles:return:tiles",
      "resource.get_text_metrics:return:metrics",
      "profiler.view_recorded_frame:param:frame_index",
      "http.request:param:headers",
      "collectionproxy.get_resources:return:resources",
      "render.predicate:param:tags",
      "render.clear:param:buffers",
      "on_input:param:action",
      "physics.create_joint:param:properties",
      "physics.set_joint_properties:param:properties",
      "physics.raycast:return:result",
      "compute.set_constants:param:constants",
      "compute.set_samplers:param:samplers",
      "material.set_constants:param:constants",
      "material.set_samplers:param:samplers",
      "material.set_vertex_attributes:param:attributes",
      "compute.set_textures:param:textures",
      "material.set_textures:param:textures",
      "model.get_blend_weights:return:weights",
      "model.set_blend_weights:param:weights",
      "graphics.get_engine_adapters:return:adapters",
      "graphics.get_adapter_info:return:info",
      "b2d.get_version:return:info",
      "b2d.body.compute_aabb:return:aabb",
      "b2d.body.create_fixture:param:definition",
      "b2d.body.create_fixture:return:fixture",
      "b2d.body.create_chain:return:segments",
      "b2d.body.get_fixtures:return:fixtures",
      "b2d.body.get_joints:return:joints",
      "b2d.body.get_mass_data:return:data",
      "b2d.body.set_mass_data:param:data",
      "b2d.body.get_shapes:return:shapes",
      "b2d.body.get_transform:return:transform",
      "b2d.chain.get_segments:return:segments",
      "b2d.fixture.get_aabb:return:aabb",
      "b2d.fixture.get_filter_data:return:filter",
      "b2d.fixture.set_filter_data:param:filter",
      "b2d.fixture.get_shape:return:shape",
      "b2d.fixture.set_shape:param:shape",
      "b2d.shape.get_shape:return:shape",
      "b2d.shape.set_shape:param:definition",
      "b2d.shape.get_mass_data:return:data",
      "b2d.shape.get_sensor_overlaps:return:overlaps",
      "b2d.shape.ray_cast:return:hit",
      "b2d.joint.create_distance:param:definition",
      "b2d.joint.create_mouse:param:definition",
      "b2d.joint.create_prismatic:param:definition",
      "b2d.joint.create_revolute:param:definition",
      "b2d.joint.create_weld:param:definition",
      "b2d.joint.create_wheel:param:definition",
      "b2d.joint.create_friction:param:definition",
      "b2d.joint.create_rope:param:definition",
      "b2d.joint.create_pulley:param:definition",
      "b2d.joint.create_gear:param:definition",
      "b2d.joint.create_motor:param:definition",
      "b2d.world.overlap_aabb:param:aabb",
      "b2d.world.overlap_aabb:param:filter",
      "b2d.world.overlap_aabb:return:fixtures",
      "b2d.world.overlap_aabb:return:hits",
      "b2d.world.overlap_aabb:return:stats",
      "b2d.world.overlap_shape:param:shape",
      "b2d.world.overlap_shape:param:filter",
      "b2d.world.overlap_shape:return:fixtures",
      "b2d.world.overlap_shape:return:hits",
      "b2d.world.overlap_shape:return:stats",
      "b2d.world.cast_ray:param:filter",
      "b2d.world.cast_ray:return:hits",
      "b2d.world.cast_ray:return:stats",
      "b2d.world.cast_ray_closest:param:filter",
      "b2d.world.cast_ray_closest:return:hit",
      "b2d.world.cast_shape:param:shape",
      "b2d.world.cast_shape:param:filter",
      "b2d.world.cast_shape:return:hits",
      "b2d.world.cast_shape:return:stats",
      "b2d.world.cast_mover:param:capsule",
      "b2d.world.cast_mover:param:filter",
      "b2d.world.collide_mover:param:capsule",
      "b2d.world.collide_mover:param:filter",
    ]);
    expect(TABLE_SLOT_CURATIONS.size).toBe(94);
    expect(TABLE_SLOT_CURATIONS.get("compute.set_constants:param:constants")).toEqual({
      kind: "keyed-object",
    });
    expect(TABLE_SLOT_CURATIONS.get("compute.set_textures:param:textures")).toEqual({
      kind: "mapping",
      key: "string",
      value: "hash",
    });
    expect(TABLE_SLOT_CURATIONS.get("model.get_blend_weights:return:weights")).toEqual({
      kind: "array",
      element: "number",
    });
    expect(TABLE_SLOT_CURATIONS.get("graphics.get_engine_adapters:return:adapters")).toEqual({
      kind: "array",
      element: "string",
    });
    expect(TABLE_SLOT_CURATIONS.get("b2d.world.cast_ray:return:hits")).toEqual({
      kind: "array-object",
      fields: [
        { name: "fixture", types: ["number"] },
        { name: "shape", types: ["number"] },
        { name: "point", types: ["vector3"] },
        { name: "normal", types: ["vector3"] },
        { name: "fraction", types: ["number"] },
      ],
    });
    expect(MAPPING_TABLE_SLOTS.size).toBe(3);
    expect(HOMOGENEOUS_ARRAY_SLOTS.size).toBe(8);
  });

  test("keyed-object curation re-keys the parser-recovered args table by name", () => {
    const module = parseDefoldApiDoc(computeDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "compute.set_constants"),
        requireFunction(module, "compute.set_samplers"),
        requireFunction(module, "compute.set_textures"),
      ],
    });
    // set_constants keeps the keyed-by-name layer, and the value field's
    // documented array branch is pinned via TABLE_FIELD_TYPE_OVERRIDES.
    expect(out).toContain(
      "constants: Record<string, { type?: number; value?: Vector4 | Vector3 | Matrix4 | number | (Vector4 | Matrix4)[] }>",
    );
    // set_samplers has only numeric inner fields.
    expect(out).toContain(
      "samplers: Record<string, { u_wrap?: number; v_wrap?: number; min_filter?: number; mag_filter?: number; max_anisotropy?: number }>",
    );
    // set_textures maps sampler names to resource-path hashes.
    expect(out).toContain("textures: LuaMap<string, Hash>");
  });

  test("material vertex-attribute value override emits the number[] array branch", () => {
    const module = parseDefoldApiDoc(materialDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "material.set_vertex_attributes"),
        requireFunction(module, "material.get_vertex_attributes"),
      ],
    });
    expect(out).toContain(
      "attributes: Record<string, { value?: Vector4 | Vector3 | Matrix4 | number | number[];",
    );
    // get_vertex_attributes returns the same value shape (non-keyed array-of-object).
    expect(out).toContain("value: Vector4 | Vector3 | Matrix4 | number | number[];");
  });

  test("model blend weights emit as numeric arrays", () => {
    const module = parseDefoldApiDoc(model113Doc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "model.get_blend_weights"),
        requireFunction(module, "model.set_blend_weights"),
      ],
    });
    expect(out).toContain("function get_blend_weights(url: string | Hash | Url): number[];");
    expect(out).toContain("weights?: number[]");
  });

  test("graphics adapter inspection emits typed objects and arrays", () => {
    const module = parseDefoldApiDoc(graphicsDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "graphics.get_engine_adapters"),
        requireFunction(module, "graphics.get_adapter_info"),
      ],
    });
    expect(out).toContain("function get_engine_adapters(): string[];");
    expect(out).toContain("family: string; version_major: number; version_minor: number;");
    expect(out).toContain("max_texture_size_2d: number;");
    expect(out).toContain("extensions: string[]; features: number[]");
  });

  test("b2d.world queries emit typed filters, hit arrays, and query stats", () => {
    const module = parseDefoldApiDoc(b2dWorldDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "b2d.world.cast_ray")],
    });
    expect(out).toContain(
      "filter: { category_bits?: number; mask_bits?: number; group_index?: number }",
    );
    expect(out).toContain(
      "{ fixture: number; shape: number; point: Vector3; normal: Vector3; fraction: number }[]",
    );
    expect(out).toContain("{ node_visits: number; leaf_visits: number }");
  });

  test("collectionfactory.create recovers only the ids return", () => {
    const module = parseDefoldApiDoc(collectionfactoryDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "collectionfactory.create")],
    });
    expect(out).toContain("properties?: Record<string | number, unknown>");
    expect(out).toContain(
      "function create(url: string | Hash | Url, position?: Vector3, rotation?: Quaternion, properties?: Record<string | number, unknown>, scale?: number | Vector3): LuaMap<Hash, Hash>;",
    );
  });

  test("physics raycast groups recover and raycast result recovers the ray_cast_response array-object", () => {
    const module = parseDefoldApiDoc(physicsDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "physics.raycast"),
        requireFunction(module, "physics.raycast_async"),
      ],
    });
    expect(out).toContain(
      "function raycast(from: Vector3, to: Vector3, groups: Hash[], options?: { all?: boolean }): { fraction: number; position: Vector3; normal: Vector3; id: Hash; group: Hash; request_id: number }[] | unknown;",
    );
    expect(out).toContain(
      "function raycast_async(from: Vector3, to: Vector3, groups: Hash[], request_id?: number): void;",
    );
  });

  test("socket.select recovers input and output socket handle arrays", () => {
    const module = parseDefoldApiDoc(socketDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "socket.select")],
    });
    const socketHandles = "(client | master | unconnected)[]";
    expect(out).toContain(
      `function select(recvt: ${socketHandles}, sendt: ${socketHandles}, timeout?: number): LuaMultiReturn<[${socketHandles}, ${socketHandles}, string | unknown]>;`,
    );
  });

  test("liveupdate.get_mounts recovers an array of mount records", () => {
    const module = parseDefoldApiDoc(liveupdateDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "liveupdate.get_mounts")],
    });
    expect(out).toContain(
      "function get_mounts(): { name: string; uri: string; priority: number }[];",
    );
  });

  test("tilemap.get_tile_info recovers an object and get_tiles recovers a nested row map", () => {
    const module = parseDefoldApiDoc(tilemapDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "tilemap.get_tile_info"),
        requireFunction(module, "tilemap.get_tiles"),
      ],
    });
    expect(out).toContain(
      "function get_tile_info(url: string | Hash | Url, layer: string | Hash, x: number, y: number): { index: number; h_flip: boolean; v_flip: boolean; rotate_90: boolean };",
    );
    expect(out).toContain(
      "function get_tiles(url: string | Hash | Url, layer: string | Hash): LuaMap<number, LuaMap<number, number>>;",
    );
  });

  test("a mapping curation with a nested-mapping value emits LuaMap<K, LuaMap<K, V>>", () => {
    const module = parseDefoldApiDoc(tilemapDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "tilemap.get_tiles")],
    });
    expect(out).toContain("LuaMap<number, LuaMap<number, number>>");
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("model AABB returns recover an object and an object-valued mapping", () => {
    const module = parseDefoldApiDoc(modelDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "model.get_aabb"),
        requireFunction(module, "model.get_mesh_aabb"),
      ],
    });
    expect(out).toContain(
      "function get_aabb(url: string | Hash | Url): { min: Vector3; max: Vector3 };",
    );
    expect(out).toContain(
      "function get_mesh_aabb(url: string | Hash | Url): LuaMap<Hash, { min: Vector3; max: Vector3 }>;",
    );
  });

  test("get_text_metrics recovers its return as a metrics object while the options param stays parser-recovered", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "resource.get_text_metrics")],
    });
    const line = out.split("\n").find((l) => l.includes("function get_text_metrics(")) ?? "";
    expect(line).toContain(
      "{ width: number; height: number; max_ascent: number; max_descent: number }",
    );
    expect(line).not.toContain("Record<string | number, unknown>");
    expect(line).toContain(
      "options?: { width?: number; leading?: number; tracking?: number; line_break?: boolean }",
    );
  });

  test("iap finish/acknowledge recover the shared transaction object and buy recovers its options bag", () => {
    const module = parseDefoldApiDoc(iapDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "iap.finish"),
        requireFunction(module, "iap.acknowledge"),
        requireFunction(module, "iap.buy"),
      ],
    });
    const transaction =
      "{ ident?: string; state?: number; trans_ident?: string; date?: string; original_trans?: string; receipt?: string; signature?: string; user_id?: string }";
    expect(out).toContain(`function finish(transaction: ${transaction}): void;`);
    expect(out).toContain(`function acknowledge(transaction: ${transaction}): void;`);
    expect(out).toContain(
      "function buy(id: string, options: { request_id?: string; token?: string }): void;",
    );
  });

  test("push.schedule recovers its notification_settings bag while register recovers a number[]", () => {
    const module = parseDefoldApiDoc(pushDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "push.schedule"),
        requireFunction(module, "push.register"),
      ],
    });
    expect(out).toContain(
      "notification_settings: { action?: string; badge_count?: number; priority?: number }",
    );
    expect(out).toContain("notifications: number[]");
  });

  test("profiler.view_recorded_frame recovers its frame_index option bag", () => {
    const module = parseDefoldApiDoc(profilerDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "profiler.view_recorded_frame")],
    });
    expect(out).toContain(
      "function view_recorded_frame(frame_index: { distance?: number; frame?: number }): void;",
    );
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("http.request recovers its headers map while the options bag stays parser-recovered", () => {
    const module = parseDefoldApiDoc(httpDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "http.request")],
    });
    const line = out.split("\n").find((l) => l.includes("function request(")) ?? "";
    expect(line).toContain("headers?: LuaMap<string, string>");
    expect(line).toContain(
      "options?: { timeout?: number; path?: string; ignore_cache?: boolean; chunked_transfer?: boolean; report_progress?: boolean }",
    );
    expect(line).not.toContain("Record<string | number, unknown>");
  });

  test("collectionproxy.get_resources recovers a Hash[] return", () => {
    const module = parseDefoldApiDoc(collectionproxyDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "collectionproxy.get_resources")],
    });
    expect(out).toContain("function get_resources(collectionproxy: Url): Hash[];");
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("render.predicate recovers a (string | Hash)[] tags param", () => {
    const module = parseDefoldApiDoc(renderDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "render.predicate")],
    });
    expect(out).toContain("function predicate(tags: (string | Hash)[]): number;");
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("render.clear recovers a number-keyed map to the number | Vector4 clear-value union", () => {
    const module = parseDefoldApiDoc(renderDoc);
    const out = emitDeclarations({
      ...module,
      functions: [requireFunction(module, "render.clear")],
    });
    expect(out).toContain("function clear(buffers: LuaMap<number, number | Vector4>): void;");
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("go.on_input and gui.on_input recover the shared InputAction object (all fields optional)", () => {
    // The doc carries a well-formed touch input table, so `touch` is curated
    // as a nested array-of-touch-records (each record lists id, pressed,
    // released, tap_count, x, y, dx, dy, acc_x/y/z). The nested fields inherit
    // the parent's `?` via inlineTableType, which is the same trade-off every
    // object curation makes.
    const inputAction =
      "action: { value?: number; pressed?: boolean; released?: boolean; repeated?: boolean; x?: number; y?: number; screen_x?: number; screen_y?: number; dx?: number; dy?: number; screen_dx?: number; screen_dy?: number; gamepad?: number; gamepad_axis?: Vector3; touch?: { id?: number; pressed?: boolean; released?: boolean; tap_count?: number; x?: number; y?: number; dx?: number; dy?: number; acc_x?: number; acc_y?: number; acc_z?: number }[]; text?: string }";
    const goModule = parseDefoldApiDoc(goDoc);
    const goOut = emitDeclarations({
      ...goModule,
      functions: [requireFunction(goModule, "on_input")],
    });
    expect(goOut).toContain(inputAction);
    const guiModule = parseDefoldApiDoc(guiDoc);
    const guiOut = emitDeclarations({
      ...guiModule,
      functions: [requireFunction(guiModule, "on_input")],
    });
    expect(guiOut).toContain(inputAction);
  });

  test("physics create_joint and set_joint_properties recover the universal collide_connected field", () => {
    const module = parseDefoldApiDoc(physicsDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "physics.create_joint"),
        requireFunction(module, "physics.set_joint_properties"),
      ],
    });
    const properties = "{ collide_connected?: boolean }";
    expect(out).toContain(`properties: ${properties}`);
    expect(out).toContain(`properties: ${properties}`);
  });
});

describe("socket handle method interfaces", () => {
  test("emits a method-bearing interface per receiver, replacing the Opaque handle brands", () => {
    const module = parseDefoldApiDoc(socketDoc);
    const out = emitDeclarations(module);

    // client/master/unconnected are now interfaces, not Opaque typedef aliases.
    expect(out).toContain("interface client {");
    expect(out).not.toContain('type client = Opaque<"client">');
    expect(out).not.toContain('type master = Opaque<"master">');
    expect(out).not.toContain('type unconnected = Opaque<"unconnected">');

    // The interface carries its documented methods; the final colon segment is
    // the emitted member name (no `function` keyword inside an interface).
    expect(out).toMatch(/interface client \{[\s\S]*?\n {4}send\(/);
    expect(out).toMatch(/interface client \{[\s\S]*?\n {4}close\(\): void;/);

    // server and connected exist only via colon methods (no TYPEDEF element), yet
    // are still emitted as interfaces.
    expect(out).toContain("interface server {");
    expect(out).toContain("interface connected {");

    // No leftover socket handle brands anywhere in the module.
    expect(out).not.toContain('Opaque<"client">');
    expect(out).not.toContain('Opaque<"master">');
    expect(out).not.toContain('Opaque<"server">');
    expect(out).not.toContain('Opaque<"connected">');
    expect(out).not.toContain('Opaque<"unconnected">');
  });

  test("factory returns and socket.select reference the receiver interfaces", () => {
    const module = parseDefoldApiDoc(socketDoc);
    const out = emitDeclarations(module);
    expect(out).toContain(
      "function connect(address: string, port: number, locaddr?: string, locport?: number, family?: string): LuaMultiReturn<[client | unknown, string | unknown]>;",
    );
    expect(out).toContain("function tcp(): LuaMultiReturn<[master | unknown, string | unknown]>;");
    const socketHandles = "(client | master | unconnected)[]";
    expect(out).toContain(
      `function select(recvt: ${socketHandles}, sendt: ${socketHandles}, timeout?: number): LuaMultiReturn<[${socketHandles}, ${socketHandles}, string | unknown]>;`,
    );
  });

  test("collectHandleMethodGroups groups every well-formed colon method by receiver", () => {
    const module = parseDefoldApiDoc(socketDoc);
    const groups = collectHandleMethodGroups(module);
    expect([...groups.keys()].sort()).toEqual([
      "client",
      "connected",
      "master",
      "server",
      "unconnected",
    ]);
    const total = [...groups.values()].reduce((n, g) => n + g.length, 0);
    expect(total).toBe(55);
  });

  test("a colon function with a non-identifier segment stays dropped", () => {
    const groups = collectHandleMethodGroups({
      namespace: "socket",
      brief: "",
      description: "",
      functions: [
        {
          name: "client:send-now",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [],
          examples: "",
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    });
    expect(groups.size).toBe(0);
  });
});

describe("NESTED_FIELD_CURATIONS", () => {
  test("holds exactly the two atlas geometries entries, both the same member list", () => {
    const members = [
      { name: "vertices", types: ["table"], numberList: true },
      { name: "uvs", types: ["table"], numberList: true },
      { name: "indices", types: ["table"], numberList: true },
    ];
    expect([...NESTED_FIELD_CURATIONS]).toEqual([
      ["resource.set_atlas:param:table:geometries", members],
      ["resource.get_atlas:return:data:geometries", members],
    ]);
  });

  test("injects the curated members onto the named field of an otherwise parser-recovered slot", () => {
    const parsed = [
      { name: "texture", types: ["string"] },
      { name: "geometries", types: ["table"] },
    ];
    const out = applyNestedFieldCurations("resource.set_atlas", "param", "table", parsed);
    expect(out[0]).toEqual({ name: "texture", types: ["string"] });
    expect(out[1]).toEqual({
      name: "geometries",
      types: ["table"],
      isList: true,
      fields: [
        { name: "vertices", types: ["table"], numberList: true },
        { name: "uvs", types: ["table"], numberList: true },
        { name: "indices", types: ["table"], numberList: true },
      ],
    });
    // A new array is returned; the parser's input is never mutated.
    expect(parsed[1]).toEqual({ name: "geometries", types: ["table"] });
  });

  test("leaves a parser-recovered nested field alone (parser won)", () => {
    const parsed = [
      { name: "geometries", types: ["table"], fields: [{ name: "id", types: ["string"] }] },
    ];
    const out = applyNestedFieldCurations("resource.set_atlas", "param", "table", parsed);
    expect(out[0]).toBe(parsed[0]);
  });

  test("does nothing for an unkeyed slot", () => {
    const parsed = [{ name: "geometries", types: ["table"] }];
    expect(applyNestedFieldCurations("resource.create_atlas", "param", "table", parsed)).toEqual(
      parsed,
    );
  });

  test("drives the injection through emitDeclarations onto set_atlas/get_atlas only", () => {
    const module = parseDefoldApiDoc(resourceDoc);
    const out = emitDeclarations(module);
    const setLine = out.split("\n").find((l) => l.includes("function set_atlas(")) ?? "";
    const getLine = out.split("\n").find((l) => l.includes("function get_atlas(")) ?? "";
    expect(setLine).toContain(
      "geometries?: { vertices?: number[]; uvs?: number[]; indices?: number[] }[]",
    );
    expect(getLine).toContain(
      "geometries: { vertices: number[]; uvs: number[]; indices: number[] }[]",
    );
    // create_atlas is not curated — its parser-grouped geometries shape is untouched.
    const createLine = out.split("\n").find((l) => l.includes("function create_atlas")) ?? "";
    expect(createLine).toContain(
      "geometries?: { id?: string; width?: number; height?: number; pivot_x?: number; pivot_y?: number; rotated?: boolean }[]",
    );
  });
});

describe("HOMOGENEOUS_ARRAY_SLOTS", () => {
  test("maps the four primitive slots unchanged, the two id-array slots, and the push.register constant array", () => {
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("buffer.set_metadata")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("buffer.get_metadata")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("vmath.vector")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("sound.get_groups")).toBe("hash");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("iap.list")).toBe("string");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("go.delete")).toEqual(["string", "hash", "url"]);
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("push.register")).toBe("number");
    expect(HOMOGENEOUS_ARRAY_SLOTS.get("camera.get_cameras")).toBe("url");
    expect(HOMOGENEOUS_ARRAY_SLOTS.size).toBe(8);
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

describe("camera/font residual fidelity recovery", () => {
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

  test("camera.get_cameras emits Url[] for its homogeneous URL array return", () => {
    const out = emitDeclarations(
      moduleOf("camera", [
        {
          name: "camera.get_cameras",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            {
              name: "cameras",
              doc: "a table with all camera URLs",
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("function get_cameras(): Url[];");
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("font.get_info emits the curated object with a fonts array and a single top-level path", () => {
    const out = emitDeclarations(
      moduleOf("font", [
        {
          name: "font.get_info",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [
            { name: "info", doc: "the information table", types: ["table"], isOptional: false },
          ],
        },
      ]),
    );
    expect(out).toContain(
      "function get_info(): { path: Hash; fonts: { path: string; path_hash: Hash }[] };",
    );
    expect(out).not.toContain("Record<string | number, unknown>");
  });

  test("a camera setter emits its leading interior-optional camera param as Url | number | undefined", () => {
    const out = emitDeclarations(
      moduleOf("camera", [
        {
          name: "camera.set_fov",
          brief: "",
          description: "",
          parameters: [
            {
              name: "camera",
              doc: "camera id",
              types: ["url", "number", "nil"],
              isOptional: false,
            },
            { name: "fov", doc: "the field of view.", types: ["number"], isOptional: false },
          ],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("function set_fov(camera: Url | number | undefined, fov: number): void;");
  });

  test("a trailing-optional camera param keeps the ? form, no | undefined", () => {
    const out = emitDeclarations(
      moduleOf("camera", [
        {
          name: "camera.get_fov",
          brief: "",
          description: "",
          parameters: [
            {
              name: "camera",
              doc: "camera id",
              types: ["url", "number", "nil"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ]),
    );
    expect(out).toContain("function get_fov(camera?: Url | number): void;");
    expect(out).not.toContain("| undefined");
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
    expect(
      SLOT_LEVEL_LIST_PROSE.test("A table of tables, where each entry contains info about the X:"),
    ).toBe(true);
    expect(SLOT_LEVEL_LIST_PROSE.test("a single table")).toBe(false);
  });

  test("table-of-tables prose before the field list wraps the recovered object in []", () => {
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
              doc: `A table of tables, where each entry: ${fieldList}`,
              types: ["table"],
              isOptional: false,
            },
          ],
        },
      ]),
    );
    expect(out).toContain("function f(): { a: string; n: number }[];");
  });

  test("compute records-collection getters emit arrays of records", () => {
    const module = parseDefoldApiDoc(computeDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "compute.get_constants"),
        requireFunction(module, "compute.get_samplers"),
        requireFunction(module, "compute.get_textures"),
      ],
    });
    expect(out).toContain(
      "function get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[];",
    );
    expect(out).toContain(
      "function get_samplers(path: Hash | string): { name: Hash; u_wrap: number; v_wrap: number; min_filter: number; mag_filter: number; max_anisotropy: number }[];",
    );
    expect(out).toContain(
      "function get_textures(path: Hash | string): { path: Hash; handle: Hash; width: number; height: number; depth: number; mipmaps: number; type: number; flags: number }[];",
    );
  });

  test("material records-collection getters emit arrays of records", () => {
    const module = parseDefoldApiDoc(materialDoc);
    const out = emitDeclarations({
      ...module,
      functions: [
        requireFunction(module, "material.get_constants"),
        requireFunction(module, "material.get_samplers"),
        requireFunction(module, "material.get_textures"),
        requireFunction(module, "material.get_vertex_attributes"),
      ],
    });
    expect(out).toContain(
      "function get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[];",
    );
    expect(out).toContain(
      "function get_samplers(path: Hash | string): { name: Hash; u_wrap: number; v_wrap: number; min_filter: number; mag_filter: number; max_anisotropy: number }[];",
    );
    expect(out).toContain(
      "function get_textures(path: Hash | string): { path: Hash; handle: Hash; width: number; height: number; depth: number; mipmaps: number; type: number; flags: number }[];",
    );
    expect(out).toContain(
      "function get_vertex_attributes(path: Hash | string): { name: Hash; value: Vector4 | Vector3 | Matrix4 | number | number[]; normalize: boolean; data_type: number; coordinate_space: number; semantic_type: number }[];",
    );
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

  test("a one-level nested function emits a namespace block keyed by its final segment", () => {
    const module: ApiModule = {
      namespace: "sock",
      brief: "",
      description: "",
      functions: [
        {
          name: "sock.gettime",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [{ name: "", doc: "", types: ["number"], isOptional: false }],
        },
        {
          name: "sock.dns.toip",
          brief: "",
          description: "",
          parameters: [{ name: "address", doc: "", types: ["string"], isOptional: false }],
          returnValues: [{ name: "", doc: "", types: ["string"], isOptional: false }],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const out = emitDeclarations(module);
    expect(out).toContain("  function gettime(): number;");
    expect(out).toContain("  namespace dns {");
    expect(out).toContain("    function toip(address: string): string;");
    expect(out).not.toContain("function dns.toip");
  });

  test("a function with two dots or a non-identifier segment after stripping is still dropped", () => {
    const module: ApiModule = {
      namespace: "sock",
      brief: "",
      description: "",
      functions: [
        {
          name: "sock.a.b.c",
          brief: "",
          description: "",
          parameters: [],
          returnValues: [],
        },
        {
          name: "sock.9bad.x",
          brief: "",
          description: "",
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
    expect(out).not.toContain("namespace a ");
    expect(out).not.toContain("namespace 9bad");
    expect(out).not.toContain("function c(");
    expect(out).not.toContain("function x(");
  });

  test("socket.dns.toip emits under a nested namespace with its FQN-resolved multi-return", () => {
    const module = parseDefoldApiDoc(socketDoc);
    const out = emitDeclarations(module);
    expect(out).toContain("  namespace dns {");
    const toipLine = out.split("\n").find((line) => line.includes("function toip("));
    expect(toipLine).toBeDefined();
    // toip documents two returns; the return resolves through the full
    // `socket.dns.toip` element name, so it emits the same multi-return tuple it
    // would at the top level rather than a dropped/void signature.
    expect(toipLine).toContain("LuaMultiReturn<[");
    expect(toipLine).not.toContain(": void");
  });
});
