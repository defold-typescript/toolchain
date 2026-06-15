import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadApiSurface } from "./api-surface";

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
