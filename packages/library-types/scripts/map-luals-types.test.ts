import { describe, expect, test } from "bun:test";
import { type MapContext, mapLualsCallSignature, mapLualsType } from "./map-luals-types";

const ctx = (over: Partial<MapContext> = {}): MapContext => ({
  knownNames: over.knownNames ?? new Set<string>(),
  typeRenames: over.typeRenames ?? {},
});

const ts = (token: string, over: Partial<MapContext> = {}): string =>
  mapLualsType(token, ctx(over)).ts;

describe("mapLualsType scalars", () => {
  test("integer and number map to number", () => {
    expect(ts("integer")).toBe("number");
    expect(ts("number")).toBe("number");
  });

  test("string maps to string", () => {
    expect(ts("string")).toBe("string");
  });

  test("boolean maps to boolean", () => {
    expect(ts("boolean")).toBe("boolean");
  });

  test("nil maps to undefined", () => {
    expect(ts("nil")).toBe("undefined");
  });

  test("any maps to unknown and is not recorded as a fallback", () => {
    const r = mapLualsType("any", ctx());
    expect(r.ts).toBe("unknown");
    expect(r.unknowns).toEqual([]);
  });
});

describe("mapLualsType optional suffix", () => {
  test("string? becomes string | undefined", () => {
    expect(ts("string?")).toBe("string | undefined");
  });

  test("no duplicate undefined when the base already yields it", () => {
    expect(ts("nil?")).toBe("undefined");
  });

  test("function? parenthesizes the callable before the union", () => {
    expect(ts("function?")).toBe("((...args: any[]) => unknown) | undefined");
  });

  test("a fun return suffix stays on the return type", () => {
    expect(ts("fun(a: string): number?")).toBe("(a: string) => number | undefined");
  });

  test("a parenthesized whole function is optional as a whole", () => {
    expect(ts("(fun(a: string): number)?")).toBe("((a: string) => number) | undefined");
  });
});

describe("mapLualsType unions", () => {
  test("integer | nil becomes number | undefined", () => {
    expect(ts("integer | nil")).toBe("number | undefined");
  });

  test("string-literal union passes through verbatim", () => {
    expect(ts('"left" | "right"')).toBe('"left" | "right"');
  });

  test("no-space string-literal union normalizes spacing", () => {
    expect(ts('"a"|"b"|"c"')).toBe('"a" | "b" | "c"');
  });
});

describe("mapLualsType arrays", () => {
  test("array of a known interface", () => {
    expect(ts("Button[]", { knownNames: new Set(["Button"]) })).toBe("Button[]");
  });

  test("array of a union parenthesizes the element", () => {
    expect(ts("(integer | string)[]")).toBe("(number | string)[]");
  });
});

describe("mapLualsType table", () => {
  test("table<string, integer> becomes LuaTable<string, number>", () => {
    expect(ts("table<string, integer>")).toBe("LuaTable<string, number>");
  });

  test("bare table becomes LuaTable", () => {
    expect(ts("table")).toBe("LuaTable");
  });

  test("nested table maps recursively", () => {
    expect(ts("table<number, table<string, number>>")).toBe(
      "LuaTable<number, LuaTable<string, number>>",
    );
  });
});

describe("mapLualsType inline object", () => {
  test("object literal maps each field and uses semicolons", () => {
    expect(ts("{path: string, id: integer}")).toBe("{ path: string; id: number }");
  });

  test("array of an object literal parenthesizes the element", () => {
    expect(ts("{path: string}[]")).toBe("({ path: string })[]");
  });
});

