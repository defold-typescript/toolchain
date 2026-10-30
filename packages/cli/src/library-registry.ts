// IO shell around the pure `library-match` core: locate the installed
// `@defold-typescript/library-types` package, select the library data folder its
// CLI version reads, and hand each lane's registry JSON to its builder. `resolve`
// calls this once per run to match each `assetOnly` `[dependencies]` entry
// against the vendored pure-Lua corpus. Mirrors `api-registry.ts`'s
// empty-fallback shape so a workspace without the corpus degrades to "no
// libraries" rather than throwing.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import type {
  IndexSlotClassification,
  LibraryIndexSlotClassifications,
} from "@defold-typescript/types";
import { readCliVersion } from "./cli-version";
import { selectDataFolder } from "./library/data-folder";
import {
  type AuthoredRegistryTargets,
  buildAuthoredRegistryEntries,
  buildLualsRegistryEntries,
  buildScriptApiRegistryEntries,
  type LualsTargets,
  mergeVendoredLibrariesBySourceId,
  normalizeSourceId,
  type ScriptApiRegistryTargets,
  type VendoredLibrary,
} from "./library-match";

// The library-types package exports only per-module type entrypoints (no `.`
// root), so resolve its `package.json` — which it exports explicitly — and take
// the directory as the package root.
export function resolveLibraryTypesPackageRoot(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@defold-typescript/library-types/package.json");
    return path.dirname(entry);
  } catch {
    return null;
  }
}

// The data folder under the installed package that `cliVersion` reads, or `null`
// when the package or a folder for that version is missing.
export function resolveLibraryDataDir(cliVersion: string = readCliVersion()): string | null {
  const root = resolveLibraryTypesPackageRoot();
  return root === null ? null : selectDataFolder(path.join(root, "data"), cliVersion);
}

export function loadVendoredLibraryRegistry(
  dataDir: string | null = resolveLibraryDataDir(),
): VendoredLibrary[] {
  if (dataDir === null) {
    return [];
  }
  // Merge across lanes so one upstream repo split across lanes holds a single
  // `sourceId` entry; without it, `matchVendoredLibrary`'s first-match `find`
  // drops every later lane's modules for that source.
  return mergeVendoredLibrariesBySourceId([
    ...readLualsRegistryEntries(dataDir),
    ...readScriptApiRegistryEntries(dataDir),
    ...readAuthoredRegistryEntries(dataDir),
  ]);
}

// LuaLS libraries are recognized straight from `luals-targets.json`, the single
// per-library entry point. A missing or unparseable file degrades to the other
// lanes rather than throwing, so a data folder without it still resolves the
// rest.
function readLualsRegistryEntries(root: string): VendoredLibrary[] {
  const lualsTargetsPath = path.join(root, "luals-targets.json");
  if (!existsSync(lualsTargetsPath)) {
    return [];
  }
  try {
    const targets = JSON.parse(readFileSync(lualsTargetsPath, "utf8")) as LualsTargets;
    return buildLualsRegistryEntries(targets);
  } catch {
    return [];
  }
}

// script_api libraries are recognized from `script-api-targets.json`, mirroring
// the LuaLS lane. A missing or unparseable file degrades to the other registries
// rather than throwing, so a corpus without it still resolves the rest.
function readScriptApiRegistryEntries(root: string): VendoredLibrary[] {
  const scriptApiTargetsPath = path.join(root, "script-api-targets.json");
  if (!existsSync(scriptApiTargetsPath)) {
    return [];
  }
  try {
    const targets = JSON.parse(
      readFileSync(scriptApiTargetsPath, "utf8"),
    ) as ScriptApiRegistryTargets;
    return buildScriptApiRegistryEntries(targets);
  } catch {
    return [];
  }
}

// Authored/forked libraries are recognized from `authored-targets.json`,
// mirroring the LuaLS and script_api lanes. The file carries extra
// `ref`/`license`/`authored`/`generated`/`apiDoc` keys the registry ignores, so
// each entry is projected to the `{repo, moduleId, namespace}` shape matching
// needs. A missing or unparseable file degrades to the other registries.
function readAuthoredRegistryEntries(root: string): VendoredLibrary[] {
  const authoredTargetsPath = path.join(root, "authored-targets.json");
  if (!existsSync(authoredTargetsPath)) {
    return [];
  }
  try {
    const { targets } = JSON.parse(readFileSync(authoredTargetsPath, "utf8")) as {
      targets: { repo: string; moduleId: string; namespace: string }[];
    };
    const projected: AuthoredRegistryTargets = {
      targets: targets.map(({ repo, moduleId, namespace }) => ({ repo, moduleId, namespace })),
    };
    return buildAuthoredRegistryEntries(projected);
  } catch {
    return [];
  }
}

// A native extension ships C++ and no Lua module, so it is matched by source id
// and confirmed by the `<manifestDir>/ext.manifest` its archive ships rather than
// by a require path. Its declaration is a curated ambient namespace the resolver
// writes into the extension surface in place of anything the archive emits.
export interface VendoredNativeExtension {
  readonly sourceId: string;
  readonly namespace: string;
  readonly manifestDir: string;
  readonly declarationPath: string;
}

// Read from `native-targets.json`; a missing or unparseable file degrades to no
// native targets, mirroring the other lanes.
export function loadVendoredNativeRegistry(
  dataDir: string | null = resolveLibraryDataDir(),
): VendoredNativeExtension[] {
  if (dataDir === null) {
    return [];
  }
  const nativeTargetsPath = path.join(dataDir, "native-targets.json");
  if (!existsSync(nativeTargetsPath)) {
    return [];
  }
  try {
    const { targets } = JSON.parse(readFileSync(nativeTargetsPath, "utf8")) as {
      targets: { repo: string; namespace: string; manifestDir: string; declaration: string }[];
    };
    return targets.map(({ repo, namespace, manifestDir, declaration }) => ({
      sourceId: normalizeSourceId(repo),
      namespace,
      manifestDir,
      declarationPath: path.join(dataDir, declaration),
    }));
  } catch {
    return [];
  }
}

// The base each curated library slot counts from, keyed as the library-types
// parser documents. Read without that parser, which the CLI cannot load under
// Node; the library-types gates parse the same file before it ships. A missing
// or unparseable file degrades to no notes, mirroring the other lanes.
export function loadLibraryIndexSlotClassifications(
  dataDir: string | null = resolveLibraryDataDir(),
): LibraryIndexSlotClassifications {
  if (dataDir === null) {
    return new Map();
  }
  const classificationsPath = path.join(dataDir, "index-slot-classifications.json");
  if (!existsSync(classificationsPath)) {
    return new Map();
  }
  try {
    const entries = JSON.parse(readFileSync(classificationsPath, "utf8")) as Record<
      string,
      Pick<IndexSlotClassification, "class" | "evidence">
    >;
    return new Map(Object.entries(entries));
  } catch {
    return new Map();
  }
}
