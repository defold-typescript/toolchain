import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { extractApiDoc } from "./extract-api-doc";
import { readLualsTargets } from "./sync-luals-types";
import { readMarkdownTargets } from "./sync-markdown-types";
import { readScriptApiTargets } from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The api-doc drift guard covers only the ts-defold front-end, whose generated
// `<moduleId>.d.ts` each round-trips to an `api-doc/<moduleId>.json` fixture via
// `extractApiDoc`. A luals namespace's api-doc is lowered from its `LibraryModel`
// (`lower-api-doc.ts`), a script_api namespace's from its ref-doc `doc`
// (`sync-script-api-types.ts`), and a markdown namespace's from its parsed README
// `doc` (`sync-markdown-types.ts`), none extracted from the emitted `.d.ts`, so
// all three are excluded here and guarded by their own front-end tests.
function externalFrontEndNamespaces(): Set<string> {
  return new Set([
    ...readLualsTargets(PACKAGE_ROOT).map((t) => t.namespace),
    ...readScriptApiTargets(PACKAGE_ROOT).map((t) => t.namespace),
    ...readMarkdownTargets(PACKAGE_ROOT).map((t) => t.namespace),
  ]);
}

function generatedModules(): string[] {
  const excluded = externalFrontEndNamespaces();
  return readdirSync(join(PACKAGE_ROOT, "generated"))
    .filter((f) => f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -".d.ts".length))
    .filter((name) => !excluded.has(name))
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

const INTERFACE_BACKED = `/**
 * Interface-backed module.
 * @noResolution
 */
declare module 'iface.iface' {
	interface Core {
		/** Run by id. */
		go(id: number): void;
		/** Item count. */
		COUNT: number;
		/** Construct one. */
		['new'](tag?: string): Inst;
	}
	interface Inst {}
	type T = Readonly<Core>;
	const v: T;
	export = v;
}
`;

const INTERFACE_INTERSECTION = `/**
 * Interface intersection module.
 * @noResolution
 */
declare module 'inter.inter' {
	interface SomeMap {}
	interface Core {
		/** Pan camera. */
		pan(x: number): boolean;
	}
	type T = SomeMap & Readonly<Core>;
	const exportThis: T;
	export = exportThis;
}
`;

const REFERENCED_INTERFACE = `/**
 * Referenced interface module.
 * @noResolution
 */
declare module 'ref.ref' {
	interface Inst {
		/** Save the instance. */
		save(): boolean;
		/** Instance tag. */
		tag: string;
	}

	/** Create one. */
	export function create(): Inst;
}
`;

// A module covering every site the `@deprecated` carrier must reach: a tagged
// function with text, a bare tag, a tag alongside a real summary, a tagged
// exported `const`, an untagged control, and a referenced interface whose method
// and property are each tagged (the `TYPEDEF` path).
const DEPRECATED = `/**
 * Deprecation demo.
 * @noResolution
 */
declare module 'dep.dep' {
	/** @deprecated Use \`fresh\` instead. */
	export function stale(): void;

	/** @deprecated */
	export function bare(): void;

	/**
	 * Still documented.
	 * @deprecated Prefer \`fresh\`.
	 */
	export function documented(x: number): boolean;

	/** @deprecated Superseded by \`FLAG\`. */
	export const OLD_FLAG: number;

	/** Current API. */
	export function fresh(): void;

	/** Make a legacy handle. */
	export function create(): Legacy;

	interface Legacy {
		/** @deprecated Use \`save\`. */
		store(): boolean;
		/** @deprecated */
		tag: string;
	}
}
`;

// The `export =` interface-backed shape: the same tag must survive the
// `exportedValueInterfaces` walk for both a method and a property signature.
const DEPRECATED_INTERFACE = `/**
 * Deprecation interface demo.
 * @noResolution
 */
declare module 'depi.depi' {
	interface Core {
		/** @deprecated Use \`next\`. */
		old(): void;
		/** @deprecated */
		COUNT: number;
		/** Current. */
		next(): void;
	}
	type T = Readonly<Core>;
	const v: T;
	export = v;
}
`;

// The interface *declaration* itself tagged, rather than its members: a tag with
// text, a bare tag, and an untagged control, each referenced so it reaches a
// TYPEDEF element.
const DEPRECATED_TYPEDEF = `/**
 * Deprecated typedef demo.
 * @noResolution
 */
declare module 'dept.dept' {
	/** @deprecated because X */
	interface Told {
		keep(): void;
	}
	/** @deprecated */
	interface Tbare {
		/** @deprecated Use \`next\`. */
		member(): void;
	}
	/** A current type. */
	interface Tfresh {
		keep(): void;
	}
	export function a(): Told;
	export function b(): Tbare;
	export function c(): Tfresh;
}
`;

