import { resolve } from "node:path";
import { symbolIdentityKey } from "../src/api-availability";
import { selectCompleteVersionSurfaces, versionOf } from "./generate-api-availability";
import { generateModuleSignatures, loadApiTargets, loadTargetModules } from "./regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");

export interface SignaturesArtifact {
  // version -> symbolIdentityKey -> authoritative TS signature text
  readonly versions: Record<string, Record<string, string>>;
}

export interface BuildSignaturesOptions {
  readonly packageRoot?: string;
  readonly registryPath?: string;
}

function sortObjectKeys(record: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] as string;
  return sorted;
}

export function buildSignaturesArtifact(options: BuildSignaturesOptions = {}): SignaturesArtifact {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const registryPath = options.registryPath ?? resolve(packageRoot, "api-targets.json");
  const targets = selectCompleteVersionSurfaces(loadApiTargets(registryPath));
  const versions: Record<string, Record<string, string>> = {};
  for (const target of targets) {
    const version = versionOf(target);
    const perSymbol: Record<string, string> = {};
    for (const entry of loadTargetModules(target, packageRoot)) {
      for (const { identity, tsSignature } of generateModuleSignatures(entry)) {
        perSymbol[symbolIdentityKey(identity)] = tsSignature;
      }
    }
    versions[version] = sortObjectKeys(perSymbol);
  }
  return { versions };
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(["bunx", "biome", "format", "--stdin-file-path=api-signatures.json"], {
    stdin: Buffer.from(raw),
  });
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

export function serializeSignaturesArtifact(artifact: SignaturesArtifact): string {
  return biomeFormatJson(JSON.stringify(artifact));
}

if (import.meta.main) {
  const artifact = buildSignaturesArtifact();
  if (process.argv.includes("--write")) {
    Bun.write(SIGNATURES_PATH, serializeSignaturesArtifact(artifact));
    const count = Object.values(artifact.versions).reduce((n, v) => n + Object.keys(v).length, 0);
    console.log(`wrote ${SIGNATURES_PATH} (${count} signatures)`);
  } else {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  }
}
