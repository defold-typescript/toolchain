import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { loadVendoredNativeRegistry } from "./library-registry";

// Every NavMesh and Crowd method reads its table's `instance` handle from stack
// slot 1, so a dot call raises a bad-argument error or reads the wrong slot; only
// TSTL's emit shows which call form the shipped declaration produces.
describe("the shipped detour declaration emits NavMesh and Crowd methods as colon calls", () => {
  test("a consumer transpiles with the mesh and crowd passed as self", () => {
    const entry = loadVendoredNativeRegistry().find((e) => e.namespace === "detour");
    expect(entry).toBeDefined();
    const declaration = readFileSync(entry?.declarationPath ?? "", "utf8");

    const consumer = [
      "export function navigate(data: string): number {",
      "  const mesh = detour.init(data);",
      "  const from = vmath.vector3(0, 0, 0);",
      "  const to = vmath.vector3(10, 0, 10);",
      "  const path = mesh.find_path(from, to);",
      "  const crowd = mesh.create_crowd(0.6);",
      "  const agent = crowd.add_agent(from, 0.6, 2, 8, 3.5, 0);",
      "  crowd.set_target(to, agent);",
      "  const agents = crowd.update(1 / 60);",
      "  mesh.delete();",
      "  const first = path.get(0);",
      "  return first === undefined ? 0 : (agents.get(agent)?.position.x ?? first.area);",
      "}",
    ].join("\n");

    const project = transpileProject({
      files: { "detour.d.ts": declaration, "main.ts": consumer },
    });
    const errors = project.diagnostics.filter((d) => d.category !== "warning");
    expect(errors).toEqual([]);
    expect(project.lua["main.ts"]).toMatchSnapshot();
  });
});
