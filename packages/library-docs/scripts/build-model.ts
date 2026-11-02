import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The library pages render from what `library check` proves: the API model it writes
// and the data folder it reports. A failed check fails the build and leaves nothing.
const root = join(import.meta.dir, "..");
const generated = join(root, ".generated");
rmSync(generated, { recursive: true, force: true });
mkdirSync(generated, { recursive: true });

const check = Bun.spawnSync(
  [
    process.execPath,
    "../cli/src/bin.ts",
    "library",
    "check",
    "--data",
    "../library-types/data",
    "--api-doc-out",
    ".generated/api-doc",
    "--json",
  ],
  { cwd: root, stderr: "inherit" },
);

interface CheckReport {
  ok: boolean;
  dataFolder: string;
  problems: unknown[];
}

function report(stdout: string): CheckReport | undefined {
  try {
    return JSON.parse(stdout) as CheckReport;
  } catch {
    return undefined;
  }
}

const stdout = check.stdout.toString();
const result = report(stdout);
if (check.exitCode !== 0 || !result?.ok) {
  rmSync(generated, { recursive: true, force: true });
  console.error(`library check failed:\n${JSON.stringify(result?.problems ?? stdout, null, 2)}`);
  process.exit(1);
}

writeFileSync(
  join(generated, "site-manifest.json"),
  `${JSON.stringify({ dataFolder: result.dataFolder }, null, 2)}\n`,
);
