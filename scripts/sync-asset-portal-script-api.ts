import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readLibraryData } from "../packages/cli/src/library/library-data.ts";
import { includedScriptApiPaths } from "../packages/cli/src/library/library-evidence.ts";
import {
  livePortalSource,
  type PortalSource,
  rawUrl,
} from "../packages/cli/src/library/sync-asset-portal.ts";
import {
  type ApiDocJson,
  assignPageKeys,
  convertChunks,
  type DefoldExtensionDoc,
  type DefoldExtensionsManifest,
  loadReservedNamespaces,
  type RefKind,
  type ReservedNamespaces,
} from "../packages/cli/src/library/sync-defold-extensions.ts";
import { readNativeTargets } from "../packages/cli/src/library/sync-native-types.ts";
import { scriptApiToFixtureJson } from "../packages/types/scripts/sync-api-docs.ts";
import {
  type CoverageLane,
  portalCoverage,
  readAssetPortalManifest,
  readCoverageRegistries,
  readPortalAliases,
  readPortalVerdicts,
  repoKey,
} from "./asset-portal-check.ts";

// Pages the Asset Portal's `script-api` docs no library folder types: each
// `.script_api` under the `include_dirs` of a candidate, or of an entry only
// library folders pin whose namespace that repo's folder does not publish,
// fetched at the pin `asset-portal.json` recorded and lowered to ref-doc JSON, so
// the docs build reads no network. Nothing at runtime reads the output; `resolve`
// types these libraries from the dependency itself. Candidacy is the coverage
// report's, so this lives beside it rather than in the published library-types
// package.

const LABEL = "asset-portal-script-api";

export interface AssetPortalScriptApiLibrary {
  id: string;
  repo: string;
  ref: string;
  refKind: RefKind;
  // The portal entry's pin date; absent for a commit pin.
  refDate?: string;
  license: string;
  description: string;
  docs: DefoldExtensionDoc[];
}

export interface AssetPortalScriptApiManifest {
  libraries: AssetPortalScriptApiLibrary[];
}

export type ScriptApiSource = Pick<PortalSource, "repo" | "tree" | "fetchText">;

/**
 * Every `/api/` page a portal page key must not shadow: engine namespaces,
 * vendored libraries, Defold extension pages and curated native namespaces.
 */