describe("mapLualsType functions", () => {
  test("typed params and return", () => {
    expect(ts("fun(text: string): boolean")).toBe("(text: string) => boolean");
  });

  test("no params, no return", () => {
    expect(ts("fun()")).toBe("() => void");
  });

  test("untyped params become unknown and are recorded", () => {
    const r = mapLualsType("fun(self, ctx)", ctx());
    expect(r.ts).toBe("(self: unknown, ctx: unknown) => void");
    expect(r.unknowns).toEqual(["self", "ctx"]);
  });

  test("an underscore param is unknown and is not recorded as a fallback", () => {
    const r = mapLualsType("fun(_, msg: string, data: any)", ctx());
    expect(r.ts).toBe("(_: unknown, msg: string, data: unknown) => void");
    expect(r.unknowns).toEqual([]);
  });

  test("the underscore exemption does not extend to self or ctx", () => {
    const r = mapLualsType("fun(_, self, ctx)", ctx());
    expect(r.ts).toBe("(_: unknown, self: unknown, ctx: unknown) => void");
    expect(r.unknowns).toEqual(["self", "ctx"]);
  });

  test("a typed underscore param keeps its declared type", () => {
    const r = mapLualsType("fun(_: string)", ctx());
    expect(r.ts).toBe("(_: string) => void");
    expect(r.unknowns).toEqual([]);
  });

  test("inline multi-return becomes LuaMultiReturn", () => {
    expect(ts("fun(): number, string")).toBe("() => LuaMultiReturn<[number, string]>");
  });

  test("function in a union is parenthesized", () => {
    expect(ts("fun()|nil")).toBe("(() => void) | undefined");
  });

  test("Druid vararg form: bare vararg becomes a rest param and is not recorded", () => {
    const r = mapLualsType(
      "fun(self:druid.component, ...)|nil",
      ctx({ knownNames: new Set(["druid.component"]) }),
    );
    expect(r.ts).toBe("((self: druid.component, ...args: unknown[]) => void) | undefined");
    expect(r.unknowns).toEqual([]);
  });

  test("bare vararg alone becomes a rest param and is not recorded", () => {
    const r = mapLualsType("fun(...)", ctx());
    expect(r.ts).toBe("(...args: unknown[]) => void");
    expect(r.unknowns).toEqual([]);
  });

  test("typed vararg becomes a typed rest param and records nothing", () => {
    const r = mapLualsType("fun(...:string)", ctx());
    expect(r.ts).toBe("(...args: string[]) => void");
    expect(r.unknowns).toEqual([]);
  });

  test("a bare vararg return token is unknown and is not recorded", () => {
    const r = mapLualsType("fun(...): ...", ctx());
    expect(r.ts).toBe("(...args: unknown[]) => unknown");
    expect(r.unknowns).toEqual([]);
  });

  test("a trailing vararg return becomes a rest tuple element", () => {
    const r = mapLualsType("fun(...): world, ...", ctx({ knownNames: new Set(["world"]) }));
    expect(r.ts).toBe("(...args: unknown[]) => LuaMultiReturn<[world, ...unknown[]]>");
    expect(r.unknowns).toEqual([]);
  });

  test("the rest tail keys on the last token, not on arity", () => {
    const r = mapLualsType("fun(): world, string, ...", ctx({ knownNames: new Set(["world"]) }));
    expect(r.ts).toBe("() => LuaMultiReturn<[world, string, ...unknown[]]>");
    expect(r.unknowns).toEqual([]);
  });

  test("a non-trailing vararg return token gets no rest treatment", () => {
    const r = mapLualsType("fun(): ..., world", ctx({ knownNames: new Set(["world"]) }));
    expect(r.ts).toBe("() => LuaMultiReturn<[unknown, world]>");
    expect(r.unknowns).toEqual([]);
  });

  test("the vararg token in isolation is unknown and is not recorded", () => {
    const r = mapLualsType("...", ctx());
    expect(r.ts).toBe("unknown");
    expect(r.unknowns).toEqual([]);
  });

  test("return union stays inside the return type", () => {
    expect(ts("fun(): number|string")).toBe("() => number | string");
  });

  test("params plus a return union", () => {
    expect(ts("fun(x: integer): number | nil")).toBe("(x: number) => number | undefined");
  });

  test("bare function becomes a callable and is not recorded as a fallback", () => {
    const r = mapLualsType("function", ctx());
    expect(r.ts).toBe("(...args: any[]) => unknown");
    expect(r.unknowns).toEqual([]);
  });

  test("bare function in a union is parenthesized", () => {
    const r = mapLualsType("function|event", ctx({ knownNames: new Set(["event"]) }));
    expect(r.ts).toBe("((...args: any[]) => unknown) | event");
    expect(r.unknowns).toEqual([]);
  });

  test("function|nil becomes an optional callable", () => {
    expect(ts("function|nil")).toBe("((...args: any[]) => unknown) | undefined");
  });

  test("function|event|nil keeps every member", () => {
    expect(ts("function|event|nil", { knownNames: new Set(["event"]) })).toBe(
      "((...args: any[]) => unknown) | event | undefined",
    );
  });

  test("array of bare function parenthesizes the element", () => {
    expect(ts("function[]")).toBe("((...args: any[]) => unknown)[]");
  });

  test("bare function composes as a fun param", () => {
    expect(ts("fun(cb: function): nil")).toBe("(cb: (...args: any[]) => unknown) => undefined");
  });
});