type EmittedField = {
  name: string;
  doc: string;
  types: string[];
  is_optional: string;
  fields?: EmittedField[];
};

describe("extractApiDoc interface-backed module exports", () => {
  test("resolves an export-assigned Readonly interface into functions and variables", () => {
    const module = parseDefoldApiDoc(extractApiDoc(INTERFACE_BACKED, "iface.iface"));

    expect(module.functions.map((f) => f.name)).toEqual(["go", "new"]);
    expect(module.variables.map((v) => v.name)).toEqual(["COUNT"]);

    const go = module.functions.find((f) => f.name === "go");
    expect(go?.brief).toBe("Run by id.");
    expect(go?.parameters.map((p) => [p.name, p.types, p.isOptional])).toEqual([
      ["id", ["number"], false],
    ]);

    const count = module.variables.find((v) => v.name === "COUNT");
    expect(count?.types).toEqual(["number"]);

    const ctor = module.functions.find((f) => f.name === "new");
    expect(ctor?.parameters.map((p) => [p.name, p.types, p.isOptional])).toEqual([
      ["tag", ["string"], true],
    ]);
  });

  test("resolves a Readonly interface inside an intersection", () => {
    const module = parseDefoldApiDoc(extractApiDoc(INTERFACE_INTERSECTION, "inter.inter"));

    expect(module.functions.map((f) => f.name)).toEqual(["pan"]);
    expect(module.functions[0]?.returnValues[0]?.types).toEqual(["boolean"]);
  });

  test("emits referenced interfaces as typedefs with members", () => {
    const module = parseDefoldApiDoc(extractApiDoc(REFERENCED_INTERFACE, "ref.ref"));

    expect(module.functions.map((f) => f.name)).toEqual(["create"]);
    const inst = module.typedefs.find((t) => t.name === "Inst");
    expect(inst?.functions?.map((f) => f.name)).toEqual(["save"]);
    expect(inst?.functions?.[0]?.brief).toBe("Save the instance.");
    expect(inst?.functions?.[0]?.returnValues[0]?.types).toEqual(["boolean"]);
    expect(inst?.properties).toEqual([
      { name: "tag", brief: "Instance tag.", description: "Instance tag.", types: ["string"] },
    ]);
  });

  test("leaves the top-level declaration extraction shape unchanged", () => {
    expect(extractApiDoc(DEMO, "demo.demo")).toEqual({
      info: {
        namespace: "demo.demo",
        brief: "Demo library summary.",
        description: "Demo library summary.",
      },
      elements: [
        { type: "TYPEDEF", name: "Thing" },
        { type: "VARIABLE", name: "VERSION", types: ["number"] },
        {
          type: "FUNCTION",
          name: "run",
          brief: "Do the demo thing.",
          description: "Do the demo thing.",
          parameters: [
            {
              name: "name",
              doc: "the name to use",
              types: ["string"],
              is_optional: "False",
            },
            {
              name: "times",
              doc: "optional repeat count",
              types: ["number"],
              is_optional: "True",
            },
          ],
          returnvalues: [{ name: "", doc: "whether it worked", types: ["boolean"] }],
          examples: 'demo.run("x")',
        },
      ],
    });
  });
});

// A string-named ambient module with no `export =`: ts-defold vendors the
// surface as bare `function`/`const` with no `export` keyword (`rendy.rendy`,
// `nakama.util.log`). Every top-level declaration is still public API.
const BARE = `/**
 * Bare module.
 * @noResolution
 */
declare module 'bare.bare' {
	type Id = Hash | string;

	/** Make it. */
	function make(id: Id): void;

	/** Item count. */
	const COUNT: number;
}
`;

// Nested `export namespace` blocks (`bridge.bridge`), including a member name
// reused across two namespaces that must not collide.
const NAMESPACED = `/**
 * Namespaced module.
 * @noResolution
 */
declare module 'ns.ns' {
	export namespace alpha {
		/** Alpha check. */
		export function is_supported(): boolean;
	}
	export namespace beta {
		/** Beta check. */
		export function is_supported(): boolean;
	}
}
`;

