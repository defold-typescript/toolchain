import { describe, expect, test } from "bun:test";
import { codemodDeclaration } from "./sync-library-types";

// A representative ambient module that mixes every construct the transform must
// handle: bare core types (`hash`, `url`), dotted `vmath.*` references, an engine
// handle (`node`), passthrough language extensions (`LuaMultiReturn`, `LuaMap`), a
// locally-declared `table` alias that collides with a Defold core-type name, and a
// `hashValue` member whose identifier merely embeds a core-type token.
const SAMPLE = `/** @noSelfInFile */

/**
 * @noResolution
 */
declare module 'sample.sample' {
  type table = {};
  type ScreenId = hash | string;
  type State = {
    node: node;
    node_id: hash;
    hashValue: number;
  };
  export const DONE: hash;
  /**
   * @param {string|hash} id
   * @param {url} where
   */
  export function make(id: hash | string, where: url, at: vmath.vector3): State;
  export function spin(): vmath.quat;
  export function pair(): LuaMultiReturn<[boolean, string]>;
  export function nodes(): LuaMap<hash, node>;
  export function group(fn: () => void): table;
}
`;

describe("codemodDeclaration", () => {
  test("renames core-type references to the @defold-typescript/types surface", () => {
    const { output, unmapped } = codemodDeclaration(SAMPLE);
    expect(unmapped).toEqual([]);
    expect(output).toContain("at: Vector3)");
    expect(output).toContain("export function spin(): Quaternion;");
    expect(output).toContain("type ScreenId = Hash | string;");
    expect(output).toContain("export const DONE: Hash;");
    expect(output).toContain("where: Url,");
    expect(output).toContain('node: Opaque<"node">;');
    expect(output).toContain("node_id: Hash;");
    expect(output).toContain('LuaMap<Hash, Opaque<"node">>');
  });

  test("leaves passthrough constructs byte-identical", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("/** @noSelfInFile */");
    expect(output).toContain("@noResolution");
    expect(output).toContain("declare module 'sample.sample' {");
    expect(output).toContain("LuaMultiReturn<[boolean, string]>");
    // Core-type tokens inside JSDoc are comment text, not type references.
    expect(output).toContain("@param {string|hash} id");
    expect(output).toContain("@param {url} where");
  });

  test("does not rename a core-type token embedded in an identifier", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("hashValue: number;");
    expect(output).not.toContain("HashValue");
  });

  test("leaves a locally-declared `table` alias untouched", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("type table = {};");
    expect(output).toContain("): table;");
  });

  test("reports an unmapped vmath.* reference instead of renaming it silently", () => {
    const src = "declare module 'x.x' {\n  export function f(): vmath.matrix3;\n}\n";
    const { output, unmapped } = codemodDeclaration(src);
    expect(unmapped).toContain("vmath.matrix3");
    expect(output).toContain("vmath.matrix3");
  });
});
