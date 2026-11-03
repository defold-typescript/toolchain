import { describe, expect, test } from "bun:test";
import type { ApiPage, ApiPageCategory } from "@defold-typescript/docs-render/api-surface";
import type { ApiModule } from "@defold-typescript/types";
import type { NamespaceBadgeCounts } from "../lib/combined-surface";
import { buildNav } from "../lib/nav";
import { CombinedIndex } from "./api-index";
import { apiCardBadgeHtml, apiPageCardDescription, groupApiIndexPages } from "./api-index-sections";

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
    const apiPage = page("go", "engine", "/api/go", {
      brief: "Module summary.",
      description: "Longer module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("Module summary.");
  });

  test("does not fall back to the long module description", () => {
    const apiPage = page("go", "engine", "/api/go", {
      brief: "",
      description: "Long engine module description.",
    });
    expect(apiPageCardDescription(apiPage)).toBe("");
  });
});

describe("groupApiIndexPages", () => {
  test("collects API pages into the same section order as the left nav", () => {
    const sections = groupApiIndexPages([
      page("go", "engine", "/api/go"),
      page("globals", "engine", "/api/globals"),
      page("Hash", "global-type", "/api/Hash"),
      page("base", "lua-stdlib", "/api/base"),
    ]);
    const nav = buildNav([], {
      globals: sections.globals.map((p) => ({ label: p.namespace, route: p.route })),
      globalTypes: sections.globalType.map((p) => ({ label: p.namespace, route: p.route })),
      luaStdlib: sections.luaStdlib.map((p) => ({ label: p.namespace, route: p.route })),
      engine: sections.engine.map((p) => ({ label: p.namespace, route: p.route })),
    });
    const apiNavOrder =
      nav.find((category) => category.id === "api")?.links.map((link) => link.label) ?? [];
    const apiIndexOrder = [
      sections.globals.length > 0 ? "Globals" : undefined,
      sections.globalType.length > 0 ? "Global types" : undefined,
      sections.luaStdlib.length > 0 ? "Lua Standard" : undefined,
      sections.engine.length > 0 ? "Defold" : undefined,
    ].filter((label): label is string => label !== undefined);

    expect(apiIndexOrder).toEqual(apiNavOrder);
    expect(sections.globals.map((p) => p.namespace)).toEqual(["globals"]);
    expect(sections.engine.map((p) => p.namespace)).toEqual(["go"]);
  });
});

describe("apiCardBadgeHtml", () => {
  test("maps an engine namespace with non-zero counts to the namespaceCountBadges pill HTML", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["material", { new: 8, changed: 0, deprecated: 0 }],
    ]);
    const html = apiCardBadgeHtml(page("material", "engine", "/api/material"), counts);
    expect(html).toContain("api-badge-count--new");
    expect(html).toContain("8 new");
  });

  test("a zero-count engine namespace maps to an empty string", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["go", { new: 0, changed: 0, deprecated: 0 }],
    ]);
    expect(apiCardBadgeHtml(page("go", "engine", "/api/go"), counts)).toBe("");
  });

  test("a version-independent (non-engine) namespace maps to an empty string", () => {
    const counts = new Map<string, NamespaceBadgeCounts>([
      ["Vector3", { new: 5, changed: 0, deprecated: 0 }],
    ]);
    expect(apiCardBadgeHtml(page("Vector3", "global-type", "/api/Vector3"), counts)).toBe("");
  });

  test("a namespace absent from the counts map maps to an empty string", () => {
    expect(apiCardBadgeHtml(page("go", "engine", "/api/go"), new Map())).toBe("");
  });
});

describe("CombinedIndex", () => {
  const mixed: ApiPage[] = [
    page("globals", "engine", "/api/globals"),
    page("Vector3", "global-type", "/api/Vector3"),
    page("base", "lua-stdlib", "/api/base"),
    page("go", "engine", "/api/go"),
    page("material", "engine", "/api/material"),
  ];

  test("renders all four groups and counts them all, not engine-only", () => {
    const html = String(CombinedIndex({ pages: mixed, versions: ["1.2", "1.3"] }));
    expect(html).toContain("Globals");
    expect(html).toContain("Global types");
    expect(html).toContain("Lua standard library");
    expect(html).toContain("Defold engine");
    // count is the sum across the four rendered groups (globals + globalType +
    // luaStdlib + engine = 1 + 1 + 1 + 2 = 5), not the engine-only 2.
    expect(html).toContain("5 namespaces documented");
  });

  test("places the change badge inside the engine card title row and emits none for a zero-count card", () => {
    const badgeCounts = new Map<string, NamespaceBadgeCounts>([
      ["material", { new: 8, changed: 0, deprecated: 0 }],
      ["go", { new: 0, changed: 0, deprecated: 0 }],
    ]);
    const html = String(
      CombinedIndex({
        pages: [page("material", "engine", "/api/material"), page("go", "engine", "/api/go")],
        versions: ["1.2", "1.3"],
        badgeCounts,
      }),
    );
    expect(html).toContain("api-badge-count--new");
    expect(html).toContain("8 new");
    // exactly one pill — material has it, go (zero-count) does not
    expect(html.split("api-badge-count--new").length - 1).toBe(1);
    // the pill sits in the card title flex row, after the material label
    expect(html).toContain("flex items-center gap-2");
    expect(html.indexOf("material")).toBeLessThan(html.indexOf("8 new"));
  });
});
