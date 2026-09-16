import { resolve } from "node:path";
import { symbolIdentityKey } from "../src/api-availability";
import type { SlotTypes } from "../src/emit-dts";
import { selectCompleteVersionSurfaces, versionOf } from "./generate-api-availability";
import {
  generateModuleSignatures,
  loadApiTargets,
  loadTargetModules,
  type ModuleManifestEntry,
} from "./regen";
import { loadSignatureFile } from "./signature-store-fs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");

export interface SignaturesArtifact {
  // version -> symbolIdentityKey -> authoritative TS signature text
  readonly versions: Record<string, Record<string, string>>;
  // The same axis and keys, carrying each documented slot's rendered type. Kept
  // parallel rather than folded into `versions` because three consumers
  // (`api-surface-loader`, `combined-surface`, `version-window`) type that map's
  // value as a string; a symbol documenting no slot is absent here.
  readonly slotTypes: Record<string, Record<string, SlotTypes>>;
}

export interface BuildSignaturesOptions {
  readonly packageRoot?: string;
  readonly registryPath?: string;
}

// The authored replacement for a symbol the skip filter withheld, read from the
// same `signatures/<ns>.json` store the version-prefixed API pages render from.
// One seam keeps all three artifacts consistent: `overloads-signature-parity`
// pins the store to the `src/*-overloads.d.ts` declarations, so folding the
// store in cannot drift from the surface a consumer actually compiles against.
function authoredSignature(packageRoot: string, namespace: string, fqn: string): string | null {
  const store = loadSignatureFile(resolve(packageRoot, "signatures", `${namespace}.json`));
  const forms = store[fqn]?.signatures ?? [];
  return forms.length > 0 ? forms.join("\n") : null;
}

// The symbols `skipFunctions` removed from this module, as the difference
// between the unfiltered and filtered signature emits. Derived rather than
// re-matched so the withholding rules stay owned by `prepareGeneratedModule`.
export function withheldSymbols(entry: ModuleManifestEntry): { key: string; fqn: string }[] {
  if ((entry.skipFunctions ?? []).length === 0) return [];
  const kept = new Set(
    generateModuleSignatures(entry).map(({ identity }) => symbolIdentityKey(identity)),
  );
  const withheld: { key: string; fqn: string }[] = [];
  for (const { identity } of generateModuleSignatures({ ...entry, skipFunctions: [] })) {
    const key = symbolIdentityKey(identity);
    if (kept.has(key)) continue;
    const fqn = key.split("\0")[2] as string;
    withheld.push({ key, fqn });
  }
  return withheld;
}

function sortObjectKeys<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) sorted[key] = record[key] as T;
  return sorted;
}

export function buildSignaturesArtifact(options: BuildSignaturesOptions = {}): SignaturesArtifact {
  const packageRoot = options.packageRoot ?? PACKAGE_ROOT;
  const registryPath = options.registryPath ?? resolve(packageRoot, "api-targets.json");
  const targets = selectCompleteVersionSurfaces(loadApiTargets(registryPath));
  const versions: Record<string, Record<string, string>> = {};
  const slotTypes: Record<string, Record<string, SlotTypes>> = {};
  for (const target of targets) {
    const version = versionOf(target);
    const perSymbol: Record<string, string> = {};
    const perSymbolSlots: Record<string, SlotTypes> = {};
    for (const entry of loadTargetModules(target, packageRoot)) {
      for (const signature of generateModuleSignatures(entry)) {
        const key = symbolIdentityKey(signature.identity);
        perSymbol[key] = signature.tsSignature;
        if (Object.keys(signature.slotTypes).length > 0) {
          perSymbolSlots[key] = sortObjectKeys({ ...signature.slotTypes });
        }
      }
      // An authored fold replaces the declaration text wholesale, so whatever
      // slots the generated emit had recorded no longer describe it.
      for (const { key, fqn } of withheldSymbols(entry)) {
        const authored = authoredSignature(packageRoot, entry.namespace, fqn);
        if (authored !== null) {
          perSymbol[key] = authored;
          delete perSymbolSlots[key];
        }
      }
    }
    versions[version] = sortObjectKeys(perSymbol);
    slotTypes[version] = sortObjectKeys(perSymbolSlots);
  }
  return { versions, slotTypes };
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(["bunx", "biome", "format", "--stdin-file-path=api-signatures.json"], {
    stdin: Buffer.from(raw),
  });
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  const formatted = out.stdout.toString();
  // Biome exits 0 and emits nothing for input it declined to read (a payload over
  // `files.maxSize` is reported only on stderr), which would otherwise serialize
  // the artifact as an empty file.
  if (formatted.length === 0) {
    throw new Error(`biome format produced no output: ${out.stderr.toString()}`);
  }
  return formatted;
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
