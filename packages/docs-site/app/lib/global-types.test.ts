import { describe, expect, test } from "bun:test";
import { type ApiPage, apiModuleSymbols } from "./api-surface";
import { jsdocToMarkdown, parseGlobalTypes } from "./global-types";
import { buildSymbolIndex } from "./symbol-index";

// Representative slice of `packages/types/src/core-types.ts`, inlined so this
// suite stays pure (no `node:*` read) and off the client graph. Mirrors the
// real declarations including the canonical JSDoc above each interface: the
// brief and description are derived from these blocks, not from a hand-curated
// map, so the fixture carries the same summaries/`@remarks`/`@example` the real
// source does.
const SRC = `
/**
 * A read-only numeric vector accessed by index; \`length\` is its component count.
 */
export interface Vector {
  readonly [index: number]: number;
  readonly length: number;
}

/**
 * A three-component vector with \`x\`, \`y\`, and \`z\` components.
 */
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

/**
 * A four-component vector with \`x\`, \`y\`, \`z\`, and \`w\` components.
 */
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

/**
 * A rotation quaternion with \`x\`, \`y\`, \`z\`, and \`w\` components.
 */
export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
  mul: LuaMultiplicationMethod<Quaternion, Quaternion>;
}

/**
 * A 4x4 transformation matrix.
 */
export interface Matrix4 {
  m00: number;
  c0: Vector4;
  mul: LuaMultiplicationMethod<Matrix4, Matrix4> & LuaMultiplicationMethod<Vector4, Vector4>;
}

declare const HashBrand: unique symbol;
/**
 * An opaque, branded handle to a *hashed name*: hold it and pass it back to the
 * engine API, but never inspect or construct it. Defold uses it in place of a
 * string for game-object and component ids, resource paths, input-action names,
 * material/animation/constant names, and the \`socket\`, \`path\`, and \`fragment\` of
 * every {@link Url}; you obtain one from the global \`hash(name)\` function (or
 * receive it back from the engine) and pass it straight to the API, never
 * assembling its bits by hand.
 *
 * @remarks
 * The brand is a phantom \`unique symbol\` property that exists only in the type
 * system and is erased at transpile — at runtime a \`Hash\` is the engine's opaque
 * hash value, not an object carrying that key. Because the symbol is not
 * exported, consumer code cannot fabricate a \`Hash\`; the only sources are
 * \`hash()\` and the engine.
 *
 * Hashing is one-way: the original string cannot be recovered from a \`Hash\`.
 */
export interface Hash {
  readonly [HashBrand]: "Hash";
}

declare const OpaqueBrand: unique symbol;
/**
 * A nominal, branded handle to a value the engine owns and manages — a GUI node,
 * a texture, a render target, a physics body, a socket, and so on: hold it and
 * pass it back to the API, but never inspect or construct it. You get one back
 * from an engine function, keep it in a variable, and pass it to the other
 * functions that act on that resource.
 *
 * @remarks
 * Each kind of handle is its own brand, so the compiler keeps them apart:
 * \`Opaque<"node">\` and \`Opaque<"texture">\` are different types. The brand is a
 * phantom \`unique symbol\` property that lives only in the type system and is
 * erased at transpile.
 *
 * @example
 * Handles always come back from the engine — for instance:
 * \`\`\`ts
 * const node = gui.get_node("button"); // Opaque<"node">
 * \`\`\`
 *
 * Contrast with a \`LuaTable\` alias, which says the opposite — "inspect freely,
 * the shape just isn't modeled."
 */
export interface Opaque<Name extends string> {
  readonly [OpaqueBrand]: Name;
}

/**
 * A message-passing address with \`socket\`, \`path\`, and \`fragment\` components.
 */
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

describe("jsdocToMarkdown", () => {
  test("strips the gutter and the leading /** and trailing */", () => {
    const md = jsdocToMarkdown("/**\n * A short summary.\n */");
    expect(md).toBe("A short summary.");
  });

  test("drops the @remarks marker but keeps its body as a following paragraph", () => {
    const md = jsdocToMarkdown("/**\n * Summary line.\n *\n * @remarks\n * Extra detail.\n */");
    expect(md).toBe("Summary line.\n\nExtra detail.");
  });

  test("turns an @example block into a fenced code block whose `<` stays raw", () => {
    const md = jsdocToMarkdown(
      '/**\n * Summary.\n *\n * @example\n * ```ts\n * const n = f<"node">();\n * ```\n */',
    );
    expect(md).toContain('```ts\nconst n = f<"node">();\n```');
    // The angle brackets inside the fence are NOT entity-encoded.
    expect(md).not.toContain("&lt;");
  });

  test("rewrites {@link Core.Url} and {@link Url} to inline code", () => {
    expect(jsdocToMarkdown("/**\n * See {@link Core.Url} here.\n */")).toBe("See `Url` here.");
    expect(jsdocToMarkdown("/**\n * See {@link Url} here.\n */")).toBe("See `Url` here.");
  });

  test("leaves prose and inline-code angle brackets RAW (no entity-encoding)", () => {
    // The derived Markdown is rendered directly by markdown-it, not sanitized
    // through `htmlToDocText`, so `<`/`>` stay literal — markdown-it escapes them
    // per its own rules (code spans render `<` verbatim).
    expect(jsdocToMarkdown("/**\n * Holds when a < b is true.\n */")).toBe(
      "Holds when a < b is true.",
    );
    expect(jsdocToMarkdown('/**\n * Keeps `Opaque<"node">` apart.\n */')).toBe(
      'Keeps `Opaque<"node">` apart.',
    );
  });

  test("keeps a @remarks bullet list separated from a following @example by a blank line", () => {
    // Locks the list -> paragraph spacing: each tag body becomes its own
    // Markdown block joined by a blank line, so markdown-it renders the list and
    // the example caption as distinct blocks instead of one run-on.
    const md = jsdocToMarkdown(
      [
        "/**",
        " * Summary.",
        " *",
        " * @remarks",
        " * Kinds:",
        " * - node",
        " * - texture",
        " *",
        " * @example",
        " * After the list.",
        " */",
      ].join("\n"),
    );
    expect(md).toContain("Kinds:\n- node\n- texture");
    expect(md).toContain("- texture\n\nAfter the list.");
  });
});

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

  test("derives brief = first sentence and description = full body from the JSDoc", () => {
    // Regression lock: the derived briefs equal the prior hand-curated
    // TYPE_BRIEFS strings, verbatim, for the value types whose summary the
    // previous step pinned to those strings.
    expect(pageNamed("Vector3").brief).toBe(
      "A three-component vector with `x`, `y`, and `z` components.",
    );
    expect(pageNamed("Quaternion").brief).toBe(
      "A rotation quaternion with `x`, `y`, `z`, and `w` components.",
    );
    expect(pageNamed("Url").brief).toBe(
      "A message-passing address with `socket`, `path`, and `fragment` components.",
    );
    // brief is the first sentence; description is the full converted body.
    expect(pageNamed("Vector3").module.description).toBe(pageNamed("Vector3").brief);
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

  test("Hash carries a deep multi-paragraph Markdown description", () => {
    // The description is raw Markdown rendered directly by markdown-it — assert
    // on it as-is, not through the HTML-oriented htmlToDocText.
    const md = pageNamed("Hash").module.description;
    expect(md.length).toBeGreaterThan(300);
    expect(md).toContain("\n\n");
    expect(md).toContain("hash(name)");
    expect(md).toContain("unique symbol");
    expect(md.toLowerCase()).toContain("one-way");
  });

  test("Opaque's description keeps its generic notation and example fence verbatim", () => {
    const md = pageNamed("Opaque").module.description;
    expect(md.length).toBeGreaterThan(300);
    expect(md).toContain("\n\n");
    // Inline-code generics stay literal (markdown-it renders them verbatim).
    expect(md).toContain('`Opaque<"node">`');
    expect(md).toContain('`Opaque<"texture">`');
    expect(md).toContain("unique symbol");
    expect(md).toContain("LuaTable");
    // The @example fence — and its `Opaque<"node">` comment — survives intact,
    // no longer eaten by an HTML tag-strip.
    expect(md).toContain('```ts\nconst node = gui.get_node("button"); // Opaque<"node">\n```');
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
