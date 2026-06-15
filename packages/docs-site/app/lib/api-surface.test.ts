import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type ApiPage, apiModuleMarkdown, loadApiSurface } from "./api-surface";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/api-surface");

describe("loadApiSurface", () => {
  test("returns one ApiPage per module of the default target, sorted by namespace", () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    expect(pages.map((p) => p.namespace)).toEqual(["alpha", "camera"]);
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
