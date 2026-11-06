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
  test("runs a statement-named call on any object with its value and its this", async () => {
    const entry = write(
      "main.ts",
      `const x = { tag: "x", on(this: { tag: string }, y: string) { return this.tag + ":" + y; } };
export const direct = x.on("y");
export async function awaited(value: Promise<string>) {
  return x.on(await value);
}
const absent: typeof x | undefined = undefined;
export const chained = absent?.on("y").length;
`,
    );
    const modules = runner(entry, { tagLiterals: true }).run().modules;
    const exports = exportsOf(modules, entry);
    const awaited = exports.awaited as (value: Promise<string>) => Promise<string>;

    expect(exports.direct).toBe("x:y");
    expect(await awaited(Promise.resolve("z"))).toBe("x:z");
    expect(exports.chained).toBeUndefined();
  });

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

  test("rejects an undefined ecs filter token", () => {
    const entry = write(
      "main.ts",
      `export { rejectAll, rejectAny, requireAll, requireAny } from "@defold-typescript/types/ecs";
`,
    );
    const exports = exportsOf(runner(entry).run().modules, entry);
    const message = "ecs: a filter token must be a component name or a filter";

    for (const name of ["requireAll", "requireAny", "rejectAll", "rejectAny"]) {
      const builder = exports[name] as (...tokens: unknown[]) => unknown;
      expect(thrown(() => builder(undefined))).toBe(message);
      // Lua's `{...}` length drops a trailing nil, so this pins the count taken from the tokens.
      expect(thrown(() => builder("a", undefined))).toBe(message);
    }
  });

  test("runs valid ecs filters without logging select", () => {
    const entry = write(
      "main.ts",
      `import { rejectAll, rejectAny, requireAll, requireAny } from "@defold-typescript/types/ecs";
const candidates = [{ a: 1 }, { a: 1, b: 1 }, { b: 1 }, {}];
const results = (filter) => candidates.map((candidate) => filter({}, candidate));
export const all = results(requireAll("a", rejectAll("b")));
export const any = results(requireAny("a", "b"));
export const none = results(rejectAny("a", "b"));
`,
    );
    const project = runner(entry);
    const entries: EngineEntry[] = [];
    project.engine.setSink((entry) => entries.push(entry));
    const exports = exportsOf(project.run().modules, entry);

    expect(exports.all).toEqual([true, false, false, false]);
    expect(exports.any).toEqual([true, true, true, false]);
    expect(exports.none).toEqual([false, false, false, true]);
    expect(entries).toEqual([]);
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
