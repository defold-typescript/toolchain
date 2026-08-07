import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage, LibraryMeta } from "../lib/api-surface";
import { type LibraryOrigin, libraryPathSegments } from "../lib/nav";
import { LibraryIndex, LibraryPath } from "./api-index";

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

describe("LibraryIndex — card titles", () => {
  const pages = [
    libraryPage("druid", "/api/druid", true),
    libraryPage("monarch.monarch", "/api/monarch.monarch", false),
  ];
  const origins = new Map<string, LibraryOrigin>([
    ["druid", { owner: "Insality", repo: "druid" }],
    ["monarch.monarch", { owner: "britzl", repo: "monarch" }],
  ]);
  const render = () => String(LibraryIndex({ pages, origins }));

  test("the owner heads its section, so each card titles itself repo-first", () => {
    const html = render();
    expect(html).toContain("Insality");
    expect(html).toContain("britzl");
    expect(cardInner(html, "/api/monarch.monarch")).toContain("monarch.<wbr");
  });

  test("a card whose namespace repeats its repo name shows that name once", () => {
    expect(count(cardInner(render(), "/api/druid"), "druid")).toBe(1);
  });
});

// A dot between letters and a path slash are both non-breaking under UAX #14, so
// without explicit break hints a long namespace overflows its heading and widens
// the page horizontally.
describe("LibraryPath — wrap opportunities", () => {
  const html = (owner: string, repo: string, namespace: string) =>
    String(LibraryPath({ owner, repo, namespace }));

  test("every dot in the namespace carries a following <wbr>", () => {
    const rendered = html("britzl", "monarch", "monarch.transitions.easings");
    expect(count(rendered, "<wbr")).toBe(count(rendered, ".") + 2);
    expect(rendered).toContain("monarch.<wbr");
    expect(rendered).toContain("transitions.<wbr");
  });

  test("each path slash carries a following <wbr>", () => {
    expect(count(html("whiteboxdev", "library-defold-persist", "persist"), "<wbr")).toBe(2);
  });

  test("a namespace repeating its repo name drops that segment's slash break", () => {
    expect(count(html("8bitskull", "dicebag", "dicebag"), "<wbr")).toBe(1);
  });

  test("an origin-less library standing in for itself collapses to one segment", () => {
    expect(count(html("druid", "druid", "druid"), "<wbr")).toBe(0);
  });
});

describe("LibraryPath — segments", () => {
  test("drops a segment identical to the one before it", () => {
    expect(libraryPathSegments("8bitskull", "dicebag", "dicebag")).toEqual([
      "8bitskull",
      "dicebag",
    ]);
    expect(libraryPathSegments("britzl", "defold-input", "in.accelerometer")).toEqual([
      "britzl",
      "defold-input",
      "in.accelerometer",
    ]);
    expect(libraryPathSegments("", "monarch", "monarch.transitions.gui")).toEqual([
      "monarch",
      "monarch.transitions.gui",
    ]);
  });

  test("the accent falls on the last surviving segment, lead-ins stay muted", () => {
    expect(
      String(LibraryPath({ owner: "8bitskull", repo: "dicebag", namespace: "dicebag" })),
    ).toContain('text-accent">dicebag');
    const persist = String(
      LibraryPath({ owner: "whiteboxdev", repo: "library-defold-persist", namespace: "persist" }),
    );
    expect(persist).toContain('text-accent">persist');
    expect(persist).toContain('text-text-muted">library-defold-persist');
  });
});
