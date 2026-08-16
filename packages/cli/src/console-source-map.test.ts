import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { consoleLineLocations, mapConsoleLine } from "./console-source-map";

const MARKER = "defold_typescript_marker";

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

function markerSource(leadingBlankLines: number): string {
  return `${"\n".repeat(leadingBlankLines)}import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    const ${MARKER} = vmath.vector3(1, 2, 3);
    print(${MARKER});
  },
});
`;
}

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-console-map-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeProjectFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

/** The 1-based line of the generated chunk carrying the marker statement. */
function markerChunkLine(chunkRel: string): number {
  const lua = readFileSync(path.join(cwd, chunkRel), "utf8").split("\n");
  const index = lua.findIndex((text) => text.includes(MARKER));
  expect(index).toBeGreaterThan(-1);
  return index + 1;
}

function authoredLine(sourceRel: string, line: number): string {
  return readFileSync(path.join(cwd, sourceRel), "utf8").split("\n")[line - 1] as string;
}

describe("mapConsoleLine", () => {
  test("rewrites a built chunk location with the authored location beside the raw one", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const chunkLine = markerChunkLine("src/main.ts.script");

    const raw = `ERROR:SCRIPT: /src/main.ts.script:${chunkLine}: attempt to index a nil value`;
    const mapped = mapConsoleLine(cwd, raw);

    expect(mapped).toContain(`/src/main.ts.script:${chunkLine}`);
    expect(mapped).toMatch(/src\/main\.ts:\d+:\d+/);
    expect(mapped).toContain("attempt to index a nil value");
  });

  test("the mapped line and column land on the authored statement", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const chunkLine = markerChunkLine("src/main.ts.script");

    const [location] = consoleLineLocations(
      cwd,
      `ERROR:SCRIPT: /src/main.ts.script:${chunkLine}: boom`,
    );

    expect(location).toBeDefined();
    expect(location?.file).toBe("src/main.ts");
    const text = authoredLine("src/main.ts", location?.line as number);
    expect(text).toContain(MARKER);
    expect(text.slice((location?.column as number) - 1)).toStartWith(MARKER);
  });

  test("reports the authored source under an outDir layout, not a path in the output tree", () => {
    writeProjectFile(
      "tsconfig.json",
      JSON.stringify(
        { compilerOptions: { outDir: "build/lua", strict: true }, include: ["src/**/*.ts"] },
        null,
        2,
      ),
    );
    writeProjectFile("src/game/hero.ts", markerSource(0));
    const result = runBuild({ cwd });
    expect(result.written).toEqual(["build/lua/game/hero.ts.script"]);
    const chunkLine = markerChunkLine("build/lua/game/hero.ts.script");

    const [location] = consoleLineLocations(
      cwd,
      `ERROR:SCRIPT: /build/lua/game/hero.ts.script:${chunkLine}: boom`,
    );

    expect(location?.file).toBe("src/game/hero.ts");
    expect(existsSync(path.join(cwd, location?.file as string))).toBe(true);
    const text = authoredLine("src/game/hero.ts", location?.line as number);
    expect(text).toContain(MARKER);
    expect(text.slice((location?.column as number) - 1)).toStartWith(MARKER);
  });

  test("rewrites every reference on a traceback frame carrying two of them", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const chunkLine = markerChunkLine("src/main.ts.script");

    const raw = `\tsrc/main.ts.script:${chunkLine}: in function <src/main.ts.script:${chunkLine}>`;
    const mapped = mapConsoleLine(cwd, raw);

    expect(consoleLineLocations(cwd, raw).length).toBe(2);
    expect(mapped.match(/src\/main\.ts:\d+:\d+/g)?.length).toBe(2);
    expect(mapped.startsWith("\t")).toBe(true);
    expect(mapped.endsWith(">")).toBe(true);
  });

  test("returns a second lookup's new location after a rebuild shifts the authored line", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const chunkLine = markerChunkLine("src/main.ts.script");
    const raw = `ERROR:SCRIPT: /src/main.ts.script:${chunkLine}: boom`;
    const before = consoleLineLocations(cwd, raw)[0];

    writeProjectFile("src/main.ts", markerSource(2));
    runBuild({ cwd });
    expect(markerChunkLine("src/main.ts.script")).toBe(chunkLine);
    const after = consoleLineLocations(cwd, raw)[0];

    expect(before?.line).toBeDefined();
    expect(after?.line).toBe((before?.line as number) + 2);
    expect(authoredLine("src/main.ts", after?.line as number)).toContain(MARKER);
  });
});

describe("mapConsoleLine misses", () => {
  test("returns the line unchanged when no map sits beside the chunk", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    const raw = "ERROR:SCRIPT: /main/main.script:12: attempt to index a nil value";

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });

  test("returns the line unchanged when the generated line carries no segment", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const raw = "ERROR:SCRIPT: /src/main.ts.script:1: attempt to index a nil value";

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });

  test("returns the line unchanged when the generated line is past the map", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const raw = "ERROR:SCRIPT: /src/main.ts.script:9999: attempt to index a nil value";

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });

  test("returns the line unchanged when it carries no chunk reference at all", () => {
    const raw = "ERROR:SCRIPT: something went wrong with no location at all";

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });

  test("returns the line unchanged when the mapped source is no longer on disk", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    const chunkLine = markerChunkLine("src/main.ts.script");
    rmSync(path.join(cwd, "src/main.ts"));
    const raw = `ERROR:SCRIPT: /src/main.ts.script:${chunkLine}: attempt to index a nil value`;

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });

  test("returns the line unchanged when the source root escapes the project root", () => {
    // The escaping target is a real file, so only the outside-the-project
    // rejection can refuse it — an existence check alone would let it through.
    const outside = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-console-map-outside-"));
    try {
      writeProjectFile("tsconfig.json", TSCONFIG);
      writeProjectFile("src/main.ts", markerSource(0));
      runBuild({ cwd });
      const chunkLine = markerChunkLine("src/main.ts.script");
      writeFileSync(path.join(outside, "main.ts"), markerSource(0));
      const mapPath = path.join(cwd, "src/main.ts.script.map");
      const map = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, unknown>;
      map.sourceRoot = `../../${path.basename(outside)}`;
      writeFileSync(mapPath, JSON.stringify(map));
      const raw = `ERROR:SCRIPT: /src/main.ts.script:${chunkLine}: attempt to index a nil value`;

      expect(mapConsoleLine(cwd, raw)).toBe(raw);
      expect(consoleLineLocations(cwd, raw)).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("returns the line unchanged when the map is not valid JSON", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", markerSource(0));
    runBuild({ cwd });
    writeProjectFile("src/main.ts.script.map", "{ not json at all");
    const raw = "ERROR:SCRIPT: /src/main.ts.script:3: attempt to index a nil value";

    expect(mapConsoleLine(cwd, raw)).toBe(raw);
    expect(consoleLineLocations(cwd, raw)).toEqual([]);
  });
});
