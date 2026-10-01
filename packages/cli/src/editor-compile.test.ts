import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import type { EditorIssue } from "./editor-attach";
import { mapCompileIssues } from "./editor-compile";

const MARKER = "defold_typescript_marker";

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

// The marker statement sits on authored line 5, so an issue on its chunk line
// must map there and nowhere else.
const MARKER_SOURCE = `import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    const ${MARKER} = vmath.vector3(1, 2, 3);
    print(${MARKER});
  },
});
`;
const MARKER_AUTHORED_LINE = 5;

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-editor-compile-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeProjectFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

/** The zero-based line of the generated chunk carrying the marker, as the editor reports it. */
function markerChunkLineZeroBased(chunkRel: string): number {
  const lua = readFileSync(path.join(cwd, chunkRel), "utf8").split("\n");
  const index = lua.findIndex((text) => text.includes(MARKER));
  expect(index).toBeGreaterThan(-1);
  return index;
}

function issueAt(resource: string, line: number): EditorIssue {
  return {
    message: "attempt to index a nil value",
    severity: "error",
    resource,
    range: { start: { line, character: 4 }, end: { line, character: 20 } },
  };
}

describe("mapCompileIssues", () => {
  test("an issue on a written script gains the authored .ts location and keeps every raw field", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", MARKER_SOURCE);
    runBuild({ cwd });
    const issue = issueAt("/src/main.ts.script", markerChunkLineZeroBased("src/main.ts.script"));

    const [mapped] = mapCompileIssues(cwd, [issue]);

    expect(mapped).toMatchObject(issue);
    expect(mapped?.source?.file).toBe("src/main.ts");
    expect(mapped?.source?.line).toBe(MARKER_AUTHORED_LINE);
    const authored = MARKER_SOURCE.split("\n")[MARKER_AUTHORED_LINE - 1] as string;
    expect(authored.slice((mapped?.source?.column as number) - 1)).toStartWith(MARKER);
  });

  test("issues on resources with no map, or with no range, come back without a source", () => {
    writeProjectFile("tsconfig.json", TSCONFIG);
    writeProjectFile("src/main.ts", MARKER_SOURCE);
    runBuild({ cwd });
    const collection = issueAt("/main/main.collection", 3);
    const lualib = issueAt("/lualib_bundle.lua", 0);
    const rangeless: EditorIssue = {
      message: "Build failed",
      severity: "error",
      resource: "/src/main.ts.script",
    };

    const mapped = mapCompileIssues(cwd, [collection, lualib, rangeless]);

    expect(mapped).toEqual([collection, lualib, rangeless]);
    for (const entry of mapped) expect("source" in entry).toBe(false);
  });
});
