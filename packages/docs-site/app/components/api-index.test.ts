import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, LibraryMeta } from "../lib/api-surface";
import { LibraryIndex } from "./api-index";

function libraryPage(namespace: string, route: string, authoredHere: boolean): ApiPage {
  const module: ApiModule = {
    namespace,
    brief: "",
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
  const libraryMeta: LibraryMeta = {
    author: "",
    authorUrl: "",
    commit: "",
    sourceUrl: "",
    importString: "",
    license: "",
    authoredHere,
  };
  return {
    namespace,
    route,
    brief: "",
    module,
    translations: {},
    signatures: {},
    category: "library",
    libraryMeta,
  };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// The inner HTML of the card anchor whose href resolves to `route`.
function cardInner(html: string, route: string): string {
  const match = html.match(new RegExp(`<a href="[^"]*${route}"[^>]*>(.*?)</a>`, "s"));
  if (!match) throw new Error(`no card for ${route}`);
  return match[1] ?? "";
}

describe("LibraryIndex — authored-library card pin", () => {
  const pages = [
    libraryPage("druid", "/api/druid", true),
    libraryPage("monarch.monarch", "/api/monarch.monarch", false),
  ];
  const moduleDir = new Map<string, string>([["monarch.monarch", "monarch"]]);
  const owners = new Map<string, string>([
    ["druid", "Insality"],
    ["monarch", "britzl"],
  ]);
  const render = () => String(LibraryIndex({ pages, moduleDir, owners }));

  test("the authored library card carries the pin and its hint", () => {
    expect(cardInner(render(), "/api/druid")).toContain('<span class="authored-pin"');
    expect(render()).toContain("Type bindings maintained in this repo");
  });

  test("the vendored library card is unmarked", () => {
    expect(cardInner(render(), "/api/monarch.monarch")).not.toContain("authored-pin");
  });

  test("the total pin count equals the authored-page count", () => {
    expect(count(render(), '<span class="authored-pin"')).toBe(1);
  });
});
