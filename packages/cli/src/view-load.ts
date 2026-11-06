import * as path from "node:path";
import { ECS_LIBRARY, HSM_LIBRARY } from "@defold-typescript/transpiler";
import { viewBuiltins } from "./view-engine";
import {
  createProjectRunner,
  type EngineSink,
  type LoadedFile,
  locationOf,
  type ProjectRun,
  type ProjectRunner,
  type RunEngine,
  type SourceLocation,
} from "./view-run";

export interface LoadedMachine {
  readonly name: string;
  readonly key: string | undefined;
  readonly config: unknown;
  readonly machine: unknown;
}

/** An instance a project file started from a machine the load lists. */
export interface LoadedInstance {
  readonly machine: LoadedMachine;
  readonly instance: unknown;
}

/** A script's hook table, as the entry file's default export holds it. */
export interface ScriptHooks {
  readonly init?: (self: unknown) => unknown;
  readonly update?: (self: unknown, dt: number) => unknown;
  readonly [hook: string]: unknown;
}

export interface ProjectLoad {
  readonly files: readonly LoadedFile[];
  readonly machines: readonly LoadedMachine[];
  /** Every world built since the load or the last `restart`, in creation order. */
  readonly worlds: readonly unknown[];
  /** Every instance started since the load or the last `restart`, in start order. */
  readonly instances: readonly LoadedInstance[];
  /** The entry file's default export, when it holds a function `init` or `update`. */
  readonly script: ScriptHooks | undefined;
  readonly engine: RunEngine;
  /** A keyed system's key, else the name a project file exports the system under. */
  systemName(system: unknown): string | undefined;
  /** Where the callbacks literal a system was built from was written. */
  systemSource(system: unknown): SourceLocation | undefined;
  /** The name a project file exports `value` under. */
  exportName(value: unknown): string | undefined;
  /** Starts an instance of `machine` that `instances` does not list. */
  startUnrecorded(machine: LoadedMachine, ctx: unknown): unknown;
  /** Reruns the project files in the same runtimes; a failure keeps the last good load. */
  reload(): void;
  /** Forgets every world and reruns the project files in fresh runtimes. */
  restart(): void;
}

export interface LoadProjectOptions {
  readonly hsmSourceDir: string;
  readonly ecsSourceDir: string;
  /** Sees each machine config before hsm does; what it returns is what hsm defines. */
  readonly onDefine?: (key: string | undefined, config: unknown) => unknown;
}

interface Definition {
  readonly key: string | undefined;
  readonly config: unknown;
  readonly machine: unknown;
}

interface LoadState {
  readonly files: readonly LoadedFile[];
  readonly machines: readonly LoadedMachine[];
  readonly script: ScriptHooks | undefined;
  readonly modules: ProjectRun["modules"];
}

interface StartRecord {
  readonly machine: object;
  readonly instance: unknown;
}

interface Runtime {
  readonly runner: ProjectRunner;
  readonly worlds: unknown[];
  readonly instances: StartRecord[];
}

type DefineMachine = (key?: string) => (config: unknown) => unknown;
type Start = (...args: unknown[]) => unknown;
type BuildSystem = (first: unknown, second?: unknown) => unknown;
type SystemBuilder = (key?: string) => BuildSystem;

const SYSTEM_BUILDERS = ["system", "processingSystem", "sortedSystem", "sortedProcessingSystem"];

const identity = (value: unknown): unknown => value;

// The `@defold-typescript/types` helpers a script file calls at run time; each returns its table.
const TYPES_ROOT: Record<string, unknown> = {
  defineScript: identity,
  defineGuiScript: identity,
  defineRenderScript: identity,
};

// Every export that holds `original` is replaced; a call through a name left unwrapped would
// reach the library unrecorded.
function replaceExport(exports: Record<string, unknown>, original: unknown, next: unknown): void {
  for (const name of Object.keys(exports)) {
    if (exports[name] === original) {
      exports[name] = next;
    }
  }
}

function isScript(value: unknown): value is ScriptHooks {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const hooks = value as ScriptHooks;
  return typeof hooks.init === "function" || typeof hooks.update === "function";
}

/**
 * Runs `file` and the project files it imports in one runtime against the hsm and ecs sources,
 * with the engine values a world reads simulated and every other Defold global a logged stub. It
 * records every machine, world and system the run creates, and the entry's script hooks.
 */