export async function loadPortalReservedNamespaces(dataDir: string): Promise<ReservedNamespaces> {
  const { engineNamespaces, libraryNamespaces } = await loadReservedNamespaces(dataDir);
  const defold = JSON.parse(
    readFileSync(join(dataDir, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;
  return {
    engineNamespaces,
    libraryNamespaces: new Set([
      ...libraryNamespaces,
      ...defold.libraries.flatMap((library) => library.docs.map((doc) => doc.page)),
      ...readNativeTargets(dataDir).map((target) => target.namespace),
    ]),
  };
}

function docKey(id: string, path: string, namespace: string): string {
  return `${id}#${path}#${namespace}`;
}

// The lanes whose pins are library folders; a `defold` or `native` pin documents
// the whole repo, so an entry either pins is never paged.
const LIBRARY_FOLDER_LANES: ReadonlySet<CoverageLane> = new Set(["authored", "luals", "scriptApi"]);

/** Every namespace a library folder publishes, keyed by its repo the way coverage keys it. */
function folderNamespacesByRepo(dataDir: string): Map<string, Set<string>> {
  const byRepo = new Map<string, Set<string>>();
  for (const library of readLibraryData(dataDir)) {
    const key = repoKey(library.repo);
    const namespaces = byRepo.get(key) ?? new Set<string>();
    for (const target of [...library.luals, ...library.scriptApi, ...library.authored]) {
      namespaces.add(target.namespace);
    }
    byRepo.set(key, namespaces);
  }
  return byRepo;
}

/**
 * Convert the docs of every `script-api` candidate, and of every entry only
 * library folders pin, through `source`, then write `asset-portal-script-api.json`
 * (sorted by id) and recreate `asset-portal-script-api/api-doc/<page>.json` in the
 * data folder. A pinned entry skips each doc whose namespace its repo's folder
 * publishes, and is left out when no doc remains. Candidacy is computed with the
 * portal lane emptied, so a re-sync does not read its own pages as tracked and
 * drop them. A gone repo, a doc the converter rejects, a candidate left with no
 * doc, or a page key that still collides or is no safe file name throws, the last
 * two before any file is deleted or written.
 */
export async function syncAssetPortalScriptApi(
  dataDir: string,
  source: ScriptApiSource,
): Promise<AssetPortalScriptApiManifest> {
  const manifest = readAssetPortalManifest(dataDir);
  const coverage = portalCoverage(
    manifest,
    { ...readCoverageRegistries(dataDir), portal: [] },
    readPortalAliases(dataDir),
    readPortalVerdicts(dataDir),
  );
  const folderNamespaces = folderNamespacesByRepo(dataDir);
  // Entry id -> the namespaces its library folder already publishes; a candidate has none.
  const paged = new Map<string, { pinned: boolean; published: ReadonlySet<string> }>();
  for (const entry of coverage) {
    if (entry.kind !== "script-api" || entry.declined !== null) continue;
    const pinned =
      entry.lanes.length > 0 && entry.lanes.every((lane) => LIBRARY_FOLDER_LANES.has(lane));
    if (!pinned && !entry.candidate) continue;
    const published =
      pinned && entry.repo !== null ? folderNamespaces.get(repoKey(entry.repo)) : undefined;
    paged.set(entry.id, { pinned, published: published ?? new Set() });
  }
  const reserved = await loadPortalReservedNamespaces(dataDir);

  const surveyed: (Omit<AssetPortalScriptApiLibrary, "docs"> & {
    docs: { path: string; namespace: string }[];
  })[] = [];
  const docJson = new Map<string, ApiDocJson>();
  for (const entry of manifest.entries) {
    const selection = paged.get(entry.id);
    if (selection === undefined) continue;
    const { repo, ref, refKind } = entry;
    if (repo === null || ref === null || refKind === null) {
      throw new Error(`${LABEL}: ${entry.id} has no pinned repo in asset-portal.json`);
    }
    const meta = await source.repo(repo.replace(/^https:\/\/github\.com\//, ""));
    if (!meta) throw new Error(`${LABEL}: ${repo} is gone; re-sync asset-portal.json first`);
    const docs: { path: string; namespace: string }[] = [];
    const paths = includedScriptApiPaths(await source.tree(meta.full_name, ref), entry.includeDirs);
    for (const path of paths) {
      const url = rawUrl(meta.full_name, ref, path);
      const text = await source.fetchText(url);
      for (const doc of convertChunks(text, url, scriptApiToFixtureJson, LABEL)) {
        if (selection.published.has(doc.info.namespace)) continue;
        docs.push({ path, namespace: doc.info.namespace });
        docJson.set(docKey(entry.id, path, doc.info.namespace), doc);
      }
    }
    if (docs.length === 0) {
      if (selection.pinned) continue;
      throw new Error(`${LABEL}: ${repo}@${ref} declares no .script_api table under include_dirs`);
    }
    surveyed.push({
      id: entry.id,
      repo,
      ref,
      refKind,
      ...(entry.refDate === undefined ? {} : { refDate: entry.refDate }),
      license: meta.license?.spdx_id ?? "",
      description: entry.description,
      docs,
    });
  }

  surveyed.sort((a, b) => a.id.localeCompare(b.id));
  const keyed = assignPageKeys(surveyed, reserved, LABEL);
  const libraries = surveyed.map((library, index) => ({
    ...library,
    docs: keyed[index]?.docs ?? [],
  }));

  const apiDocDir = join(dataDir, "asset-portal-script-api", "api-doc");
  rmSync(apiDocDir, { recursive: true, force: true });
  mkdirSync(apiDocDir, { recursive: true });
  for (const library of libraries) {
    for (const doc of library.docs) {
      writeFileSync(
        join(apiDocDir, `${doc.page}.json`),
        `${JSON.stringify(docJson.get(docKey(library.id, doc.path, doc.namespace)), null, 2)}\n`,
      );
    }
  }

  const output: AssetPortalScriptApiManifest = { libraries };
  writeFileSync(
    join(dataDir, "asset-portal-script-api.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  return output;
}

if (import.meta.main && process.argv.includes("--fetch")) {
  const { toolDataOrExit } = await import("../packages/cli/src/library/tool-data-flag.ts");
  const { dataDir } = toolDataOrExit("scripts/sync-asset-portal-script-api.ts");
  const { libraries } = await syncAssetPortalScriptApi(dataDir, livePortalSource());
  const docs = libraries.reduce((sum, library) => sum + library.docs.length, 0);
  console.log(`paged ${libraries.length} Asset Portal script_api libraries, ${docs} docs`);
}
