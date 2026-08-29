import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Every declaration a materialized surface ships must resolve every name it
// references. The check lives here rather than beside one caller because both
// writers — the ref-doc `materializeVersionedSurface` and the packaged
// `materializeApiSurface` — have to be held to it, and the stricter gate
// guarding only the narrower path is how bug-157 shipped.

export function unexpectedDiagnostics(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /error TS\d+:/.test(line));
}

export function typecheckSurface(tsconfigPath: string): { exitCode: number; output: string } {
  const proc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath, "--noEmit"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  // A killed `tsc` emits no diagnostics, which every caller here would read as
  // a clean surface. Fail loudly instead of passing vacuously.
  if (proc.exitCode === null) {
    throw new Error(`tsc -p ${tsconfigPath} was killed with ${proc.signalCode}; no measurement`);
  }
  return {
    exitCode: proc.exitCode,
    output: `${proc.stdout.toString()}${proc.stderr.toString()}`,
  };
}

export interface StrictSurfaceTsconfigOptions {
  readonly dir: string;
  readonly include: readonly string[];
  readonly paths?: Readonly<Record<string, readonly string[]>>;
  // Callers whose scratch dir sits inside the repo pass a relative path; one in
  // the OS temp dir passes an absolute one. Either way the repo's own
  // `target`/`lib`/`strict` settings are what the surface is measured against.
  readonly extendsPath?: string;
  readonly compilerOptions?: Readonly<Record<string, unknown>>;
}

export function writeStrictSurfaceTsconfig(opts: StrictSurfaceTsconfigOptions): string {
  const tsconfigPath = resolve(opts.dir, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify(
      {
        ...(opts.extendsPath === undefined ? {} : { extends: opts.extendsPath }),
        compilerOptions: {
          noEmit: true,
          // The consumer shape (`typeRoots` + `types`, inheriting
          // `skipLibCheck: true`) is exactly what hides an unresolved name
          // in a shipped declaration, so check the surface's own files
          // directly with lib checking on.
          skipLibCheck: false,
          types: [],
          ...(opts.paths === undefined ? {} : { paths: opts.paths }),
          ...opts.compilerOptions,
        },
        include: opts.include,
      },
      null,
      2,
    )}\n`,
  );
  return tsconfigPath;
}
