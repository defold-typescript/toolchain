// The property evaluator runs each evaluation in this process, so a deadline
// can kill time spent in C code, which wasmoon's instruction hook never sees.
// It imports neither the evaluator nor TypeScript, which keeps start-up short.
import { readFileSync } from "node:fs";
import { LuaEngine, LuaLibraries, LuaWasm } from "wasmoon";
import { PROPERTY_DEFAULT_EVALUATION } from "./property-default-prelude";
import { decodeWire, encodeWire, type PropertyEvaluationRequest } from "./property-default-wire";

const LIBRARIES = [
  LuaLibraries.Base,
  LuaLibraries.Coroutine,
  LuaLibraries.Table,
  LuaLibraries.String,
  LuaLibraries.Math,
];

async function evaluate(request: PropertyEvaluationRequest): Promise<unknown> {
  const engine = new LuaEngine(await LuaWasm.initialize(), {
    openStandardLibs: false,
    injectObjects: false,
    enableProxy: false,
    traceAllocations: true,
    functionTimeout: request.timeoutMs,
  });
  try {
    for (const library of LIBRARIES) {
      engine.global.loadLibrary(library);
    }
    engine.global.setMemoryMax(request.memoryLimitBytes);
    const run = engine.doStringSync(PROPERTY_DEFAULT_EVALUATION) as (
      chunks: Readonly<Record<string, string>>,
      resourceKinds: readonly string[],
      entry: string,
      names: readonly string[],
    ) => unknown;
    return run(request.chunks, request.resourceKinds, request.entry, request.names);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { error: text.split("\n", 1)[0] ?? text };
  } finally {
    engine.global.close();
  }
}

const request = decodeWire(readFileSync(0, "utf8")) as PropertyEvaluationRequest;
process.stdout.write(encodeWire(await evaluate(request)));