// A `export =` module (`squid`, `starly`): the surface is the re-exported
// value's interface, so a bare internal helper stays unemitted.
const EXPORT_ASSIGN = `/**
 * Export-assign module.
 * @noResolution
 */
declare module 'ea.ea' {
	interface Core {
		/** Go. */
		go(): void;
	}
	/** Internal helper, behind the re-export. */
	function internal(): void;
	const v: Core;
	export = v;
}
`;

describe("extractApiDoc bare and namespaced declarations", () => {
  test("emits bare (non-export) declarations in a module without export =", () => {
    const module = parseDefoldApiDoc(extractApiDoc(BARE, "bare.bare"));
    expect(module.functions.map((f) => f.name)).toEqual(["make"]);
    expect(module.functions[0]?.brief).toBe("Make it.");
    expect(module.variables.map((v) => v.name)).toEqual(["COUNT"]);
    expect(module.typedefs.map((t) => t.name)).toEqual(["Id"]);
  });

  test("qualifies nested namespace members so same-named members stay distinct", () => {
    const module = parseDefoldApiDoc(extractApiDoc(NAMESPACED, "ns.ns"));
    expect(module.functions.map((f) => f.name)).toEqual([
      "alpha.is_supported",
      "beta.is_supported",
    ]);
  });

  test("suppresses bare internal declarations behind an export =", () => {
    const module = parseDefoldApiDoc(extractApiDoc(EXPORT_ASSIGN, "ea.ea"));
    expect(module.functions.map((f) => f.name)).toEqual(["go"]);
    expect(module.functions.map((f) => f.name)).not.toContain("internal");
  });
});

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

