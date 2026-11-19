import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("type-application erasure", () => {
  test("go.get<P>(), go.set<P>() and go.animate<P>() reach Lua as the engine function itself", () => {
    const result = transpile(
      [
        "declare const url: Url;",
        "interface EnemyProps { speed: number }",
        'const animation = go.get<sprite.Properties>()(url, "animation");',
        'go.set<sprite.Properties>()(url, "playback_rate", go.get<sprite.Properties>()(url, "cursor"));',
        'const speed = go.get<EnemyProps>()(url, "speed", { index: 1 });',
        "const read = go.get<model.Properties>();",
        'read(url, "texture0");',
        'go.get(url, "position");',
        'go.animate<sprite.Properties>()(url, "playback_rate", go.PLAYBACK_ONCE_FORWARD, 2, go.EASING_LINEAR, 1);',
        "declare function typed<T>(): (value: T) => T;",
        "typed<number>()(1);",
        "export {};",
        "",
      ].join("\n"),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local animation = go.get(url, "animation")
      go.set(
          url,
          "playback_rate",
          go.get(url, "cursor")
      )
      local speed = go.get(url, "speed", {index = 1})
      local read = go.get
      read(url, "texture0")
      go.get(url, "position")
      go.animate(
          url,
          "playback_rate",
          go.PLAYBACK_ONCE_FORWARD,
          2,
          go.EASING_LINEAR,
          1
      )
      typed()(1)
      return ____exports
      "
    `);
  });
});
