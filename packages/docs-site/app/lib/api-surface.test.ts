import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ApiPage, apiModuleMarkdown, apiModuleSymbols, loadApiSurface } from "./api-surface";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");
const NO_GLOBALS_FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface-no-globals");

describe("loadApiSurface", () => {
  test("returns one ApiPage per module of the default target, globals first then alphabetical", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["globals", "alpha", "camera"]);
  });

  test("prepends the synthetic globals page from globals_doc.json as pages[0]", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages[0]?.namespace).toBe("globals");
    expect(pages[0]?.route).toBe("/api/globals");
    expect(pages[0]?.module.functions.map((f) => f.name)).toContain("hash");
  });

  test("omits the globals page when no globals_doc.json exists in the fixtures dir", () => {
    const pages = loadApiSurface(NO_GLOBALS_FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["camera"]);
  });

  test("derives the route and carries the brief plus the parsed module", () => {
    const camera = loadApiSurface(FIXTURE_DIR).find((p) => p.namespace === "camera");
    expect(camera?.route).toBe("/api/camera");
    expect(camera?.brief).toBe("Camera brief");
    expect(camera?.module.functions.map((f) => f.name)).toContain("camera.get_projection");
  });

  test("selects the default target by its flag, not the first entry", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages.some((p) => p.namespace === "wmath")).toBe(false);
  });

  test("yields an entry for a namespace whose fixture has no functions or variables", () => {
    const alpha = loadApiSurface(FIXTURE_DIR).find((p) => p.namespace === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha?.module.functions).toHaveLength(0);
    expect(alpha?.module.variables).toHaveLength(0);
  });
});

describe("apiModuleMarkdown", () => {
  test("renders a codehilite examples fragment as a lua fence with no raw HTML", () => {
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [],
            returnValues: [],
            examples:
              'Call it:\n<div class="codehilite"><pre><code><span class="n">demo</span><span class="p">.</span><span class="n">run</span><span class="p">()</span></code></pre></div>',
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
    };
    const md = apiModuleMarkdown(page);
    expect(md).toContain("```lua");
    expect(md).toContain("demo.run()");
    expect(md).not.toContain("codehilite");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
  });
});

describe("apiModuleSymbols", () => {
  function pageWith(module: Partial<ApiPage["module"]>): ApiPage {
    return {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo brief",
      module: {
        namespace: "demo",
        brief: "Demo brief",
        description: "Demo module.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
        ...module,
      },
    };
  }

  test("extracts a function symbol with signature, doc, and example", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.run",
            brief: "run it",
            description: "Runs the demo.",
            parameters: [{ name: "loop", doc: "", types: ["boolean"], isOptional: true }],
            returnValues: [{ name: "", doc: "", types: ["number"], isOptional: false }],
            examples:
              '<div class="codehilite"><pre><code><span class="n">demo</span><span class="p">.</span><span class="n">run</span><span class="p">()</span></code></pre></div>',
          },
        ],
      }),
    );
    expect(symbols).toHaveLength(1);
    const sym = symbols[0];
    expect(sym?.kind).toBe("function");
    expect(sym?.name).toBe("demo.run");
    expect(sym?.signature).toBe("demo.run(loop?: boolean): number");
    expect(sym?.docMarkdown).toBe("Runs the demo.");
    expect(sym?.exampleMarkdown).toContain("```lua");
    expect(sym?.exampleMarkdown).toContain("demo.run()");
  });

  test("a function with no examples yields exampleMarkdown undefined", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          { name: "demo.tick", brief: "", description: "Tick.", parameters: [], returnValues: [] },
        ],
      }),
    );
    expect(symbols[0]?.signature).toBe("demo.tick()");
    expect(symbols[0]?.exampleMarkdown).toBeUndefined();
  });

  test("yields the correct kind and signature for variables, constants, and properties", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        variables: [{ name: "demo.SPEED", brief: "", description: "Speed.", types: ["number"] }],
        constants: [{ name: "demo.MAX", brief: "", description: "Max." }],
        properties: [{ name: "position", brief: "", description: "Pos.", types: ["vector3"] }],
      }),
    );
    expect(symbols.map((s) => [s.kind, s.signature])).toEqual([
      ["variable", "demo.SPEED: number"],
      ["constant", "demo.MAX"],
      ["property", "position: vector3"],
    ]);
    expect(symbols.every((s) => s.exampleMarkdown === undefined)).toBe(true);
  });

  test("carries structured parameters and named return values for a function", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "b2d.get_body",
            brief: "",
            description: "Gets the body.",
            parameters: [
              {
                name: "url",
                doc: "the url ...",
                types: ["string", "hash", "url"],
                isOptional: false,
              },
            ],
            returnValues: [
              {
                name: "body",
                doc: "the body if successful. Otherwise nil.",
                types: ["b2Body"],
                isOptional: false,
              },
            ],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters).toEqual([
      { name: "url", doc: "the url ...", types: ["string", "hash", "url"], isOptional: false },
    ]);
    expect(symbols[0]?.returnValues).toEqual([
      {
        name: "body",
        doc: "the body if successful. Otherwise nil.",
        types: ["b2Body"],
        isOptional: false,
      },
    ]);
  });

  test("reduces HTML in a parameter doc to plain text", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          {
            name: "demo.f",
            brief: "",
            description: "F.",
            parameters: [
              {
                name: "url",
                doc: 'the <span class="type">url</span> to use',
                types: ["url"],
                isOptional: false,
              },
            ],
            returnValues: [],
          },
        ],
      }),
    );
    expect(symbols[0]?.parameters[0]?.doc).toBe("the url to use");
    expect(symbols[0]?.parameters[0]?.doc).not.toContain("<span");
  });

  test("projects empty parameters and returnValues to empty arrays", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        functions: [
          { name: "demo.tick", brief: "", description: "Tick.", parameters: [], returnValues: [] },
        ],
      }),
    );
    expect(symbols[0]?.parameters).toEqual([]);
    expect(symbols[0]?.returnValues).toEqual([]);
  });

  test("variables, constants, and properties carry empty parameters and returnValues arrays", () => {
    const symbols = apiModuleSymbols(
      pageWith({
        variables: [{ name: "demo.SPEED", brief: "", description: "Speed.", types: ["number"] }],
        constants: [{ name: "demo.MAX", brief: "", description: "Max." }],
        properties: [{ name: "position", brief: "", description: "Pos.", types: ["vector3"] }],
      }),
    );
    expect(symbols.every((s) => s.parameters.length === 0 && s.returnValues.length === 0)).toBe(
      true,
    );
  });

  test("order and signatures match the headings apiModuleMarkdown emits", () => {
    const page = pageWith({
      functions: [
        { name: "demo.a", brief: "", description: "A.", parameters: [], returnValues: [] },
      ],
      variables: [{ name: "demo.V", brief: "", description: "V.", types: ["number"] }],
      constants: [{ name: "demo.C", brief: "", description: "C." }],
      properties: [{ name: "p", brief: "", description: "P.", types: ["number"] }],
    });
    const md = apiModuleMarkdown(page);
    const headingOrder = [...md.matchAll(/^### `([^`]+)`/gm)].map((m) => m[1] ?? "");
    expect(apiModuleSymbols(page).map((s) => s.signature)).toEqual(headingOrder);
  });
});