describe("extractApiDoc @deprecated carrier", () => {
  const element = (source: string, moduleName: string, type: string, name: string) => {
    const { elements } = extractApiDoc(source, moduleName) as {
      elements: Array<Record<string, unknown>>;
    };
    return elements.find((e) => e.type === type && e.name === name) ?? {};
  };

  test("carries a tagged function's text onto its element", () => {
    expect(element(DEPRECATED, "dep.dep", "FUNCTION", "stale").deprecated).toBe(
      "Use `fresh` instead.",
    );
  });

  test("emits a present-but-empty key for a bare tag", () => {
    const bare = element(DEPRECATED, "dep.dep", "FUNCTION", "bare");
    expect(Object.hasOwn(bare, "deprecated")).toBe(true);
    expect(bare.deprecated).toBe("");
  });

  test("emits no key at all for an untagged function", () => {
    expect(Object.hasOwn(element(DEPRECATED, "dep.dep", "FUNCTION", "fresh"), "deprecated")).toBe(
      false,
    );
  });

  test("leaves an existing summary untouched when the tag is added alongside it", () => {
    const documented = element(DEPRECATED, "dep.dep", "FUNCTION", "documented");
    expect(documented.brief).toBe("Still documented.");
    expect(documented.description).toBe("Still documented.");
    expect(documented.deprecated).toBe("Prefer `fresh`.");
  });

  test("carries the tag onto an exported const's VARIABLE element", () => {
    expect(element(DEPRECATED, "dep.dep", "VARIABLE", "OLD_FLAG").deprecated).toBe(
      "Superseded by `FLAG`.",
    );
  });

  test("carries the tag onto a referenced interface's typedef members", () => {
    const typedef = element(DEPRECATED, "dep.dep", "TYPEDEF", "Legacy") as {
      functions?: Array<Record<string, unknown>>;
      properties?: Array<Record<string, unknown>>;
    };
    expect(typedef.functions?.find((f) => f.name === "store")?.deprecated).toBe("Use `save`.");
    const tag = typedef.properties?.find((p) => p.name === "tag") ?? {};
    expect(Object.hasOwn(tag, "deprecated")).toBe(true);
    expect(tag.deprecated).toBe("");
  });

  test("carries the tag through an export-assigned interface's method and property", () => {
    expect(element(DEPRECATED_INTERFACE, "depi.depi", "FUNCTION", "old").deprecated).toBe(
      "Use `next`.",
    );
    const count = element(DEPRECATED_INTERFACE, "depi.depi", "VARIABLE", "COUNT");
    expect(Object.hasOwn(count, "deprecated")).toBe(true);
    expect(count.deprecated).toBe("");
    expect(
      Object.hasOwn(element(DEPRECATED_INTERFACE, "depi.depi", "FUNCTION", "next"), "deprecated"),
    ).toBe(false);
  });

  test("carries a tag on the interface declaration itself onto its TYPEDEF element", () => {
    expect(element(DEPRECATED_TYPEDEF, "dept.dept", "TYPEDEF", "Told").deprecated).toBe(
      "because X",
    );
  });

  test("emits a present-but-empty TYPEDEF key for a bare tag on the declaration, leaving member keys intact", () => {
    const bare = element(DEPRECATED_TYPEDEF, "dept.dept", "TYPEDEF", "Tbare") as {
      deprecated?: unknown;
      functions?: Array<Record<string, unknown>>;
    };
    expect(Object.hasOwn(bare, "deprecated")).toBe(true);
    expect(bare.deprecated).toBe("");
    expect(bare.functions?.find((f) => f.name === "member")?.deprecated).toBe("Use `next`.");
  });

  test("emits no TYPEDEF key for an untagged interface declaration", () => {
    expect(
      Object.hasOwn(element(DEPRECATED_TYPEDEF, "dept.dept", "TYPEDEF", "Tfresh"), "deprecated"),
    ).toBe(false);
    expect(Object.hasOwn(element(DEPRECATED, "dep.dep", "TYPEDEF", "Legacy"), "deprecated")).toBe(
      false,
    );
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

  test("drops ts-defold's 'definition stub' marker so info.description stays empty", () => {
    const stub = `/**
 * This is a definition stub with incomplete or untested signatures.
 * Contributions to improve the accuracy of these types are welcome.
 * @see {@link https://github.com/owner/repo|Github Source}
 * @noResolution
 */
declare module 'stub.stub' {
	export const VERSION: number;
}`;
    const emitted = extractApiDoc(stub, "stub.stub") as {
      info: { brief: string; description: string };
    };
    expect(emitted.info.brief).toBe("");
    expect(emitted.info.description).toBe("");
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
    const excluded = externalFrontEndNamespaces();
    const fixtures = readdirSync(join(PACKAGE_ROOT, "api-doc"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .filter((name) => !excluded.has(name))
      .sort();
    expect(fixtures).toEqual(generatedModules());
  });
});

// Every branch the alias-shape reader must separate: an object literal reached
// from a published parameter, a union / function type / empty literal that stays
// bare even when reached, a literal nothing reaches, an alias hop ending in a
// literal, and an interface carrying a member identical to the alias literal's
// so both member readers can be compared against each other.
const ALIAS_SHAPES = `/**
 * Alias shape demo.
 * @noResolution
 */
declare module 'alias.alias' {
	/** Options for showing. */
	type ShowOptions = {
		/** Clear the stack. */
		clear?: boolean;
		/** Keep the sequence. */
		sequential: boolean;
		/** Run the transition. */
		run(a: string): void;
	};

	/** A screen id. */
	type ScreenId = number | string;

	/** A callback. */
	type Callback = () => void;

	/** Carries nothing. */
	type Data = {};

	/** Reached by nothing. */
	type Hidden = { secret: number };

	/** One hop to the shape. */
	type Alias = Deep;

	/** The shape behind the hop. */
	type Deep = {
		/** Deep field. */
		deep: number;
	};

	interface Inst {
		/** Optional tag. */
		tag?: string;
		/** Run the transition. */
		run(a: string): void;
	}

	/** Show a screen. */
	export function show(id: ScreenId, options?: ShowOptions): Data;

	/** Go deep. */
	export function dive(a: Alias): void;

	/** Make an instance. */
	export function make(): Inst;

	/** Take a callback. */
	export function on(cb: Callback): void;
}
`;

// An `export =` module: `plumbing` is bare, so it is plumbing behind the
// re-exported value and stays unemitted — the alias only it names is therefore
// unreachable and must not be populated.
const ALIAS_UNREACHABLE = `/**
 * Internal alias demo.
 * @noResolution
 */
declare module 'ax.ax' {
	type Internal = { hidden: number };

	function plumbing(x: Internal): void;

	interface Core {
		/** Go. */
		go(): void;
	}
	type T = Readonly<Core>;
	const v: T;
	export = v;
}
`;

describe("extractApiDoc alias-backed shapes", () => {
  const elementsOf = (source: string, moduleName: string) =>
    (extractApiDoc(source, moduleName) as { elements: Array<Record<string, unknown>> }).elements;
  const named = (source: string, moduleName: string, name: string) =>
    elementsOf(source, moduleName).find((e) => e.name === name) ?? {};
  const aliasElement = (name: string) =>
    named(ALIAS_SHAPES, "alias.alias", name) as {
      type?: string;
      functions?: Array<Record<string, unknown>>;
      properties?: Array<Record<string, unknown>>;
    };

  test("populates an alias whose RHS is an object literal, carrying each member's docs", () => {
    const opts = aliasElement("ShowOptions");
    expect(opts.type).toBe("TYPEDEF");
    expect(opts.properties).toEqual([
      {
        name: "clear",
        brief: "Clear the stack.",
        description: "Clear the stack.",
        types: ["boolean"],
        is_optional: "True",
      },
      {
        name: "sequential",
        brief: "Keep the sequence.",
        description: "Keep the sequence.",
        types: ["boolean"],
      },
    ]);
  });

  test("writes is_optional on the optional member only, on both member readers", () => {
    const optionality = (properties: Array<Record<string, unknown>> | undefined) =>
      (properties ?? []).map((p) => [p.name, Object.hasOwn(p, "is_optional"), p.is_optional]);

    expect(optionality(aliasElement("ShowOptions").properties)).toEqual([
      ["clear", true, "True"],
      ["sequential", false, undefined],
    ]);
    expect(optionality(aliasElement("Inst").properties)).toEqual([["tag", true, "True"]]);
  });

  test("reads a method in an alias literal with the same reader the interface path uses", () => {
    const fromAlias = aliasElement("ShowOptions").functions;
    const fromInterface = aliasElement("Inst").functions;
    expect(fromAlias).toHaveLength(1);
    expect(fromAlias?.[0]).toEqual({
      type: "FUNCTION",
      name: "run",
      brief: "Run the transition.",
      description: "Run the transition.",
      parameters: [{ name: "a", doc: "", types: ["string"], is_optional: "False" }],
      returnvalues: [],
    });
    expect(fromAlias?.[0]).toEqual(fromInterface?.[0] ?? {});
  });

  test("leaves a reachable non-object alias bare: union, function type, empty literal", () => {
    for (const name of ["ScreenId", "Callback", "Data"]) {
      expect(named(ALIAS_SHAPES, "alias.alias", name)).toEqual({ type: "TYPEDEF", name });
    }
  });

  test("leaves an alias no emitted member's type names bare", () => {
    expect(named(ALIAS_SHAPES, "alias.alias", "Hidden")).toEqual({
      type: "TYPEDEF",
      name: "Hidden",
    });
  });

  test("follows an alias hop, populating the shape behind it and not the hop", () => {
    expect(named(ALIAS_SHAPES, "alias.alias", "Alias")).toEqual({ type: "TYPEDEF", name: "Alias" });
    expect(aliasElement("Deep").properties).toEqual([
      { name: "deep", brief: "Deep field.", description: "Deep field.", types: ["number"] },
    ]);
  });

  test("leaves an alias named only by an unemitted declaration bare", () => {
    expect(named(ALIAS_UNREACHABLE, "ax.ax", "Internal")).toEqual({
      type: "TYPEDEF",
      name: "Internal",
    });
  });

  test("merges into the element already pushed, preserving name and position", () => {
    expect(elementsOf(ALIAS_SHAPES, "alias.alias").map((e) => [e.type, e.name])).toEqual([
      ["TYPEDEF", "ShowOptions"],
      ["TYPEDEF", "ScreenId"],
      ["TYPEDEF", "Callback"],
      ["TYPEDEF", "Data"],
      ["TYPEDEF", "Hidden"],
      ["TYPEDEF", "Alias"],
      ["TYPEDEF", "Deep"],
      ["FUNCTION", "show"],
      ["FUNCTION", "dive"],
      ["FUNCTION", "make"],
      ["FUNCTION", "on"],
      ["TYPEDEF", "Inst"],
    ]);
  });

  test("round-trips a populated alias into ApiTypedef members", () => {
    const module = parseDefoldApiDoc(extractApiDoc(ALIAS_SHAPES, "alias.alias"));
    const opts = module.typedefs.find((t) => t.name === "ShowOptions");
    expect(opts?.properties?.map((p) => [p.name, p.isOptional])).toEqual([
      ["clear", true],
      ["sequential", undefined],
    ]);
    expect(opts?.functions?.map((f) => f.name)).toEqual(["run"]);
  });
});

// A fork whose public surface lives at file scope: the `declare module` block
// holds the single entry point, while the ambient globals — a documented
// function, a const, an overload pair, and a namespace — sit outside it,
// alongside supporting shapes in every reachability state (reached and
// member-bearing, reached but memberless, unreached, and a reached alias over an
// object literal).
const FILE_SCOPE = `/** @noSelfInFile **/

/** Callback that receives a tag. */
declare type Cb = (target: string) => void;

/** The area a framed object occupies. */
interface AreaShape {
	/** Whether the point is inside. */
	has_point(x: number): boolean;
}

/** Named by nothing that is published. */
interface Unreached {
	/** Never published. */
	nope(): void;
}

/** Reached, but carries no members. */
interface Memberless {}

/** Options for framing. */
type FrameOptions = {
	/** Clear first. */
	clear?: boolean;
	/** Run the transition. */
	run(a: string): void;
};

/**
 * Frame the world.
 * @param tag the tag to frame
 * @returns the framed area
 */
declare function frame(tag: string, options?: FrameOptions): AreaShape;

/** How many frames. */
declare const COUNT: number;

declare function untouched(m: Memberless): void;

declare function on_click(tag: string, cb: Cb): void;
declare function on_click(cb: Cb): void;

declare namespace rgb {
	/** Red. */
	export const RED: number;
	/** Build one from hex. */
	export function from_hex(hex: string): number;
}

/**
 * File-scope demo.
 * @noResolution
 */
declare module 'fs.fs' {
	/** The one module export. */
	export function boot(game: () => void): void;
}
`;

describe("extractApiDoc file-scope ambient declarations", () => {
  const elements = () =>
    (extractApiDoc(FILE_SCOPE, "fs.fs") as { elements: Array<Record<string, unknown>> }).elements;
  const element = (type: string, name: string) =>
    elements().filter((e) => e.type === type && e.name === name);
  const only = (type: string, name: string) => element(type, name)[0];

  test("emits a file-scope function as a global FUNCTION element with its parameters and docs", () => {
    const frame = only("FUNCTION", "frame") as
      | { brief: string; global?: true; parameters: Array<{ name: string; is_optional: string }> }
      | undefined;
    expect(frame?.global).toBe(true);
    expect(frame?.brief).toBe("Frame the world.");
    expect(frame?.parameters.map((p) => [p.name, p.is_optional])).toEqual([
      ["tag", "False"],
      ["options", "True"],
    ]);
  });

  test("emits a file-scope const as a global VARIABLE element carrying its type token", () => {
    const count = only("VARIABLE", "COUNT") as { types: string[]; global?: true } | undefined;
    expect(count?.global).toBe(true);
    expect(count?.types).toEqual(["number"]);
  });

  test("qualifies file-scope namespace members and marks them global", () => {
    expect(only("VARIABLE", "rgb.RED")).toMatchObject({ global: true, types: ["number"] });
    expect(only("FUNCTION", "rgb.from_hex")).toMatchObject({ global: true });
  });

  test("emits one global element per file-scope overload declaration", () => {
    const overloads = element("FUNCTION", "on_click") as Array<{
      global?: true;
      parameters: Array<{ name: string }>;
    }>;
    expect(overloads.map((o) => o.global)).toEqual([true, true]);
    expect(overloads.map((o) => o.parameters.map((p) => p.name))).toEqual([["tag", "cb"], ["cb"]]);
  });

  test("leaves a module-block element unmarked, so absence stays the encoding of module member", () => {
    const boot = only("FUNCTION", "boot");
    expect(boot).toBeDefined();
    expect(Object.hasOwn(boot ?? {}, "global")).toBe(false);
  });

  test("emits a file-scope interface only when it is reached and member-bearing", () => {
    const area = only("TYPEDEF", "AreaShape") as
      | { global?: true; functions?: Array<{ name: string; brief: string }> }
      | undefined;
    expect(area?.global).toBe(true);
    expect(area?.functions?.map((f) => [f.name, f.brief])).toEqual([
      ["has_point", "Whether the point is inside."],
    ]);
    expect(only("TYPEDEF", "Unreached")).toBeUndefined();
    expect(only("TYPEDEF", "Memberless")).toBeUndefined();
  });

  test("fills in a reached file-scope object-literal alias the way a module-block alias is filled", () => {
    const opts = only("TYPEDEF", "FrameOptions") as
      | {
          global?: true;
          functions?: Array<{ name: string }>;
          properties?: Array<{ name: string; is_optional?: string }>;
        }
      | undefined;
    expect(opts?.global).toBe(true);
    expect(opts?.functions?.map((f) => f.name)).toEqual(["run"]);
    expect(opts?.properties?.map((p) => [p.name, p.is_optional])).toEqual([["clear", "True"]]);
  });

  test("emits file-scope elements after the module block's, leaving existing order untouched", () => {
    expect(elements()[0]).toMatchObject({ type: "FUNCTION", name: "boot" });
  });
});
