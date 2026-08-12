import { describe, expect, test } from "bun:test";
import { readBuildConfigFromHost } from "./build-config";
import type { SceneReadHost } from "./scene-documents";

function hostServing(files: Record<string, string>): SceneReadHost {
  return {
    readDirectory: () => Object.keys(files),
    readFile: (path: string) => files[path],
  };
}

const CONFIGURED = JSON.stringify({
  compilerOptions: { outDir: "build", target: "ES2022" },
  include: ["src/**/*.ts", "tools/**/*.ts"],
});

describe("readBuildConfigFromHost", () => {
  test("returns the outDir and include the project's tsconfig.json configures", () => {
    const config = readBuildConfigFromHost(
      hostServing({ "/project/tsconfig.json": CONFIGURED }),
      "/project",
    );
    expect(config).toEqual({ outDir: "build", include: ["src/**/*.ts", "tools/**/*.ts"] });
  });

  test("applies the default include when the file omits one", () => {
    const config = readBuildConfigFromHost(
      hostServing({ "/project/tsconfig.json": '{ "compilerOptions": { "outDir": "out" } }' }),
      "/project",
    );
    expect(config).toEqual({ outDir: "out", include: ["src/**/*.ts"] });
  });

  test("normalizes the project root the way a display path is normalized", () => {
    const files = { "/project/tsconfig.json": CONFIGURED };
    expect(readBuildConfigFromHost(hostServing(files), "/project/").outDir).toBe("build");
    expect(readBuildConfigFromHost(hostServing(files), "\\project").outDir).toBe("build");
  });

  test("degrades to alongside output when the host cannot read the file", () => {
    const config = readBuildConfigFromHost(hostServing({}), "/project");
    expect(config).toEqual({ outDir: undefined, include: ["src/**/*.ts"] });
  });

  test("degrades to alongside output when the file's text does not parse", () => {
    const config = readBuildConfigFromHost(
      hostServing({ "/project/tsconfig.json": '{ "compilerOptions": { "outDir": "build" ' }),
      "/project",
    );
    expect(config).toEqual({ outDir: undefined, include: ["src/**/*.ts"] });
  });
});
