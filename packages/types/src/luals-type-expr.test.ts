import { describe, expect, test } from "bun:test";
import { mapLualsCallSignatureExpression, mapLualsExpression } from "./luals-type-expr";

const LEAVES: Readonly<Record<string, string>> = {
  string: "string",
  integer: "number",
  number: "number",
  hash: "Hash",
  nil: "undefined",
  "http.server.request": "HttpServerRequest",
  "http.response": "HttpResponse",
  "zip.METHOD": "ZipMethod",
  "render.render_target_buffer_params": "RenderTargetBufferParams",
};

const resolveLeaf = (leaf: string): string | undefined => LEAVES[leaf];

const map = (token: string) => mapLualsExpression(token, resolveLeaf);

describe("mapLualsExpression upstream 1.13.2 tokens", () => {
  test("numeric and boolean literals stay literals", () => {
    expect(map("0")).toEqual({ ts: "0", unknowns: [] });
    expect(map("1")).toEqual({ ts: "1", unknowns: [] });
    expect(map("true")).toEqual({ ts: "true", unknowns: [] });
  });

  test("a parenthesized multi-return renders through LuaMultiReturn", () => {
    expect(
      map(
        "fun(request:http.server.request):(http.response|integer|nil, table<string, string>|nil, string|nil)",
      ),
    ).toEqual({
      ts: "(request: HttpServerRequest) => LuaMultiReturn<[HttpResponse | number | undefined, LuaTable<string, string> | undefined, string | undefined]>",
      unknowns: [],
    });
  });

  test("tuple keys render as numeric property keys", () => {
    expect(map("{[1]:string, [2]?:string}")).toEqual({
      ts: "{ 1: string; 2?: string }",
      unknowns: [],
    });
    expect(map("{[1]:string, [2]?:string, method?:zip.METHOD, level?:integer}")).toEqual({
      ts: "{ 1: string; 2?: string; method?: ZipMethod; level?: number }",
      unknowns: [],
    });
  });

  test("a typed index key renders as an intersected numeric index signature", () => {
    expect(
      map("{ sample_count?:integer, [graphics.BUFFER_TYPE]:render.render_target_buffer_params }"),
    ).toEqual({
      ts: "{ sample_count?: number } & { [key: number]: RenderTargetBufferParams }",
      unknowns: [],
    });
  });
});

describe("mapLualsExpression unresolved leaves", () => {
  test("a leaf the resolver does not know maps to unknown and is reported", () => {
    expect(map("socket_client")).toEqual({ ts: "unknown", unknowns: ["socket_client"] });
  });

  test("a composite with one unknown leaf reports only that leaf", () => {
    expect(map("table<string, buffer_data>|nil")).toEqual({
      ts: "LuaTable<string, unknown> | undefined",
      unknowns: ["buffer_data"],
    });
  });
});

describe("mapLualsExpression position-aware tables", () => {
  const input = (token: string) => mapLualsExpression(token, resolveLeaf, "input").ts;
  const output = (token: string) => mapLualsExpression(token, resolveLeaf, "output").ts;

  test("a string-keyed table widens to accept an object literal only in input position", () => {
    expect(input("table<string|hash, number>")).toBe(
      "LuaMap<string | Hash, number> | Record<string, number>",
    );
    expect(output("table<string|hash, number>")).toBe("LuaTable<string | Hash, number>");
    expect(map("table<string|hash, number>").ts).toBe("LuaTable<string | Hash, number>");
  });

  test("a hash-only key cannot carry an object literal's keys, so it takes only a Lua table", () => {
    expect(input("table<hash, number>")).toBe("LuaMap<Hash, number>");
    expect(output("table<hash, number>")).toBe("LuaTable<Hash, number>");
  });

  // `LuaMap` is the input builder both TSTL constructors satisfy: a `LuaTable`
  // is assignable to it, while a `LuaMap` is not assignable to a `LuaTable`.
  test("an input table takes a LuaMap, and an output table stays a LuaTable", () => {
    expect(input("table<integer, number>")).toBe("LuaMap<number, number>");
    expect(output("table<integer, number>")).toBe("LuaTable<number, number>");
  });

  test("an any-keyed table admits string keys, so it widens in input position", () => {
    expect(input("table<any, any>")).toBe("LuaMap<AnyNotNil, unknown> | Record<string, unknown>");
    expect(output("table<any, any>")).toBe("LuaTable<AnyNotNil, unknown>");
  });

  test("a nested string-keyed table widens at every level in input position and none in output", () => {
    expect(input("table<string, table<string, number>>")).toBe(
      "LuaMap<string, LuaMap<string, number> | Record<string, number>> | Record<string, LuaMap<string, number> | Record<string, number>>",
    );
    expect(output("table<string, table<string, number>>")).toBe(
      "LuaTable<string, LuaTable<string, number>>",
    );
  });

  test("input position reaches through optionals, unions, arrays and inline records", () => {
    expect(input("table<string, number>?")).toBe(
      "LuaMap<string, number> | Record<string, number> | undefined",
    );
    expect(input("table<string, number>[]")).toBe(
      "(LuaMap<string, number> | Record<string, number>)[]",
    );
    expect(input("{ values: table<string, number> }")).toBe(
      "{ values: LuaMap<string, number> | Record<string, number> }",
    );
  });

  test("a callback's params are handed over by the engine, its return is supplied by the caller", () => {
    expect(input("fun(t: table<string, number>): table<string, number>")).toBe(
      "(t: LuaTable<string, number>) => LuaMap<string, number> | Record<string, number>",
    );
    expect(output("fun(t: table<string, number>): table<string, number>")).toBe(
      "(t: LuaTable<string, number>) => LuaTable<string, number>",
    );
  });

  test("a widened table maps its value once, so an unknown leaf is reported once", () => {
    expect(mapLualsExpression("table<string, buffer_data>", resolveLeaf, "input")).toEqual({
      ts: "LuaMap<string, unknown> | Record<string, unknown>",
      unknowns: ["buffer_data"],
    });
  });

  test("a call signature keeps its params unwidened and widens its return only in input position", () => {
    const token = "fun(t: table<string, number>): table<string, number>";
    expect(mapLualsCallSignatureExpression(token, resolveLeaf).ts).toBe(
      "(t: LuaTable<string, number>): LuaTable<string, number>",
    );
    expect(mapLualsCallSignatureExpression(token, resolveLeaf, "input").ts).toBe(
      "(t: LuaTable<string, number>): LuaMap<string, number> | Record<string, number>",
    );
  });
});
