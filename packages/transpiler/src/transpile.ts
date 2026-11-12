import type { TranspileProjectResult } from "./project-output";
import { createTranspileSession } from "./session";

export interface TranspileResult {
  readonly lua: string;
  readonly sourceMap: string;
  readonly diagnostics: readonly string[];
}

export interface TranspileProjectInput {
  readonly files: Readonly<Record<string, string>>;
}

/**
 * A one-shot session: the same per-side programs `build` and `watch` run, so
 * every entry point checks a source against the same surface.
 */
export function transpileProject(input: TranspileProjectInput): TranspileProjectResult {
  return createTranspileSession().update(input.files);
}

export function transpile(source: string): TranspileResult {
  const project = transpileProject({ files: { "main.ts": source } });
  return {
    lua: project.lua["main.ts"] ?? "",
    sourceMap: project.sourceMaps["main.ts"] ?? "",
    diagnostics: project.diagnostics.map((d) => d.message),
  };
}
