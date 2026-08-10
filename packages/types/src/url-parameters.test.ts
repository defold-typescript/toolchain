import { describe, expect, test } from "bun:test";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { type ApiModule, parseDefoldApiDoc } from "./api-doc";
import {
  classifyUrlParameter,
  collectUrlParameterSlots,
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
