import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { freeGlobals } from "./hsm-view-free-globals";

describe("freeGlobals", () => {
  test("returns the undeclared names a call reads", () => {
    expect(freeGlobals('sprite.play_flipbook("#s", a);')).toEqual(["a", "sprite"]);
  });

  test("skips every declared name at any depth", () => {
    const js = `
      const { a, b: [c, ...d] } = x;
      let e = 1;
      var f;
      function g(h, { i = 2 }, ...j) {
        try {
          const k = h + i + j;
          return () => k;
        } catch ({ message: l }) {
          return l;
        } finally {
          class M { n(o) { return o; } }
          new M();
        }
      }
      for (const p of q) { p; }
      for (let r in s) { r; }
      const t = function u(v) { return u(v); };
      a; c; d; e; f; g; t;
    `;
    expect(freeGlobals(js)).toEqual(["q", "s", "x"]);
  });

  test("ignores property names and keys but keeps shorthand references", () => {
    expect(freeGlobals("const y = { sprite: 1, go() { return 0; } }; y.sprite; y;")).toEqual([]);
    expect(freeGlobals("const y = x.sprite; y;")).toEqual(["x"]);
    expect(freeGlobals("const y = { go }; y;")).toEqual(["go"]);
  });

  test("the CommonJS shape transpileModule emits reads only Object", () => {
    const source = `
      import { defineMachine } from "./m";
      import type { T } from "./t";
      export const machine = defineMachine()({ initial: "/a" });
      export function make(n: T) { return n; }
    `;
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    expect(js).toContain("require(");
    expect(freeGlobals(js).filter((name) => !["require", "exports"].includes(name))).toEqual([
      "Object",
    ]);
  });

  test("is sorted with no duplicates", () => {
    expect(freeGlobals("zeta(); alpha(); zeta(); mid; alpha;")).toEqual(["alpha", "mid", "zeta"]);
  });
});
