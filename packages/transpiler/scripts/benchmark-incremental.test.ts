import { describe, expect, test } from "bun:test";
import { createTranspileSession } from "../src/index";
import { buildBenchmarkProject, runIncrementalBenchmark } from "./benchmark-incremental";

describe("incremental rebuild benchmark", () => {
  test("buildBenchmarkProject returns n user .ts files", () => {
    const fileCount = 30;
    const project = buildBenchmarkProject(fileCount);
    const keys = Object.keys(project.files);
    expect(keys.length).toBe(fileCount);
    for (const key of keys) {
      expect(key).toMatch(/^src\/.*\.ts$/);
    }
    expect(project.files[project.editFile]).toBeDefined();
  });

  test("runIncrementalBenchmark times a single-file edit and re-emits only it", () => {
    const project = buildBenchmarkProject(30);
    const session = createTranspileSession();

    const result = runIncrementalBenchmark(session, project);

    expect(result.elapsedMs).toBeGreaterThan(0);
    expect(result.changedFile).toBe(project.editFile);

    // The lua map is keyed by the source .ts path.
    expect(result.editedLua[project.editFile]).not.toBe(result.seedLua[project.editFile]);

    // An unchanged module's Lua is byte-identical across the incremental update.
    const unchanged = "src/mod15.ts";
    expect(result.editedLua[unchanged]).toBe(result.seedLua[unchanged]);
  });
});
