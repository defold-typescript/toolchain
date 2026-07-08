import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { scanSceneResourceRefs } from "./scene-resource-scan";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-scene-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

describe("scanSceneResourceRefs", () => {
  test("flags a .go component that references a .gltf directly", () => {
    writeFile(
      "assets/plane.go",
      'components {\n  id: "mesh"\n  component: "/assets/models/plane.gltf"\n}\n',
    );

    const warnings = scanSceneResourceRefs(cwd);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("assets/plane.go");
    expect(warnings[0]).toContain("plane.gltf");
    expect(warnings[0]).toContain(".model");
  });

  test("flags an escaped component ref inside a collection's embedded_instances data", () => {
    writeFile(
      "main/main.collection",
      'embedded_instances {\n  id: "plane"\n' +
        '  data: "components {\\n"\n' +
        '  "  id: \\"mesh\\"\\n"\n' +
        '  "  component: \\"/assets/models/cloud.glb\\"\\n"\n' +
        '  "}\\n"\n}\n',
    );

    const warnings = scanSceneResourceRefs(cwd);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("main/main.collection");
    expect(warnings[0]).toContain("cloud.glb");
  });

  test("accepts a component that references a .model wrapper", () => {
    writeFile(
      "assets/plane.go",
      'components {\n  id: "mesh"\n  component: "/assets/models/plane.model"\n}\n' +
        'components {\n  id: "logic"\n  component: "/src/plane.ts.script"\n}\n',
    );

    expect(scanSceneResourceRefs(cwd)).toEqual([]);
  });

  test("flags .dae alongside .gltf/.glb", () => {
    writeFile("a.go", 'component: "/m/legacy.dae"\n');

    const warnings = scanSceneResourceRefs(cwd);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("legacy.dae");
  });

  test("skips build/ and node_modules/ so extracted and vendored files are ignored", () => {
    const bad = 'component: "/m/x.gltf"\n';
    writeFile("build/default/_generated_0.go", bad);
    writeFile("node_modules/some-dep/example.collection", bad);

    expect(scanSceneResourceRefs(cwd)).toEqual([]);
  });
});
