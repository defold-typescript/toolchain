import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import {
  createProjectRunner,
  type EngineEntry,
  type ProjectRunnerOptions,
  ViewLoadError,
} from "./view-run";

const LIBRARIES = [
  { library: HSM_LIBRARY, sourceDir: requireLibrarySourceDir(HSM_LIBRARY) },
  { library: ECS_LIBRARY, sourceDir: requireLibrarySourceDir(ECS_LIBRARY) },
];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "view-run-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
  const file = path.join(dir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function runner(entry: string, options: Partial<ProjectRunnerOptions> = {}) {
  return createProjectRunner(entry, { libraries: LIBRARIES, tagLiterals: false, ...options });
}

function exportsOf(
  modules: ReadonlyMap<string, Record<string, unknown>>,
  file: string,
): Record<string, unknown> {
  const exports = modules.get(file);
  if (exports === undefined) {
    throw new Error(`${file} did not run`);
  }
  return exports;
}

function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("createProjectRunner", () => {
  test("resolves the hsm and ecs modules, with one record per library file", () => {
    const entry = write(
      "main.ts",
      `import { defineMachine } from "@defold-typescript/types/hsm";
import { world } from "@defold-typescript/types/ecs";
import { inspect } from "@defold-typescript/types/ecs/debug";
import { tickMachines } from "@defold-typescript/types/ecs/hsm";
export const kinds = [typeof defineMachine, typeof world, typeof inspect];
export const ticker = tickMachines("machine");
`,
    );
    const loads: string[] = [];
    const built: unknown[] = [];
    const run = runner(entry, {
      onLibraryModule: (library, name, exports) => {
        loads.push(`${library.id}/${name}`);
        if (library === ECS_LIBRARY && name === "index") {
          const original = exports.processingSystem as (key?: string) => unknown;
          exports.processingSystem = (key?: string) => {
            built.push(key);
            return original(key);
          };
        }
      },
    }).run();

    expect(exportsOf(run.modules, entry).kinds).toEqual(["function", "function", "function"]);
    expect(loads).toContain("hsm/index");
    expect(loads).toContain("ecs/debug");
    expect(loads).toContain("ecs/hsm");
    expect(loads.filter((load) => load === "ecs/index")).toEqual(["ecs/index"]);
    // ecs/hsm's `./index` import reaches the record the hook patched, so both see one ecs.
    expect(built).toEqual([undefined]);
    expect(exportsOf(run.modules, entry).ticker).toBeDefined();
  });

  test("runs library modules once per runner and project modules on every run", () => {
    const entry = write(
      "main.ts",
      `import "./extra";
export { world } from "@defold-typescript/types/ecs";
`,
    );
    const extra = write("extra.ts", "export const made = {};\n");
    const loads: string[] = [];
    const project = runner(entry, {
      onLibraryModule: (library, name) => loads.push(`${library.id}/${name}`),
    });

    const first = project.run();
    const loadedOnce = [...loads];
    const second = project.run();

    expect(loads).toEqual(loadedOnce);
    expect(exportsOf(second.modules, entry).world).toBe(exportsOf(first.modules, entry).world);
    expect(exportsOf(second.modules, extra).made).not.toBe(exportsOf(first.modules, extra).made);
    expect(first.files.map((file) => file.path)).toEqual([entry, extra]);
    expect(second.files.map((file) => file.path)).toEqual([entry, extra]);
  });

  test("answers a partial namespace's members and stubs the rest", () => {
    const entry = write(
      "main.ts",
      `export const read = () => go.get_position();
export const write = () => go.set_position(1);
`,
    );
    const position = { x: 1, y: 2, z: 3 };
    const project = runner(entry, { builtins: { go: { get_position: () => position } } });
    const entries: EngineEntry[] = [];
    project.engine.setSink((entry) => entries.push(entry));
    const exports = exportsOf(project.run().modules, entry);

    expect((exports.read as () => unknown)()).toBe(position);
    expect(entries).toEqual([]);
    (exports.write as () => unknown)();
    expect(entries).toEqual([{ kind: "engine", api: "go.set_position", args: [1] }]);
  });

  test("gives the types package root the runtime it is handed and any other subpath nothing", () => {
    const entry = write(
      "main.ts",
      `import { defineScript } from "@defold-typescript/types";
import { play_flipbook } from "@defold-typescript/types/sprite";
export const define = defineScript;
export const other = play_flipbook;
`,
    );
    const typesRoot = { defineScript: (hooks: unknown) => hooks };
    const exports = exportsOf(runner(entry, { typesRoot }).run().modules, entry);

    expect(exports.define).toBe(typesRoot.defineScript);
    expect(Object.hasOwn(exports, "other")).toBe(true);
    expect(exports.other).toBeUndefined();
  });

  test("refuses a package that is neither a project file nor the types package", () => {
    const entry = write(
      "main.ts",
      `import { chunk } from "lodash";
export const y = chunk;
`,
    );
    const error = thrown(() => runner(entry).run());

    expect(error).toBeInstanceOf(ViewLoadError);
    expect((error as Error).message).toContain("lodash");
    expect((error as Error).message).toContain(entry);
  });
});
