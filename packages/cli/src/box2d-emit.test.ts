import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { transpileProject } from "@defold-typescript/transpiler";
import { loadVendoredNativeRegistry } from "./library-registry";

// Every box2d userdata method reads its object from stack slot 1, and the extension
// calls each listener and ray-cast callback with only its own arguments; only TSTL's
// emit shows which call form and which callback parameters the shipped declaration
// produces.
describe("the shipped box2d declaration emits methods with self and callbacks without", () => {
  test("a consumer transpiles with userdata passed as self and no callback receiver", () => {
    const entry = loadVendoredNativeRegistry().find((e) => e.namespace === "box2d");
    expect(entry).toBeDefined();
    const declaration = readFileSync(entry?.declarationPath ?? "", "utf8");

    const consumer = [
      "export function simulate(): number {",
      "  const world = box2d.NewWorld(vmath.vector3(0, -10, 0));",
      "  const body = world.CreateBody({ type: box2d.b2BodyType.b2_dynamicBody });",
      "  const shape = box2d.NewCircleShape();",
      "  shape.SetRadius(0.5);",
      "  body.CreateFixture(shape, 1);",
      "  world.SetContactListener({",
      "    BeginContact: (contact) => {",
      "      contact.SetEnabled(false);",
      "    },",
      "  });",
      "  let hits = 0;",
      "  world.RayCast(",
      "    (fixture, point, normal, fraction) => {",
      "      hits += 1;",
      "      return fraction;",
      "    },",
      "    vmath.vector3(-5, 0, 0),",
      "    vmath.vector3(5, 0, 0),",
      "  );",
      "  world.Step(1 / 60, 8, 3);",
      "  return hits;",
      "}",
    ].join("\n");

    const project = transpileProject({
      files: { "box2d.d.ts": declaration, "main.ts": consumer },
    });
    const errors = project.diagnostics.filter((d) => d.category !== "warning");
    expect(errors).toEqual([]);
    expect(project.lua["main.ts"]).toMatchSnapshot();
  });
});
