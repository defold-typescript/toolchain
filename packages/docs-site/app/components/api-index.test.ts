import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ApiModule } from "@defold-typescript/types";
import { apiPages, libraryOrigins } from "../lib/api-content";
import type { ApiPage, LibraryMeta } from "../lib/api-surface";
import { type LibraryListing, type LibraryOrigin, libraryPathSegments } from "../lib/nav";
import { LIBRARY_API_KIND_SENTENCE, NO_TYPED_API_ICON } from "../lib/no-typed-api-icon";
import { CombinedIndex, LibraryIndex, LibraryPath } from "./api-index";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");
const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");

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
    usage: "import",
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

describe("LibraryIndex — untyped library listings", () => {
  const url = "https://github.com/defold/extension-adpf";
  const route = "/libraries/defold/extension-adpf";
  const listing = (description: string, ships: string): LibraryListing => ({
    owner: "defold",
    repo: "extension-adpf",
    url,
    ref: "1.0.0",
    pinKind: "release",
    description,
    official: true,
    route,
    api: "untyped",
    adoption: "standard",
    ships,
    steps: ["Call `adpf.start` from a script."],
  });
  const render = (description: string, ships = "Tunes performance.") =>
    String(
      LibraryIndex({
        pages: [libraryPage("iap", "/api/iap", false)],
        origins: new Map<string, LibraryOrigin>([
          ["iap", { owner: "defold", repo: "extension-iap", official: true }],
        ]),
        listings: [listing(description, ships)],
      }),
    );

  test("links the listing page, never GitHub, and marks the title with the icon", () => {
    const html = render("Android performance");
    expect(html).not.toContain(`href="${url}"`);
    const inner = cardInner(html, route);
    expect(inner).toContain("extension-adpf");
    expect(inner).toContain(NO_TYPED_API_ICON);
    expect(inner).toContain("Android performance");
    expect(inner).toContain(LIBRARY_API_KIND_SENTENCE.untyped.replace(/`/g, ""));
  });

  test("falls back to the lead's first sentence when the manifest description is empty", () => {
    const inner = cardInner(render("", "Tunes thermal headroom. Also reports status."), route);
    expect(inner).toContain("Tunes thermal headroom.");
    expect(inner).not.toContain("Also reports status.");
  });

  test("keeps the namespace count to documented pages", () => {
    expect(render("Android performance")).toContain("1 namespace documented");
  });
});

describe("LibraryIndex — official owner note", () => {
  const html = String(
    LibraryIndex({
      pages: [
        libraryPage("monarch.monarch", "/api/monarch.monarch", false),
        libraryPage("iap", "/api/iap", false),
      ],
      origins: new Map<string, LibraryOrigin>([
        ["monarch.monarch", { owner: "britzl", repo: "monarch" }],
        ["iap", { owner: "defold", repo: "extension-iap", official: true }],
      ]),
    }),
  );
  const headings = [...html.matchAll(/<h2>(.*?)<\/h2>/gs)].map((match) => match[1] ?? "");

  test("heads the first section defold with a dimmed (official) note", () => {
    expect(headings[0]).toBe('defold <span class="text-text-faint font-normal">(official)</span>');
  });

  test("marks no other section official", () => {
    expect(headings.slice(1)).toEqual(["britzl"]);
    expect(count(html, "(official)")).toBe(1);
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

function enginePage(namespace: string): ApiPage {
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
  return {
    namespace,
    route: `/api/${namespace}`,
    brief: "",
    module,
    translations: {},
    signatures: {},
    category: "engine",
  };
}

// The disclosure is read back out of the rendered element rather than matched
// against a sentence: `data-tracked-versions` is the key the assertions hold, so
// the wording stays free to change while the derived facts stay pinned.
function disclosure(html: string): { versions: string; text: string } {
  const match = html.match(/<span[^>]*\sdata-tracked-versions="([^"]*)"[^>]*>([\s\S]*?)<\/span>/);
  if (!match) throw new Error("no tracked-versions disclosure in the rendered index");
  return { versions: match[1] ?? "", text: (match[2] ?? "").replace(/<[^>]+>/g, "") };
}

describe("CombinedIndex — tracked-versions disclosure", () => {
  const render = (versions: string[]) =>
    String(CombinedIndex({ pages: [enginePage("go")], versions }));

  test("lists the tracked versions from the projection it is handed, not from a literal", () => {
    expect(disclosure(render(["1.13.1", "1.13.0", "1.12.4"])).versions).toBe(
      "1.13.1, 1.13.0, 1.12.4",
    );
    // A second, disjoint axis: a hardcoded list survives one of these, never both.
    expect(disclosure(render(["9.9.9", "2.0.0", "1.0.0"])).versions).toBe("9.9.9, 2.0.0, 1.0.0");
  });

  test("names the oldest tracked release as the limit of what an unmarked symbol can claim", () => {
    const { text } = disclosure(render(["9.9.9", "2.0.0", "1.0.0"]));
    // The bare list carries no `Defold ` prefix, so only the limit clause matches.
    expect(text).toContain("Defold 1.0.0");
    expect(text).not.toContain("Defold 9.9.9");
    expect(text).not.toContain("Defold 2.0.0");
  });

  test("a single tracked release is its own limit", () => {
    const { versions, text } = disclosure(render(["1.13.1"]));
    expect(versions).toBe("1.13.1");
    expect(text).toContain("Defold 1.13.1");
  });
});

describe("LibraryIndex — platform markers", () => {
  const html = String(
    LibraryIndex({
      pages: apiPages(REAL_TYPES_DIR, REAL_LIBRARY_TYPES_DIR),
      origins: libraryOrigins(REAL_LIBRARY_TYPES_DIR),
    }),
  );

  test("the adinfo card description reads as prose with no bracket markers", () => {
    const description = html.match(
      /Provides functionality to get the advertising id and tracking status\.[^<]*/,
    )?.[0];
    expect(description).toBe(
      "Provides functionality to get the advertising id and tracking status. Supported on iOS and Android.",
    );
    expect(html).not.toContain("[icon:");
  });
});
