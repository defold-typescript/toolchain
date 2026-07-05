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

// A module whose types span multiple lines in the source: an inline object
// literal with per-member JSDoc, a wrapped union return, and plain single-line
// types. The extractor must collapse each type token to one comment-free line.
const NORMALIZE = `/**
 * Normalize demo.
 * @noResolution
 */
declare module 'norm.norm' {
	/**
	 * Configure it.
	 * @param opts the options
	 */
	export function configure(opts: {
		/** lerp factor */
		a?: number;
		/** label text */
		b?: string;
	}): boolean;

	/** Pick a heading. */
	export function pick(): "north"
		| "south"
		| "east";

	/** Already single-line: must be untouched. */
	export function plain(x: number): Hash | Url | undefined;
}
`;

// A module exercising the object-literal field tree: a param typed as an inline
// object literal with per-member JSDoc, one member whose own type is another
// object literal (tree recursion), a member with no JSDoc, and a plain param
// whose type is not an object literal (must emit no `fields`).
const FIELDS = `/**
 * Fields demo.
 * @noResolution
 */
declare module 'fld.fld' {
	/**
	 * Follow a target.
	 * @param options the options
	 */
	export function follow(options: {
		/** Lerp factor. */
		lerp?: number;
		/** Nested config. */
		nested?: {
			/** Deep flag. */
			deep?: boolean;
		};
		required: string;
	}): void;

	/** Plain param, no fields. */
	export function plain(x: number): boolean;
}
`;

type EmittedField = {
  name: string;
  doc: string;
  types: string[];
  is_optional: string;
  fields?: EmittedField[];
};

describe("extractApiDoc object-literal field tree", () => {
  const fn = (name: string) =>
    (
      extractApiDoc(FIELDS, "fld.fld") as { elements: Array<Record<string, unknown>> }
    ).elements.find((e) => e.type === "FUNCTION" && e.name === name) as {
      parameters: Array<{ name: string; types: string[]; fields?: EmittedField[] }>;
    };

  test("emits one field node per object-literal member, each with its member JSDoc and one-line type token", () => {
    const options = fn("follow").parameters[0];
    expect(options?.types[0]).toBe(
      "{ lerp?: number; nested?: { deep?: boolean; }; required: string; }",
    );
    const fields = options?.fields ?? [];
    expect(fields.map((f) => f.name)).toEqual(["lerp", "nested", "required"]);
    expect(fields[0]).toEqual({
      name: "lerp",
      doc: "Lerp factor.",
      types: ["number"],
      is_optional: "True",
    });
    expect(fields[2]).toEqual({
      name: "required",
      doc: "",
      types: ["string"],
      is_optional: "False",
    });
  });

  test("recurses into a member whose own type is an object literal", () => {
    const nested = fn("follow").parameters[0]?.fields?.[1];
    expect(nested?.name).toBe("nested");
    expect(nested?.types[0]).toBe("{ deep?: boolean; }");
    expect(nested?.fields).toEqual([
      { name: "deep", doc: "Deep flag.", types: ["boolean"], is_optional: "True" },
    ]);
  });

  test("emits no fields key for a plain (non-object-literal) param type", () => {
    const param = fn("plain").parameters[0];
    expect(param?.fields).toBeUndefined();
    expect(Object.hasOwn(param ?? {}, "fields")).toBe(false);
  });
});

describe("extractApiDoc type-token normalization", () => {
  const emitted = () =>
    extractApiDoc(NORMALIZE, "norm.norm") as {
      elements: Array<Record<string, unknown>>;
    };
  const fn = (name: string) =>
    emitted().elements.find((e) => e.type === "FUNCTION" && e.name === name) as {
      parameters: Array<{ name: string; types: string[] }>;
      returnvalues: Array<{ types: string[] }>;
    };

  test("collapses an inline object-literal param with member JSDoc to one comment-free line", () => {
    const token = fn("configure").parameters[0]?.types[0] ?? "";
    expect(token).not.toContain("\n");
    expect(token).not.toContain("/**");
    expect(token).not.toContain("//");
    expect(token).toBe("{ a?: number; b?: string; }");
  });

  test("collapses a multi-line union return type to one line", () => {
    const token = fn("pick").returnvalues[0]?.types[0] ?? "";
    expect(token).not.toContain("\n");
    expect(token).toBe('"north" | "south" | "east"');
  });

  test("leaves already single-line type tokens unchanged", () => {
    const plain = fn("plain");
    expect(plain.parameters[0]?.types[0]).toBe("number");
    expect(plain.returnvalues[0]?.types[0]).toBe("Hash | Url | undefined");
  });
});

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
