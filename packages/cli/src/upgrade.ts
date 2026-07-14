import { spawn } from "node:child_process";
import { runInit } from "./init";
import { installHint, packageManager } from "./install-reminder";
import { type FetchImpl, resolveLatestCliVersion } from "./latest-version";

export const CLI_PACKAGE = "@defold-typescript/cli";

function numericSegments(core: string): number[] {
  return core.split(".").map((seg) => {
    const n = Number.parseInt(seg, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

function comparePrerelease(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  // A missing prerelease tail outranks any prerelease of the same core version.
  if (a === "") {
    return 1;
  }
  if (b === "") {
    return -1;
  }
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) {
      return -1;
    }
    if (r === undefined) {
      return 1;
    }
    const ln = Number.parseInt(l, 10);
    const rn = Number.parseInt(r, 10);
    const bothNumeric = !Number.isNaN(ln) && !Number.isNaN(rn);
    const cmp = bothNumeric ? ln - rn : l.localeCompare(r);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return 0;
}

// A string compare would rank 1.9.0 above 1.10.0 and ship an upgrade that never
// upgrades, so every segment is parsed as a number.
export function compareSemver(a: string, b: string): number {
  const [aCore = "", ...aPre] = a.split("-");
  const [bCore = "", ...bPre] = b.split("-");
  const left = numericSegments(aCore);
  const right = numericSegments(bCore);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const cmp = (left[i] ?? 0) - (right[i] ?? 0);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return comparePrerelease(aPre.join("-"), bPre.join("-"));
}

export type UpgradePlan = { action: "in-process" } | { action: "hand-off"; target: string };

// `init --force` re-scaffolds from the *running* CLI's templates and re-pins the
// managed devDeps to its own version, so an older binary must never do it: it
// would exit 0 while moving the project backwards. The version comparison — not
// the invocation — decides, so neither entry point can silently no-op.
export function planUpgrade(opts: { running: string; latest: string }): UpgradePlan {
  return compareSemver(opts.running, opts.latest) < 0
    ? { action: "hand-off", target: opts.latest }
    : { action: "in-process" };
}

const RUNNER: Record<ReturnType<typeof packageManager>, string[]> = {
  bun: ["bunx"],
  npm: ["npx"],
  pnpm: ["pnpm", "dlx"],
  yarn: ["yarn", "dlx"],
};

// The argv the scaffolded `mise.toml` upgrade task documents, with the resolved
// version substituted for its `@latest` tag: the runner still fetches and caches
// the package, but the target is the version this run actually resolved.
// `--json` rides along only when this run is capturing, so the delegated CLI
// reports the files it re-scaffolded instead of printing prose for a human.
export function handOffArgv(
  latest: string,
  env: NodeJS.ProcessEnv = process.env,
  opts?: { capture?: boolean },
): string[] {
  return [
    ...(RUNNER[packageManager(env)] ?? RUNNER.bun),
    `${CLI_PACKAGE}@${latest}`,
    "init",
    ".",
    "--force",
    "--suppress-install-reminder",
    ...(opts?.capture === true ? ["--json"] : []),
  ];
}

// The delegated CLI performed the re-scaffold, so it — not this process — knows
// what was written. Read its envelope back rather than reporting an empty list.
// The runner may print its own lines first, so the last parsable `init` envelope
// wins; an unreadable report yields `[]` and never throws, because a report this
// process could not parse must not fail an upgrade that otherwise succeeded.
export function readHandOffWritten(stdout: string): readonly string[] {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? "").trim();
    if (line === "") {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as { command?: unknown }).command === "init" &&
        Array.isArray((parsed as { written?: unknown }).written)
      ) {
        return (parsed as { written: unknown[] }).written.filter(
          (entry): entry is string => typeof entry === "string",
        );
      }
    } catch {
      // Not JSON, or not this CLI's envelope: keep walking back through the noise.
    }
  }
  return [];
}

export function installArgv(env: NodeJS.ProcessEnv = process.env): string[] {
  return installHint(env).split(" ");
}

export interface UpgradeProcess {
  readonly exited: Promise<number>;
  readonly output?: Promise<string>;
  // The package runner writes its fetch progress to stderr, which can interleave
  // mid-line into the merged `output`; a JSON envelope is only safe to parse out
  // of the child's stdout on its own.
  readonly stdout?: Promise<string>;
}

export type UpgradeSpawn = (
  argv: string[],
  cwd: string,
  opts?: { capture?: boolean },
) => UpgradeProcess;

