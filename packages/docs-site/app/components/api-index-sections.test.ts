import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory } from "../lib/api-surface";
import {
  apiPageCardDescription,
  groupApiIndexPages,
  groupLibraryIndexByCreator,
} from "./api-index-sections";

function page(
  namespace: string,
  category: ApiPageCategory,
  route: string,
  opts: { brief?: string; description?: string } = {},
): ApiPage {
  const brief = opts.brief ?? `${namespace} brief`;
  const module: ApiModule = {
    namespace,
    brief,
    description: opts.description ?? "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  return {
    namespace,
    route,
    brief,
    module,
    translations: {},
    signatures: {},
    category,
  };
}

describe("apiPageCardDescription", () => {
  test("uses the page brief when one exists", () => {
    const apiPage = page("monarch.monarch", "library", "/api/monarch.monarch", {
      brief: "Module summary.",
      description: "Longer module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("Module summary.");
  });

  test("falls back to library module descriptions when brief is empty", () => {
    const apiPage = page("bridge.bridge", "library", "/api/bridge.bridge", {
      brief: "",
      description: "One SDK for cross-platform publishing HTML5 games",
    });
    expect(apiPageCardDescription(apiPage)).toBe(
      "One SDK for cross-platform publishing HTML5 games",
    );
  });

  test("does not fall back to long descriptions for non-library pages", () => {
    const apiPage = page("go", "engine", "/api/go", {
      brief: "",
      description: "Long engine module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("");
  });
});

describe("groupLibraryIndexByCreator", () => {
  test("groups libraries by creator and upstream dir", () => {
    const groups = groupLibraryIndexByCreator(
      [
        page("go", "engine", "/api/go"),
        {
          ...page("in.cursor", "library", "/api/in.cursor"),
          displayName: "britzl / input · cursor",
        },
        {
          ...page("in.button", "library", "/api/in.button"),
          displayName: "britzl / input · button",
        },
        page("monarch.monarch", "library", "/api/monarch.monarch"),
        page("squid.squid", "library", "/api/squid.squid"),
      ],
      new Map([
        ["in.button", "defold-input"],
        ["in.cursor", "defold-input"],
        ["monarch.monarch", "monarch"],
        ["squid.squid", "squid"],
      ]),
      new Map([
        ["defold-input", "britzl"],
        ["monarch", "britzl"],
        ["squid", "paweljarosz"],
      ]),
    );

    expect(groups.map((group) => group.label)).toEqual(["britzl", "paweljarosz"]);
    expect(groups[0]?.libraries.map((library) => library.label)).toEqual([
      "defold-input",
      "monarch",
    ]);
    expect(groups[0]?.libraries[0]?.pages.map((p) => p.namespace)).toEqual([
      "in.button",
      "in.cursor",
    ]);
    expect(groups[1]?.libraries[0]?.pages.map((p) => p.namespace)).toEqual(["squid.squid"]);
  });
});

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