describe("mapLualsType core renames", () => {
  test("dotted vmath token", () => {
    expect(ts("vmath.vector3")).toBe("Vector3");
  });

  test("bare hash, url, node", () => {
    expect(ts("hash")).toBe("Hash");
    expect(ts("url")).toBe("Url");
    expect(ts("node")).toBe('Opaque<"node">');
  });

  test("per-target typeRenames wins and is not recorded unknown", () => {
    const r = mapLualsType("vector3", ctx({ typeRenames: { vector3: "Vector3" } }));
    expect(r.ts).toBe("Vector3");
    expect(r.unknowns).toEqual([]);
  });
});

describe("mapLualsType reference resolution", () => {
  test("a known class reference resolves verbatim and is not recorded", () => {
    const r = mapLualsType("druid.component", ctx({ knownNames: new Set(["druid.component"]) }));
    expect(r.ts).toBe("druid.component");
    expect(r.unknowns).toEqual([]);
  });

  test("an unmapped vmath.* token throws naming the token", () => {
    expect(() => mapLualsType("vmath.made_up", ctx())).toThrow(/vmath\.made_up/);
  });

  test("an unresolved bare reference lowers to unknown and is recorded", () => {
    const r = mapLualsType("some_unlisted_class", ctx());
    expect(r.ts).toBe("unknown");
    expect(r.unknowns).toEqual(["some_unlisted_class"]);
  });
});

describe("mapLualsCallSignature", () => {
  const sig = (token: string, over: Partial<MapContext> = {}): string =>
    mapLualsCallSignature(token, ctx(over)).ts;

  test("a `fun(vararg:any): any|nil` becomes a colon-return call signature, not an arrow", () => {
    expect(sig("fun(vararg:any): any|nil")).toBe("(vararg: unknown): unknown | undefined");
  });

  test("a `fun(value:any): nil` maps its return through the scalar map", () => {
    expect(sig("fun(value:any): nil")).toBe("(value: unknown): undefined");
  });

  test("no return maps to a `: void` call signature", () => {
    expect(sig("fun()")).toBe("(): void");
  });

  test("nested callback params and multi-returns survive intact", () => {
    expect(sig("fun(cb: fun(a: string): string): number, string")).toBe(
      "(cb: (a: string) => string): LuaMultiReturn<[number, string]>",
    );
  });

  test("a trailing vararg return carries the rest tail into a call signature", () => {
    const r = mapLualsCallSignature(
      "fun(cb: fun(a: string): string): world, ...",
      ctx({ knownNames: new Set(["world"]) }),
    );
    expect(r.ts).toBe("(cb: (a: string) => string): LuaMultiReturn<[world, ...unknown[]]>");
    expect(r.unknowns).toEqual([]);
  });

  test("an unresolved param type is recorded as an unknown fallback", () => {
    const r = mapLualsCallSignature("fun(x: some_unlisted): nil", ctx());
    expect(r.ts).toBe("(x: unknown): undefined");
    expect(r.unknowns).toEqual(["some_unlisted"]);
  });

  test("a non-`fun` token is rejected", () => {
    expect(() => mapLualsCallSignature("string", ctx())).toThrow();
  });
});

describe("mapLualsType determinism", () => {
  test("mapping the same token twice yields equal results", () => {
    const c = ctx({ knownNames: new Set(["druid.component"]) });
    expect(mapLualsType("table<string, druid.component[]>", c)).toEqual(
      mapLualsType("table<string, druid.component[]>", c),
    );
  });
});
