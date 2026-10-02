import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const HSM_VENDOR_DIR = "src/vendor/hsm";

export interface RunVendorHsmOptions {
  readonly cwd: string;
  readonly sourceDir: string | null;
  readonly version: string;
}

export interface RunVendorHsmResult {
  readonly version: string;
  readonly previousVersion: string | null;
  readonly written: string[];
}

// Same anchoring as `readCliVersion`: the module URL, never `import.meta.dir`,
// so the bundled bin under node still lands on the package root.
function defaultCliRoot(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

// The one filter both the CLI build (what ships in `dist/hsm/`) and the
// `vendor` command (what lands in a project) read, so a new module ships
// without editing a list.
export function hsmSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".d.ts"),
    )
    .map((entry) => entry.name)
    .sort();
}

// The workspace sibling wins so a stale `dist/` never shadows the live source
// inside this repo; a published install has only the `dist/hsm/` copy.
export function resolveHsmSourceDir(cliRoot: string = defaultCliRoot()): string | null {
  const workspace = path.join(cliRoot, "..", "hsm", "src");
  if (existsSync(workspace)) {
    return workspace;
  }
  const shipped = path.join(cliRoot, "dist", "hsm");
  if (existsSync(shipped)) {
    return shipped;
  }
  return null;
}

function readVendoredVersion(versionPath: string): string | null {
  if (!existsSync(versionPath)) {
    return null;
  }
  const text = readFileSync(versionPath, "utf8").trim();
  return text === "" ? null : text;
}

export function runVendorHsm(opts: RunVendorHsmOptions): RunVendorHsmResult {
  const { cwd, sourceDir, version } = opts;
  if (sourceDir === null) {
    throw new Error(
      "defold-typescript vendor: the hsm source is missing from this CLI install; reinstall @defold-typescript/cli.",
    );
  }
  const files = hsmSourceFiles(sourceDir);
  const destDir = path.join(cwd, HSM_VENDOR_DIR);
  const versionPath = path.join(destDir, "VERSION");
  const previousVersion = readVendoredVersion(versionPath);

  mkdirSync(destDir, { recursive: true });
  const written: string[] = [];
  for (const name of files) {
    copyFileSync(path.join(sourceDir, name), path.join(destDir, name));
    written.push(`${HSM_VENDOR_DIR}/${name}`);
  }
  writeFileSync(versionPath, `${version}\n`);
  written.push(`${HSM_VENDOR_DIR}/VERSION`);

  return { version, previousVersion, written };
}
