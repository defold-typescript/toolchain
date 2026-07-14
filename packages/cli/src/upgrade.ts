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
export function handOffArgv(latest: string, env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    ...(RUNNER[packageManager(env)] ?? RUNNER.bun),
    `${CLI_PACKAGE}@${latest}`,
    "init",
    ".",
    "--force",
    "--suppress-install-reminder",
  ];
}

export function installArgv(env: NodeJS.ProcessEnv = process.env): string[] {
  return installHint(env).split(" ");
}

export interface UpgradeProcess {
  readonly exited: Promise<number>;
}

export type UpgradeSpawn = (argv: string[], cwd: string) => UpgradeProcess;

export interface UpgradeIo {
  readonly fetch: FetchImpl;
  readonly spawn: UpgradeSpawn;
  readonly env: NodeJS.ProcessEnv;
}

export interface RunUpgradeOptions {
  readonly cwd: string;
  readonly running: string;
  readonly io?: Partial<UpgradeIo>;
}

export interface UpgradeOutcome {
  readonly from: string;
  readonly to: string;
  readonly handedOff: boolean;
  readonly written: readonly string[];
  readonly exitCode: number;
  readonly error?: string;
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

export function defaultUpgradeIo(): UpgradeIo {
  return { fetch: (url) => fetch(url), spawn: spawnInherit, env: process.env };
}

// Throws when the registry cannot be reached: an upgrade that cannot see the
// registry has nothing to upgrade to, and must fail rather than re-scaffold.
export async function runUpgrade(opts: RunUpgradeOptions): Promise<UpgradeOutcome> {
  const io: UpgradeIo = { ...defaultUpgradeIo(), ...opts.io };
  const latest = await resolveLatestCliVersion(io.fetch);
  const plan = planUpgrade({ running: opts.running, latest });
  const base = { from: opts.running, to: latest, handedOff: plan.action === "hand-off" };

  let written: readonly string[] = [];
  if (plan.action === "hand-off") {
    const code = await io.spawn(handOffArgv(plan.target, io.env), opts.cwd).exited;
    if (code !== 0) {
      // An install after a half-written scaffold would pin that state, so the
      // failed hand-off ends the run.
      return {
        ...base,
        written,
        exitCode: code,
        error: `defold-typescript upgrade: ${CLI_PACKAGE}@${plan.target} init exited with code ${code}; the project was not upgraded.`,
      };
    }
  } else {
    written = runInit({ cwd: opts.cwd, force: true }).written;
  }

  const installCode = await io.spawn(installArgv(io.env), opts.cwd).exited;
  if (installCode !== 0) {
    return {
      ...base,
      written,
      exitCode: installCode,
      error: `defold-typescript upgrade: \`${installHint(io.env)}\` exited with code ${installCode}.`,
    };
  }
  return { ...base, written, exitCode: 0 };
}
