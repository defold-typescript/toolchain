import { describe, expect, test } from "bun:test";
import { mapLualsExpression } from "./luals-type-expr";

const LEAVES: Readonly<Record<string, string>> = {
  string: "string",
  integer: "number",
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
