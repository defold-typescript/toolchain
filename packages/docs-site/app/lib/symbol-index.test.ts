import { describe, expect, test } from "bun:test";
import type { ApiModule } from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";
import { buildSymbolIndex } from "./symbol-index";

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
      route: "/api/go#getposition",
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
    expect(index["go.var_a"]?.route).toBe("/api/go#vara-unknown");
    expect(index["go.CONST_B"]?.route).toBe("/api/go#goconstb");
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
