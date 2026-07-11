import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";
import type { ApiVersion } from "./api-surface-loader";
import {
  buildSymbolIndex,
  symbolIndexFileForRoute,
  versionSymbolIndexRecords,
} from "./symbol-index";

function emptyModule(namespace: string): ApiModule {
  return {
    namespace,
    brief: "",
    description: "",
    functions: [],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
}

function page(namespace: string, module: Partial<ApiModule>): ApiPage {
  const full = { ...emptyModule(namespace), ...module, namespace };
  return {
    namespace,
    route: `/api/${namespace}`,
    brief: full.brief,
    module: full,
    translations: {},
    signatures: {},
    category: "engine",
  };
}

describe("buildSymbolIndex", () => {
  test("adds the namespace key and a qualified member key for a function", () => {
    const index = buildSymbolIndex([
      page("go", {
        brief: "Game object namespace",
        functions: [
          {
            name: "get_position",
            brief: "Gets the position",
            description: "",
            parameters: [],
            returnValues: [],
          },
        ],
      }),
    ]);
    expect(index.go).toEqual({ brief: "Game object namespace", route: "/api/go" });
    expect(index["go.get_position"]).toEqual({
      brief: "Gets the position",
      route: "/api/go#get_position",
    });
  });

  test("does not double-qualify an already-namespaced member name", () => {
    const index = buildSymbolIndex([
      page("go", {
        functions: [
          { name: "go.set", brief: "b", description: "", parameters: [], returnValues: [] },
        ],
      }),
    ]);
    expect(index["go.set"]).toBeDefined();
    expect(index["go.go.set"]).toBeUndefined();
  });

  test("strips HTML from briefs via htmlToDocText", () => {
    const index = buildSymbolIndex([
      page("msg", {
        functions: [
          {
            name: "post",
            brief: "<b>Post</b> a <i>message</i>",
            description: "",
            parameters: [],
            returnValues: [],
          },
        ],
      }),
    ]);
    expect(index["msg.post"]?.brief).not.toContain("<");
    expect(index["msg.post"]?.brief).not.toContain(">");
    expect(index["msg.post"]?.brief).toContain("Post");
    expect(index["msg.post"]?.route).toBe("/api/msg#post");
  });

  test("contributes a key for variables, constants, and properties", () => {
    const index = buildSymbolIndex([
      page("go", {
        variables: [{ name: "var_a", brief: "v", description: "", types: [] }],
        constants: [{ name: "go.CONST_B", brief: "c", description: "" }],
        properties: [{ name: "position", brief: "p", description: "", types: [] }],
      }),
    ]);
    expect(index["go.var_a"]?.route).toBe("/api/go#var_a-unknown");
    expect(index["go.CONST_B"]?.route).toBe("/api/go#goconst_b");
    expect(index["go.position"]?.route).toBe("/api/go#position-unknown");
  });

  test("prefers description over brief for the entry text", () => {
    const index = buildSymbolIndex([
      page("go", {
        constants: [{ name: "X", brief: "short", description: "full description" }],
      }),
    ]);
    expect(index["go.X"]?.brief).toBe("full description");
    expect(index["go.X"]?.route).toBe("/api/go#x");
  });

  test("includes the namespace key even when the module is otherwise empty", () => {
    const index = buildSymbolIndex([page("empty", { brief: "Empty ns brief" })]);
    expect(index.empty).toEqual({ brief: "Empty ns brief", route: "/api/empty" });
  });

  test("keys prefixless globals members bare, routed to /api/globals", () => {
    const index = buildSymbolIndex([
      page("globals", {
        functions: [
          {
            name: "hash",
            brief: "Hashes a string",
            description: "",
            parameters: [],
            returnValues: [],
          },
        ],
      }),
    ]);
    expect(index.hash).toEqual({ brief: "Hashes a string", route: "/api/globals#hash" });
    expect(index["globals.hash"]).toBeUndefined();
  });
});

describe("symbolIndexFileForRoute", () => {
  const versionIds = ["defold-1.12.4"];

  test("selects the default file on a canonical, unprefixed API route", () => {
    expect(symbolIndexFileForRoute("/api/go", versionIds)).toBe("symbol-index.json");
  });

  test("selects the version file on a historical route", () => {
    expect(symbolIndexFileForRoute("/api/defold-1.12.4/go", versionIds)).toBe(
      "symbol-index-defold-1.12.4.json",
    );
  });

  test("ignores a query/hash suffix and an unknown version prefix", () => {
    expect(symbolIndexFileForRoute("/api/go?x=1#y", versionIds)).toBe("symbol-index.json");
    expect(symbolIndexFileForRoute("/api/defold-9.9.9/go", versionIds)).toBe("symbol-index.json");
  });
});

describe("versionSymbolIndexRecords", () => {
  const versions: ApiVersion[] = [
    { id: "cur", isDefault: true },
    { id: "old", isDefault: false },
  ];

  function pagesForVersion(versionId: string): ApiPage[] {
    const prefix = versionId === "cur" ? "" : `/${versionId}`;
    const ns = versionId === "cur" ? "go" : "wmath";
    return [{ ...page(ns, { brief: `${ns} brief` }), route: `/api${prefix}/${ns}` }];
  }

  test("emits one version-correct index per non-default version, keyed to its prefixed routes", () => {
    const records = versionSymbolIndexRecords(versions, pagesForVersion);
    expect(records.map((r) => r.version)).toEqual(["old"]);
    expect(records[0]?.index.wmath).toEqual({ brief: "wmath brief", route: "/api/old/wmath" });
    // never silently falls back to the default surface
    expect(records[0]?.index.go).toBeUndefined();
  });
});
