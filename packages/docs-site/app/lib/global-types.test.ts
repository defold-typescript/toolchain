import { describe, expect, test } from "bun:test";
import { htmlToDocText } from "@defold-typescript/types";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
import { parseGlobalTypes } from "./global-types";
import { buildSymbolIndex } from "./symbol-index";

// Representative slice of `packages/types/src/core-types.ts`, inlined so this
// suite stays pure (no `node:*` read) and off the client graph. Mirrors the
// real declarations: JSDoc blocks, `readonly`, index/brand signatures, a
// `&`-joined operator overload, and the generic `Opaque` brand documented as a
// brief-only page.
const SRC = `
export interface Vector {
  readonly [index: number]: number;
  readonly length: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
  add: LuaAdditionMethod<Vector3, Vector3>;
  sub: LuaSubtractionMethod<Vector3, Vector3>;
  mul: LuaMultiplicationMethod<number, Vector3>;
  div: LuaDivisionMethod<number, Vector3>;
  /**
   * @remarks
   * Prefer \`v.unm()\` over \`-v\`.
   */
  unm: LuaNegationMethod<Vector3>;
}

export interface Vector4 {
  x: number;
  y: number;
  z: number;
  w: number;
  add: LuaAdditionMethod<Vector4, Vector4>;
  sub: LuaSubtractionMethod<Vector4, Vector4>;
  mul: LuaMultiplicationMethod<number, Vector4>;
  div: LuaDivisionMethod<number, Vector4>;
  unm: LuaNegationMethod<Vector4>;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  mul: LuaMultiplicationMethod<Quaternion, Quaternion>;
}

export interface Matrix4 {
  m00: number;
  c0: Vector4;
  mul: LuaMultiplicationMethod<Matrix4, Matrix4> & LuaMultiplicationMethod<Vector4, Vector4>;
}

declare const HashBrand: unique symbol;
export interface Hash {
  readonly [HashBrand]: "Hash";
}

declare const OpaqueBrand: unique symbol;
export interface Opaque<Name extends string> {
  readonly [OpaqueBrand]: Name;
}

export interface Url {
  readonly socket: Hash;
  readonly path: Hash;
  readonly fragment: Hash | undefined;
}
`;

const PAGES = parseGlobalTypes(SRC);

function pageNamed(name: string): ApiPage {
  const page = PAGES.find((p) => p.namespace === name);
  if (!page) throw new Error(`no parsed page for ${name}`);
  return page;
}

function methodSignatures(name: string, member: string): string[] {
  return apiModuleSymbols(pageNamed(name))
    .filter((s) => s.kind === "function" && s.name === member)
    .map((s) => s.signature);
}

describe("parseGlobalTypes", () => {
  test("returns one global-type page per value type, including the Opaque brand", () => {
    expect(PAGES.map((p) => p.namespace).sort()).toEqual([
      "Hash",
      "Matrix4",
      "Opaque",
      "Quaternion",
      "Url",
      "Vector",
      "Vector3",
      "Vector4",
    ]);
    for (const page of PAGES) {
      expect(page.route).toBe(`/api/${page.namespace}`);
      expect(page.category).toBe("global-type");
    }
  });

  test("Vector3 exposes x/y/z number properties and operator-method signatures", () => {
    const v3 = pageNamed("Vector3");
    expect(v3.module.properties.map((p) => p.name)).toEqual(["x", "y", "z"]);
    for (const prop of v3.module.properties) expect(prop.types).toEqual(["number"]);
    expect(methodSignatures("Vector3", "add")).toEqual(["add(rhs: Vector3): Vector3"]);
    expect(methodSignatures("Vector3", "sub")).toEqual(["sub(rhs: Vector3): Vector3"]);
    expect(methodSignatures("Vector3", "mul")).toEqual(["mul(rhs: number): Vector3"]);
    expect(methodSignatures("Vector3", "div")).toEqual(["div(rhs: number): Vector3"]);
    expect(methodSignatures("Vector3", "unm")).toEqual(["unm(): Vector3"]);
  });

  test("Matrix4 mul overload yields two function entries", () => {
    expect(methodSignatures("Matrix4", "mul").sort()).toEqual([
      "mul(rhs: Matrix4): Matrix4",
      "mul(rhs: Vector4): Vector4",
    ]);
  });

  test("Hash is an opaque branded handle with no inspectable members", () => {
    const hash = pageNamed("Hash");
    expect(hash.module.properties).toEqual([]);
    expect(hash.module.functions).toEqual([]);
    expect(hash.brief.toLowerCase()).toContain("opaque");
    expect(hash.brief.toLowerCase()).toContain("brand");
  });

  test("Hash carries a deep multi-paragraph description", () => {
    const rendered = htmlToDocText(pageNamed("Hash").module.description);
    expect(rendered.length).toBeGreaterThan(300);
    expect(rendered).toContain("\n\n");
    expect(rendered).toContain("hash(name)");
    expect(rendered).toContain("unique symbol");
    expect(rendered.toLowerCase()).toContain("one-way");
  });

  test("Opaque's description keeps its generic notation through htmlToDocText", () => {
    const rendered = htmlToDocText(pageNamed("Opaque").module.description);
    expect(rendered.length).toBeGreaterThan(300);
    expect(rendered).toContain("\n\n");
    // The entity-encoded `Opaque&lt;"node"&gt;` decodes back to angle brackets
    // instead of being stripped as a tag.
    expect(rendered).toContain('Opaque<"node">');
    expect(rendered).toContain('Opaque<"texture">');
    expect(rendered).toContain("unique symbol");
    expect(rendered).toContain("LuaTable");
  });

  test("Opaque is a brand-only page with no inspectable members", () => {
    const opaque = pageNamed("Opaque");
    expect(opaque.module.properties).toEqual([]);
    expect(opaque.module.functions).toEqual([]);
    expect(opaque.brief.toLowerCase()).toContain("brand");
    expect(opaque.brief.toLowerCase()).toContain("never");
  });

  test("Url carries socket/path/fragment with fragment optional", () => {
    const url = pageNamed("Url");
    expect(url.module.properties.map((p) => p.name)).toEqual(["socket", "path", "fragment"]);
    const fragment = url.module.properties.find((p) => p.name === "fragment");
    expect(fragment?.types).toContain("undefined");
  });

  test("Vector exposes length and notes numeric indexing", () => {
    const vector = pageNamed("Vector");
    expect(vector.module.properties.map((p) => p.name)).toEqual(["length"]);
    expect(vector.brief.toLowerCase()).toMatch(/index/);
  });

  test("throws loudly on an unknown Lua<Op>Method type", () => {
    const bad = "export interface Vector3 { weird: LuaModuloMethod<Vector3, Vector3>; }";
    expect(() => parseGlobalTypes(bad)).toThrow();
  });
});

describe("buildSymbolIndex over global types", () => {
  const index = buildSymbolIndex(parseGlobalTypes(SRC));

  test("keys a bare value-type name to its page with no anchor", () => {
    expect(index.Vector3).toBeDefined();
    expect(index.Vector3?.route).toBe("/api/Vector3");
  });

  test("keys each qualified member to its page with an anchor", () => {
    expect(index["Vector3.x"]).toBeDefined();
    expect(index["Vector3.x"]?.route.startsWith("/api/Vector3#")).toBe(true);
  });
});
