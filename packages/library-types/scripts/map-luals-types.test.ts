import { describe, expect, test } from "bun:test";
import { type MapContext, mapLualsType } from "./map-luals-types";

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

  test("inline multi-return becomes LuaMultiReturn", () => {
    expect(ts("fun(): number, string")).toBe("() => LuaMultiReturn<[number, string]>");
  });

  test("function in a union is parenthesized", () => {
    expect(ts("fun()|nil")).toBe("(() => void) | undefined");
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

describe("mapLualsType determinism", () => {
  test("mapping the same token twice yields equal results", () => {
    const c = ctx({ knownNames: new Set(["druid.component"]) });
    expect(mapLualsType("table<string, druid.component[]>", c)).toEqual(
      mapLualsType("table<string, druid.component[]>", c),
    );
  });
});
