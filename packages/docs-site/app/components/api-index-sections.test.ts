import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory } from "../lib/api-surface";
import { groupApiIndexPages } from "./api-index-sections";

function page(namespace: string, category: ApiPageCategory, route: string): ApiPage {
  const module: ApiModule = {
    namespace,
    brief: `${namespace} brief`,
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  return {
    namespace,
    route,
    brief: `${namespace} brief`,
    module,
    translations: {},
    signatures: {},
    category,
  };
}

describe("groupApiIndexPages", () => {
  test("collects library pages into their own section, alongside engine and lua-stdlib", () => {
    const sections = groupApiIndexPages([
      page("go", "engine", "/api/go"),
      page("base", "lua-stdlib", "/api/base"),
      page("monarch.monarch", "library", "/api/monarch.monarch"),
      page("in.button", "library", "/api/in.button"),
    ]);
    expect(sections.library.map((p) => p.namespace)).toEqual(["monarch.monarch", "in.button"]);
    expect(sections.engine.map((p) => p.namespace)).toEqual(["go"]);
    expect(sections.luaStdlib.map((p) => p.namespace)).toEqual(["base"]);
  });

  test("yields an empty library section when no library pages are present", () => {
    const sections = groupApiIndexPages([page("go", "engine", "/api/go")]);
    expect(sections.library).toEqual([]);
  });
});
