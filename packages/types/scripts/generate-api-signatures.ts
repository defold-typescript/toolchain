import { resolve } from "node:path";
import { symbolIdentityKey } from "../src/api-availability";
import type { SlotType, SlotTypes } from "../src/emit-dts";
import { signatureArmsFor } from "../src/signature-store";
import { selectCompleteVersionSurfaces } from "./generate-api-availability";
import {
  type ApiTarget,
  generateModuleSignatures,
  loadApiTargets,
  loadTargetModules,
  type ModuleManifestEntry,
  type TargetBindingOptions,
} from "./regen";
import { loadSignatureFile } from "./signature-store-fs";
import { versionOf } from "./target-version";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SIGNATURES_PATH = resolve(PACKAGE_ROOT, "api-signatures.json");

export interface SignaturesArtifact {
  // version -> symbolIdentityKey -> authoritative TS signature text; a symbol
  // with several declared arms carries one arm per line, primary first
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
  // What each target's engine source decides for its emit (`targetBindingOptions`):
  // the constants it registers, which gate the undocumented constant back-fill,
  // and the binding-pinned return corrections whose pin holds there. Omitted,
  // every target is emitted ungated and with no binding-pinned correction.
  // Supplied by the in-repo callers only: the vendored bindings it reads are not
  // published.
  readonly emitOptionsOf?: (target: ApiTarget) => TargetBindingOptions;
}

// The authored replacement for a symbol the skip filter withheld, read from the
// same `signatures/<ns>.json` store the version-prefixed API pages render from.
// One seam keeps all three artifacts consistent: `overloads-signature-parity`
// pins the store to the `src/*-overloads.d.ts` declarations, so folding the
// store in cannot drift from the surface a consumer actually compiles against.
// Only the arms the target's version declares are folded.
function authoredSignature(
  packageRoot: string,
  namespace: string,
  fqn: string,
  version: string,
): string | null {
  const store = loadSignatureFile(resolve(packageRoot, "signatures", `${namespace}.json`));
  const override = store[fqn];
  const forms = override ? signatureArmsFor(override, version).signatures : [];
  return forms.length > 0 ? forms.join("\n") : null;
}

interface UnfilteredSurface {
  readonly entries: readonly ModuleManifestEntry[];
  readonly of: ReadonlyMap<ModuleManifestEntry, ModuleManifestEntry>;
}

const unfilteredSurfaces = new WeakMap<readonly ModuleManifestEntry[], UnfilteredSurface>();

// The surface with every member's `skipFunctions` cleared, built once per
// surface: dropping functions moves no type declaration, so it routes exactly
// as the filtered one does.
function unfilteredSurfaceOf(surface: readonly ModuleManifestEntry[]): UnfilteredSurface {
  let unfiltered = unfilteredSurfaces.get(surface);
  if (unfiltered === undefined) {
    const of = new Map(surface.map((member) => [member, { ...member, skipFunctions: [] }]));
    unfiltered = { entries: [...of.values()], of };
    unfilteredSurfaces.set(surface, unfiltered);
  }
  return unfiltered;
}

// The symbols `skipFunctions` removed from this module, as the difference
// between the unfiltered and filtered signature emits. Derived rather than
// re-matched so the withholding rules stay owned by `prepareGeneratedModule`.
// Both emits route in `surface`, the modules the entry is emitted beside, so a
// slot naming a sibling's type resolves in the unfiltered emit too.
export function withheldSymbols(
  entry: ModuleManifestEntry,
  surface: readonly ModuleManifestEntry[],
): { key: string; fqn: string }[] {
  if ((entry.skipFunctions ?? []).length === 0) return [];
  const kept = new Set(
    generateModuleSignatures(entry, { surface }).map(({ identity }) => symbolIdentityKey(identity)),
  );
  const unfiltered = unfilteredSurfaceOf(surface);
  const self = unfiltered.of.get(entry);
  if (self === undefined) {
    throw new Error(`module "${entry.namespace}" is not a member of the surface it is emitted in`);
  }
  const withheld: { key: string; fqn: string }[] = [];
  for (const { identity } of generateModuleSignatures(self, { surface: unfiltered.entries })) {
    const key = symbolIdentityKey(identity);
    if (kept.has(key)) continue;
    const fqn = key.split("\0")[2] as string;
    withheld.push({ key, fqn });
  }
  return withheld;
}

// The slots two arms record identically. One ledger cannot describe arms whose
// types differ at a slot, so that slot is dropped and its row falls back to the
// ref-doc token.
function commonSlots(a: SlotTypes, b: SlotTypes): SlotTypes {
  const common: Record<string, SlotType> = {};
  for (const [slot, record] of Object.entries(a)) {
    const other = b[slot];
    if (other?.type === record.type && other.optional === record.optional) common[slot] = record;
  }
  return common;
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
    const emitOptions = options.emitOptionsOf?.(target);
    const surface = loadTargetModules(target, packageRoot);
    for (const entry of surface) {
      for (const signature of generateModuleSignatures(entry, emitOptions)) {
        const key = symbolIdentityKey(signature.identity);
        // Two ref-doc elements can normalize to one identity (the Box2D backend
        // forms of a `b2d.world` query), so each keeps its arms in fixture order
        // and the key keeps only the slots every arm shares.
        const earlier = perSymbol[key];
        if (earlier !== undefined) {
          perSymbol[key] = `${earlier}\n${signature.tsSignature}`;
          const common = commonSlots(perSymbolSlots[key] ?? {}, signature.slotTypes);
          if (Object.keys(common).length > 0) perSymbolSlots[key] = common;
          else delete perSymbolSlots[key];
          continue;
        }
        perSymbol[key] = signature.tsSignature;
        if (Object.keys(signature.slotTypes).length > 0) {
          perSymbolSlots[key] = sortObjectKeys({ ...signature.slotTypes });
        }
      }
      // An authored fold replaces the declaration text wholesale, so whatever
      // slots the generated emit had recorded no longer describe it.
      for (const { key, fqn } of withheldSymbols(entry, surface)) {
        const authored = authoredSignature(packageRoot, entry.namespace, fqn, version);
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
  const { targetBindingOptions } = await import("./binding-pin");
  const artifact = buildSignaturesArtifact({
    emitOptionsOf: (target) => targetBindingOptions(target),
  });
  if (process.argv.includes("--write")) {
    Bun.write(SIGNATURES_PATH, serializeSignaturesArtifact(artifact));
    const count = Object.values(artifact.versions).reduce((n, v) => n + Object.keys(v).length, 0);
    console.log(`wrote ${SIGNATURES_PATH} (${count} signatures)`);
  } else {
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  }
}