export function loadProject(file: string, options: LoadProjectOptions): ProjectLoad {
  const entry = path.resolve(file);
  const onDefine = options.onDefine ?? ((_key: string | undefined, config: unknown) => config);
  const systemKeys = new WeakMap<object, string>();
  const systemSources = new WeakMap<object, SourceLocation>();
  // The start each recorded machine had before it was wrapped; a keyed machine is wrapped once.
  const starts = new WeakMap<object, Start>();
  // The machine each machine object was last loaded as, so an instance keeps a name after a reload.
  const loadedAs = new WeakMap<object, LoadedMachine>();
  let definitions: Definition[] | undefined;
  let sink: EngineSink | undefined;
  const forward: EngineSink = (entry) => {
    sink?.(entry);
  };

  // The machine object is changed in place: a project file and the load hold the same one.
  const recordStarts = (machine: unknown, instances: StartRecord[]): void => {
    if (typeof machine !== "object" || machine === null || starts.has(machine)) {
      return;
    }
    const startable = machine as { start: Start };
    const start = startable.start;
    starts.set(machine, start);
    startable.start = (...args: unknown[]) => {
      const instance = start(...args);
      instances.push({ machine, instance });
      return instance;
    };
  };

  const wrapDefine = (exports: Record<string, unknown>, instances: StartRecord[]): void => {
    const define = exports.defineMachine as DefineMachine;
    const recording: DefineMachine = (key?: string) => {
      const defineWithKey = define(key);
      return (config: unknown) => {
        const machine = defineWithKey(onDefine(key, config));
        if (definitions !== undefined) {
          definitions.push({ key, config, machine });
          recordStarts(machine, instances);
        }
        return machine;
      };
    };
    replaceExport(exports, define, recording);
  };

  const wrapEcs = (exports: Record<string, unknown>, worlds: unknown[]): void => {
    const world = exports.world as (...items: unknown[]) => unknown;
    replaceExport(exports, world, (...items: unknown[]) => {
      const built = world(...items);
      worlds.push(built);
      return built;
    });
    for (const name of SYSTEM_BUILDERS) {
      const builder = exports[name] as SystemBuilder;
      const recording: SystemBuilder = (key?: string) => {
        const build = builder(key);
        return (first, second) => {
          const built = build(first, second);
          if (typeof built === "object" && built !== null) {
            if (key !== undefined) {
              systemKeys.set(built, key);
            }
            // A keyed reload returns the system it built first, now holding the new callbacks.
            const source = locationOf(second === undefined ? first : second);
            if (source === undefined) {
              systemSources.delete(built);
            } else {
              systemSources.set(built, source);
            }
          }
          return built;
        };
      };
      replaceExport(exports, builder, recording);
    }
  };

  const newRuntime = (): Runtime => {
    const worlds: unknown[] = [];
    const instances: StartRecord[] = [];
    const runner = createProjectRunner(entry, {
      libraries: [
        { library: HSM_LIBRARY, sourceDir: options.hsmSourceDir },
        { library: ECS_LIBRARY, sourceDir: options.ecsSourceDir },
      ],
      builtins: viewBuiltins(forward),
      typesRoot: TYPES_ROOT,
      tagLiterals: true,
      onLibraryModule: (library, name, exports) => {
        if (name !== "index") {
          return;
        }
        if (library.id === HSM_LIBRARY.id) {
          wrapDefine(exports, instances);
        } else if (library.id === ECS_LIBRARY.id) {
          wrapEcs(exports, worlds);
        }
      },
    });
    runner.engine.setSink(forward);
    return { runner, worlds, instances };
  };

  const exportIn = (modules: LoadState["modules"], value: unknown): string | undefined => {
    for (const exports of modules.values()) {
      const name = Object.keys(exports).find((key) => exports[key] === value);
      if (name !== undefined) {
        return name;
      }
    }
    return undefined;
  };

  const run = (runtime: Runtime): LoadState => {
    const recorded: Definition[] = [];
    const worldCount = runtime.worlds.length;
    const instanceCount = runtime.instances.length;
    definitions = recorded;
    let result: ProjectRun;
    try {
      result = runtime.runner.run();
    } catch (thrown) {
      runtime.worlds.length = worldCount;
      runtime.instances.length = instanceCount;
      throw thrown;
    } finally {
      definitions = undefined;
    }
    let unnamed = 0;
    const machines = recorded.map(({ key, config, machine }) => {
      const loadedMachine: LoadedMachine = {
        name: key ?? exportIn(result.modules, machine) ?? `machine-${++unnamed}`,
        key,
        config,
        machine,
      };
      if (typeof machine === "object" && machine !== null) {
        loadedAs.set(machine, loadedMachine);
      }
      return loadedMachine;
    });
    const main = result.modules.get(entry)?.default;
    return {
      files: result.files,
      machines,
      script: isScript(main) ? main : undefined,
      modules: result.modules,
    };
  };

  let runtime = newRuntime();
  let state = run(runtime);
  return {
    get files() {
      return state.files;
    },
    get machines() {
      return state.machines;
    },
    get worlds() {
      return runtime.worlds;
    },
    get instances() {
      return runtime.instances.flatMap(({ machine, instance }) => {
        const loadedMachine = loadedAs.get(machine);
        return loadedMachine === undefined ? [] : [{ machine: loadedMachine, instance }];
      });
    },
    get script() {
      return state.script;
    },
    engine: {
      setSink(next) {
        sink = next;
      },
    },
    systemName(system) {
      if (typeof system !== "object" || system === null) {
        return undefined;
      }
      return systemKeys.get(system) ?? exportIn(state.modules, system);
    },
    systemSource(system) {
      return typeof system === "object" && system !== null ? systemSources.get(system) : undefined;
    },
    exportName(value) {
      return exportIn(state.modules, value);
    },
    startUnrecorded(machine, ctx) {
      const loaded = machine.machine as { readonly start: Start };
      const start = typeof loaded === "object" && loaded !== null ? starts.get(loaded) : undefined;
      return (start ?? loaded.start)(ctx);
    },
    reload() {
      state = run(runtime);
    },
    restart() {
      const next = newRuntime();
      state = run(next);
      runtime = next;
    },
  };
}
