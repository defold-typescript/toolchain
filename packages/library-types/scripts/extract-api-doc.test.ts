import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { extractApiDoc } from "./extract-api-doc";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function generatedModules(): string[] {
  return readdirSync(join(PACKAGE_ROOT, "generated"))
    .filter((f) => f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -".d.ts".length))
    .sort();
}

// A fixed module mixing every construct the extractor must handle: module-level
// summary + import `@example`, a bare `type` alias, an exported `const`, and a
// documented function with a required param, an optional param, a `@returns`, and
// a function-level `@example`.
const DEMO = `/** @noSelfInFile */

/**
 * Demo library summary.
 * @example \`import * as demo from 'demo.demo'\`
 * @noResolution
 */
declare module 'demo.demo' {
	type Thing = number | string;

	export const VERSION: number;

	/**
	 * Do the demo thing.
	 * @param {string} name - the name to use
	 * @param {number} [times] - optional repeat count
	 * @returns {boolean} whether it worked
	 * @example demo.run("x")
	 */
	export function run(name: string, times?: number): boolean;
}
`;

describe("extractApiDoc", () => {
  test("emits an { info, elements } object matching the parseDefoldApiDoc schema", () => {
    const emitted = extractApiDoc(DEMO, "demo.demo") as {
      info: { namespace: string; brief: string; description: string };
      elements: Array<Record<string, unknown>>;
    };

    expect(emitted.info.namespace).toBe("demo.demo");
    expect(emitted.info.brief).toBe("Demo library summary.");
    expect(emitted.info.description).toBe("Demo library summary.");

    const typedef = emitted.elements.find((e) => e.type === "TYPEDEF");
    expect(typedef).toEqual({ type: "TYPEDEF", name: "Thing" });

    const variable = emitted.elements.find((e) => e.type === "VARIABLE");
    expect(variable).toEqual({ type: "VARIABLE", name: "VERSION", types: ["number"] });

    const fn = emitted.elements.find((e) => e.type === "FUNCTION");
    expect(fn).toEqual({
      type: "FUNCTION",
      name: "run",
      brief: "Do the demo thing.",
      description: "Do the demo thing.",
      parameters: [
        { name: "name", doc: "the name to use", types: ["string"], is_optional: "False" },
        { name: "times", doc: "optional repeat count", types: ["number"], is_optional: "True" },
      ],
      returnvalues: [{ name: "", doc: "whether it worked", types: ["boolean"] }],
      examples: 'demo.run("x")',
    });
  });

  test("round-trips through parseDefoldApiDoc into a populated ApiModule", () => {
    const module = parseDefoldApiDoc(extractApiDoc(DEMO, "demo.demo"));
    expect(module.namespace).toBe("demo.demo");
    expect(module.typedefs.map((t) => t.name)).toEqual(["Thing"]);
    expect(module.variables.map((v) => v.name)).toEqual(["VERSION"]);

    const run = module.functions.find((f) => f.name === "run");
    expect(run).toBeDefined();
    if (!run) return;
    expect(run.parameters.map((p) => p.name)).toEqual(["name", "times"]);
    expect(run.parameters.map((p) => p.isOptional)).toEqual([false, true]);
    expect(run.returnValues[0]?.types).toEqual(["boolean"]);
    expect(run.examples).toBe('demo.run("x")');
  });

  // Drift guard, mirroring the codemodDeclaration guard in
  // sync-library-types.test.ts: the committed api-doc/<module>.json must be
  // exactly what extractApiDoc produces from the current generated/<module>.d.ts.
  describe("committed api-doc fixtures match extractApiDoc(generated)", () => {
    for (const moduleName of generatedModules()) {
      test(moduleName, () => {
        const source = readFileSync(join(PACKAGE_ROOT, "generated", `${moduleName}.d.ts`), "utf8");
        const committed = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, "api-doc", `${moduleName}.json`), "utf8"),
        );
        expect(extractApiDoc(source, moduleName)).toEqual(committed);
      });
    }
  });

  test("every generated module has exactly one api-doc fixture (no stale or missing)", () => {
    const fixtures = readdirSync(join(PACKAGE_ROOT, "api-doc"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    expect(fixtures).toEqual(generatedModules());
  });
});
