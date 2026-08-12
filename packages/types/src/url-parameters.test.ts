import { describe, expect, test } from "bun:test";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { type ApiModule, parseDefoldApiDoc } from "./api-doc";
import {
  classifyUrlParameter,
  collectParameterSlots,
  collectUrlParameterSlots,
  parameterTypesSatisfyClass,
  type UrlParameterSource,
  type UrlParameterTable,
} from "./url-parameters";

function currentTargetSources(namespaces?: readonly string[]): UrlParameterSource[] {
  const target = loadApiTargets().find((candidate) => candidate.default === true);
  if (!target) throw new Error("api-targets.json: no default target");
  return loadTargetModules(target)
    .filter((entry) => namespaces === undefined || namespaces.includes(entry.namespace))
    .map((entry) => ({
      module: parseDefoldApiDoc(entry.doc),
      ...(entry.skipFunctions ? { skipFunctions: entry.skipFunctions } : {}),
    }));
}

function keys(sources: readonly UrlParameterSource[]): string[] {
  return collectUrlParameterSlots(sources).map((slot) => `${slot.fqn}#${slot.parameter}`);
}

function allKeys(sources: readonly UrlParameterSource[]): string[] {
  return collectParameterSlots(sources).map((slot) => `${slot.fqn}#${slot.parameter}`);
}

function moduleWith(namespace: string, fn: ApiModule["functions"][number]): ApiModule {
  return {
    namespace,
    brief: "",
    description: "",
    functions: [fn],
    variables: [],
    constants: [],
    properties: [],
    typedefs: [],
  };
}

describe("collectUrlParameterSlots", () => {
  test("keeps the triple-typed parameters of the current target's go module", () => {
    const slots = keys(currentTargetSources(["go"]));
    expect(slots).toContain("go.exists#url");
    expect(slots).not.toContain("go.animate#property");
  });

  test("keeps a parameter whose types are a superset of the triple", () => {
    expect(keys(currentTargetSources(["go"]))).toContain("go.delete#id");
  });

  test("matches ref-doc type tokens case-insensitively", () => {
    const module = moduleWith("scene", {
      name: "scene.address",
      brief: "",
      description: "",
      parameters: [
        {
          name: "target",
          doc: "the thing addressed",
          types: ["String", "Hash", "URL"],
          isOptional: false,
        },
      ],
      returnValues: [],
    });
    expect(keys([{ module }])).toEqual(["scene.address#target"]);
  });

  test("omits every function the target hands to the authored overloads", () => {
    const slots = keys(currentTargetSources(["go", "msg"]));
    expect(slots).not.toContain("go.get#url");
    expect(slots).not.toContain("go.set#url");
    expect(slots).not.toContain("msg.post#receiver");
    expect(collectUrlParameterSlots(currentTargetSources(["msg"]))).toEqual([]);
  });

  test("carries the module namespace and the ref-doc prose onto each slot", () => {
    const slot = collectUrlParameterSlots(currentTargetSources(["go"])).find(
      (candidate) => candidate.fqn === "go.exists" && candidate.parameter === "url",
    );
    expect(slot?.module).toBe("go");
    expect(slot?.doc).toBe("url of the game object to check");
  });
});

describe("collectParameterSlots", () => {
  test("keeps a node-id parameter the address filter drops, carrying its declared types", () => {
    const sources = currentTargetSources(["gui"]);
    const slot = collectParameterSlots(sources).find(
      (candidate) => candidate.fqn === "gui.get_node" && candidate.parameter === "id",
    );
    expect(slot?.types).toEqual(["string", "hash"]);
    expect(slot?.doc).toBe("id of the node to retrieve");
    expect(keys(sources)).not.toContain("gui.get_node#id");
  });

  test("keeps the triple-typed parameters the address filter keeps", () => {
    expect(allKeys(currentTargetSources(["go"]))).toContain("go.exists#url");
  });

  test("keeps an animation-id parameter the address filter drops, carrying its declared types", () => {
    const sources = currentTargetSources(["sprite"]);
    const slot = collectParameterSlots(sources).find(
      (candidate) => candidate.fqn === "sprite.play_flipbook" && candidate.parameter === "id",
    );
    expect(slot?.types).toEqual(["string", "hash"]);
    expect(slot?.doc).toBe("hashed id of the animation to play");
    expect(keys(sources)).not.toContain("sprite.play_flipbook#id");
    // The address companion is a live slot of the same function, and the only
    // one on it carrying the triple.
    expect(keys(sources)).toContain("sprite.play_flipbook#url");
  });

  test("omits every function the target hands to the authored overloads", () => {
    const slots = allKeys(currentTargetSources(["msg"]));
    expect(slots).not.toContain("msg.post#receiver");
    expect(slots).not.toContain("msg.url#urlstring");
  });
});

describe("parameterTypesSatisfyClass", () => {
  test("a node-id class needs the string/hash pair, not the address triple", () => {
    expect(parameterTypesSatisfyClass(["string", "hash"], "gui-node")).toBe(true);
    expect(parameterTypesSatisfyClass(["string", "hash", "url"], "gui-node")).toBe(true);
    expect(parameterTypesSatisfyClass(["url"], "gui-node")).toBe(false);
  });

  test("an animation-id class needs the string/hash pair, not the address triple", () => {
    expect(parameterTypesSatisfyClass(["string", "hash"], "animation")).toBe(true);
    expect(parameterTypesSatisfyClass(["string", "hash", "url"], "animation")).toBe(true);
    expect(parameterTypesSatisfyClass(["string"], "animation")).toBe(false);
  });

  test("an address class needs the whole triple", () => {
    for (const addressClass of ["game-object", "component", "either"] as const) {
      expect(parameterTypesSatisfyClass(["string", "hash", "url"], addressClass)).toBe(true);
      expect(parameterTypesSatisfyClass(["string", "hash"], addressClass)).toBe(false);
    }
  });

  test("matches ref-doc type tokens case-insensitively", () => {
    expect(parameterTypesSatisfyClass(["String", "Hash", "URL"], "either")).toBe(true);
  });

  test("an unclassified slot is satisfied by any shape", () => {
    expect(parameterTypesSatisfyClass([], "none")).toBe(true);
  });
});

describe("classifyUrlParameter", () => {
  const table: UrlParameterTable = [
    {
      fqn: "go.get_position",
      parameter: "id",
      class: "game-object",
      source: "generated",
      evidence: "id of the game object instance",
    },
  ];

  test("returns the recorded class for a key the table carries", () => {
    expect(classifyUrlParameter(table, "go.get_position", "id")).toBe("game-object");
  });

  test("defaults an unclassified parameter to none", () => {
    expect(classifyUrlParameter(table, "model.get_mesh_enabled", "mesh_id")).toBe("none");
    expect(classifyUrlParameter(table, "go.get_position", "unknown")).toBe("none");
    expect(classifyUrlParameter([], "go.get_position", "id")).toBe("none");
  });
});
