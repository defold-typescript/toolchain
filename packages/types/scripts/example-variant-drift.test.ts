import { describe, expect, test } from "bun:test";
import type { TranslationStore } from "../src/example-store";
import { loadTranslations } from "./example-store-io";
import { type ExampleSourceIndex, exampleSourceIndex } from "./example-surfaces";
import { variantDriftDefects } from "./example-variant-drift";

const FQN = "resource.create_texture";

interface SyntheticSource {
  readonly hash: string;
  readonly lua: string;
  readonly targets: readonly string[];
}

function syntheticIndex(
  sources: readonly SyntheticSource[],
  documented: Record<string, readonly string[]>,
): ExampleSourceIndex {
  return {
    sources: new Map([
      [
        FQN,
        new Map(
          sources.map(({ hash, lua, targets }) => [hash, { lua, targets: new Set(targets) }]),
        ),
      ],
    ]),
    documented: new Map(
      Object.entries(documented).map(([target, names]) => [target, new Set(names)]),
    ),
    namespaces: new Set(["graphics", "resource", "render"]),
  };
}

function body(sourceHash: string, ts: string): TranslationStore {
  return { [FQN]: [{ sourceHash, ts }] };
}

describe("committed store", () => {
  test("no shipped translation carries a variant's names or omits its own source's", () => {
    expect(variantDriftDefects(loadTranslations(), exampleSourceIndex())).toEqual([]);
  });
});

describe("variant drift rule", () => {
  test("a verbatim copy of an older variant's body is named in both directions", () => {
    const index = syntheticIndex(
      [
        { hash: "n", lua: "graphics.X()", targets: ["new"] },
        { hash: "o", lua: "resource.X()", targets: ["old"] },
      ],
      { new: ["graphics.X"], old: ["resource.X"] },
    );
    expect(variantDriftDefects(body("n", "resource.X();"), index)).toEqual([
      `${FQN}:n carries resource.X from o`,
      `${FQN}:n omits graphics.X its source adds over o`,
    ]);
  });

  test("a substitution for a name its own target does not document is excused", () => {
    const index = syntheticIndex(
      [
        { hash: "n", lua: "graphics.X()", targets: ["new"] },
        { hash: "o", lua: "resource.X()", targets: ["old"] },
      ],
      { new: ["graphics.X"], old: ["graphics.X"] },
    );
    expect(variantDriftDefects(body("o", "graphics.X();"), index)).toEqual([]);
  });

  test("examples co-shipping on one target are not variants of each other", () => {
    const index = syntheticIndex(
      [
        { hash: "a", lua: "graphics.X()", targets: ["new"] },
        { hash: "b", lua: "resource.X()", targets: ["new"] },
      ],
      { new: ["graphics.X", "resource.X"] },
    );
    expect(variantDriftDefects(body("a", "graphics.X(); resource.X();"), index)).toEqual([]);
  });

  test("a name the own source adds over its variant is named when the body lacks it", () => {
    const index = syntheticIndex(
      [
        { hash: "n", lua: "render.enable_state()\nrender.draw()", targets: ["new"] },
        { hash: "o", lua: "render.enable_state()", targets: ["old"] },
      ],
      { new: ["render.enable_state", "render.draw"], old: ["render.enable_state"] },
    );
    expect(variantDriftDefects(body("n", "render.enable_state();"), index)).toEqual([
      `${FQN}:n omits render.draw its source adds over o`,
    ]);
  });

  test("names inside a Lua source's comments and strings are not names", () => {
    const lua = [
      "-- render.draw",
      "--[[ render.draw ]]",
      "--[==[ render.draw ]] render.draw ]==]",
      'local s = "render.draw \\" render.draw"',
      "local q = 'render.draw'",
      "local t = [[ render.draw ]]",
      "local u = [=[ render.draw ]] render.draw ]=]",
      "graphics.X()",
    ].join("\n");
    const index = syntheticIndex(
      [
        { hash: "n", lua, targets: ["new"] },
        { hash: "o", lua: "graphics.X()", targets: ["old"] },
      ],
      { new: ["graphics.X", "render.draw"], old: ["graphics.X"] },
    );
    expect(variantDriftDefects(body("n", "graphics.X();"), index)).toEqual([]);
  });

  test("names inside a translation's comments and strings are not names", () => {
    const ts = [
      "// resource.X",
      "/* resource.X */",
      'const s = "resource.X";',
      "const t = `resource.X`;",
      "graphics.X();",
    ].join("\n");
    const index = syntheticIndex(
      [
        { hash: "n", lua: "graphics.X()", targets: ["new"] },
        { hash: "o", lua: "resource.X()", targets: ["old"] },
      ],
      { new: ["graphics.X"], old: ["resource.X"] },
    );
    expect(variantDriftDefects(body("n", ts), index)).toEqual([]);
  });
});
