import { describe, expect, test } from "bun:test";
import { transpile, transpileProject } from "./transpile";

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

  test("factory.create<P>() reaches Lua as the engine function itself", () => {
    const result = transpile(
      [
        "declare const url: Url;",
        "interface EnemyProps { speed: number }",
        "factory.create<EnemyProps>()(url, undefined, undefined, { speed: 2 });",
        "const spawn = factory.create<EnemyProps>();",
        "spawn(url);",
        "factory.create(url);",
        "export {};",
        "",
      ].join("\n"),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      factory.create(url, nil, nil, {speed = 2})
      local spawn = factory.create
      spawn(url)
      factory.create(url)
      return ____exports
      "
    `);
  });

  test("collectionfactory.create<P>() reaches Lua as the engine function with hashed instance ids", () => {
    const result = transpile(
      [
        "declare const url: Url;",
        "interface EnemyProps { speed: number }",
        'interface SquadProps { "/enemy": EnemyProps; "/leader": EnemyProps }',
        'const LEADER = "/leader";',
        "collectionfactory.create<SquadProps>()(url, undefined, undefined, {",
        '  "/enemy": { speed: 2 },',
        "  [LEADER]: { speed: 3 },",
        "});",
        "collectionfactory.create<SquadProps>()(url, undefined, undefined, ({",
        '  "/enemy": { speed: 4 },',
        "} satisfies Partial<SquadProps>));",
        "collectionfactory.create<SquadProps>()(url, undefined, undefined, undefined);",
        "collectionfactory.create<SquadProps>()(url);",
        "collectionfactory.create(url);",
        "export {};",
        "",
      ].join("\n"),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toMatchInlineSnapshot(`
      "--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
      local ____exports = {}
      local LEADER = "/leader"
      collectionfactory.create(
          url,
          nil,
          nil,
          {
              [hash("/enemy")] = {speed = 2},
              [hash(LEADER)] = {speed = 3}
          }
      )
      collectionfactory.create(
          url,
          nil,
          nil,
          {[hash("/enemy")] = {speed = 4}}
      )
      collectionfactory.create(url, nil, nil, nil)
      collectionfactory.create(url)
      collectionfactory.create(url)
      return ____exports
      "
    `);
  });

  test("collectionfactory.create<P>() rejects every form whose instance ids the build cannot hash", () => {
    const source = [
      "declare const url: Url;",
      "interface EnemyProps { speed: number }",
      'declare const props: { "/enemy": EnemyProps };',
      "const spawn = collectionfactory.create<EnemyProps>();",
      'collectionfactory.create<{ "/enemy": EnemyProps }>()(url, undefined, undefined, props);',
      'collectionfactory.create<{ "/enemy": EnemyProps }>()(url, undefined, undefined, { ...props });',
      "export {};",
      "",
    ].join("\n");
    const lineOf = (text: string): number =>
      source.slice(0, source.indexOf(text)).split("\n").length;
    const stored =
      "`collectionfactory.create<P>()` must be called directly: the build hashes the instance ids of its `properties` only at that call, and the engine rejects a string id.";
    const literal =
      "Pass `properties` to `collectionfactory.create<P>()` as an object literal of instance ids: the build hashes each id it can see, and the engine rejects a string id. Build a `LuaMap<Hash, PlainTable>` with `hash(...)` for the bare `collectionfactory.create` instead.";
    const result = transpileProject({ files: { "main.ts": source } });
    expect(
      result.diagnostics.map((diagnostic) => ({
        line: diagnostic.line,
        message: diagnostic.message,
      })),
    ).toEqual([
      { line: lineOf("const spawn"), message: stored },
      { line: lineOf("undefined, props)"), message: literal },
      { line: lineOf("{ ...props }"), message: literal },
    ]);
  });
});