export interface UpgradeIo {
  readonly fetch: FetchImpl;
  readonly spawn: UpgradeSpawn;
  readonly env: NodeJS.ProcessEnv;
}

export interface RunUpgradeOptions {
  readonly cwd: string;
  readonly running: string;
  readonly capture?: boolean;
  readonly io?: Partial<UpgradeIo>;
}

export interface UpgradeOutcome {
  readonly from: string;
  readonly to: string;
  readonly handedOff: boolean;
  readonly written: readonly string[];
  readonly exitCode: number;
  readonly error?: string;
  readonly output?: string;
}

function spawnInherit(argv: string[], cwd: string): UpgradeProcess {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    throw new Error("defold-typescript upgrade: cannot spawn an empty command.");
  }
  const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
  const exited = new Promise<number>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
  });
  return { exited };
}

// Cap the diagnostic tail so a chatty install cannot bloat the envelope.
const OUTPUT_TAIL_LIMIT = 4000;

// Under --json the CLI keeps stdout to a single JSON document, so a delegated
// child must not share the inherited fd; its streams are piped back here and
// surfaced inside the envelope instead.
function spawnCapture(argv: string[], cwd: string): UpgradeProcess {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    throw new Error("defold-typescript upgrade: cannot spawn an empty command.");
  }
  const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  proc.stdout?.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  proc.stderr?.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  const settled = new Promise<{ code: number; output: string; stdout: string }>(
    (resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", (code) => {
        const combined = `${stdout}${stderr}`.trim();
        resolve({
          code: code ?? 1,
          output:
            combined.length > OUTPUT_TAIL_LIMIT ? combined.slice(-OUTPUT_TAIL_LIMIT) : combined,
          stdout,
        });
      });
    },
  );
  // single-rejection-consumer: a spawn failure is observable through `exited`
  // alone — the only promise with a guaranteed awaiter. Every other promise
  // derived from `settled` must therefore swallow that rejection, or it becomes
  // an orphan nobody awaits (fatal under Node). A child that never started
  // produced no text, so "" is the honest value for both.
  return {
    exited: settled.then((s) => s.code),
    output: settled.then(
      (s) => s.output,
      () => "",
    ),
    stdout: settled.then(
      (s) => s.stdout,
      () => "",
    ),
  };
}

export function defaultUpgradeIo(): UpgradeIo {
  return {
    fetch: (url) => fetch(url),
    spawn: (argv, cwd, opts) => (opts?.capture ? spawnCapture(argv, cwd) : spawnInherit(argv, cwd)),
    env: process.env,
  };
}

// Throws when the registry cannot be reached: an upgrade that cannot see the
// registry has nothing to upgrade to, and must fail rather than re-scaffold.
export async function runUpgrade(opts: RunUpgradeOptions): Promise<UpgradeOutcome> {
  const io: UpgradeIo = { ...defaultUpgradeIo(), ...opts.io };
  const capture = opts.capture ?? false;
  const latest = await resolveLatestCliVersion(io.fetch);
  const plan = planUpgrade({ running: opts.running, latest });
  const base = { from: opts.running, to: latest, handedOff: plan.action === "hand-off" };

  // Captured text is a diagnostic: it earns its place in the envelope only when
  // a child failed, so a success payload stays byte-identical to today's.
  const failureOutput = async (proc: UpgradeProcess): Promise<{ output?: string }> => {
    const output = await proc.output;
    return output === undefined ? {} : { output };
  };

  let written: readonly string[] = [];
  if (plan.action === "hand-off") {
    const handOff = io.spawn(handOffArgv(plan.target, io.env, { capture }), opts.cwd, { capture });
    const code = await handOff.exited;
    if (code !== 0) {
      // An install after a half-written scaffold would pin that state, so the
      // failed hand-off ends the run.
      return {
        ...base,
        written,
        exitCode: code,
        error: `defold-typescript upgrade: ${CLI_PACKAGE}@${plan.target} init exited with code ${code}; the project was not upgraded.`,
        ...(await failureOutput(handOff)),
      };
    }
    if (capture) {
      written = readHandOffWritten((await handOff.stdout) ?? "");
    }
  } else {
    written = runInit({ cwd: opts.cwd, force: true }).written;
  }

  const install = io.spawn(installArgv(io.env), opts.cwd, { capture });
  const installCode = await install.exited;
  if (installCode !== 0) {
    return {
      ...base,
      written,
      exitCode: installCode,
      error: `defold-typescript upgrade: \`${installHint(io.env)}\` exited with code ${installCode}.`,
      ...(await failureOutput(install)),
    };
  }
  return { ...base, written, exitCode: 0 };
}
