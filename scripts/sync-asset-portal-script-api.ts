import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  includedScriptApiPaths,
  livePortalSource,
  type PortalSource,
  rawUrl,
} from "../packages/library-types/scripts/sync-asset-portal.ts";
import {
  type ApiDocJson,
  assignPageKeys,
  convertChunks,
  type DefoldExtensionDoc,
  type DefoldExtensionsManifest,
  loadReservedNamespaces,
  type RefKind,
  type ReservedNamespaces,
} from "../packages/library-types/scripts/sync-defold-extensions.ts";
import { readNativeTargets } from "../packages/library-types/scripts/sync-native-types.ts";
import { scriptApiToFixtureJson } from "../packages/types/scripts/sync-api-docs.ts";
import {
  portalCoverage,
  readAssetPortalManifest,
  readCoverageRegistries,
  readPortalAliases,
  readPortalVerdicts,
} from "./asset-portal-check.ts";

// Pages the Asset Portal's `script-api` candidates: each `.script_api` under a
// candidate's `include_dirs`, fetched at the pin `asset-portal.json` recorded and
// lowered to ref-doc JSON, so the docs build reads no network. Nothing at runtime
// reads the output; `resolve` types these libraries from the dependency itself.
// Candidacy is the coverage report's, so this lives beside it rather than in the
// published library-types package.

const LABEL = "asset-portal-script-api";
const PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");

export interface AssetPortalScriptApiLibrary {
  id: string;
  repo: string;
  ref: string;
  refKind: RefKind;
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
export async function loadPortalReservedNamespaces(
  packageRoot: string,
): Promise<ReservedNamespaces> {
  const { engineNamespaces, libraryNamespaces } = await loadReservedNamespaces(packageRoot);
  const defold = JSON.parse(
    readFileSync(join(packageRoot, "defold-extensions.json"), "utf8"),
  ) as DefoldExtensionsManifest;
  return {
    engineNamespaces,
    libraryNamespaces: new Set([
      ...libraryNamespaces,
      ...defold.libraries.flatMap((library) => library.docs.map((doc) => doc.page)),
      ...readNativeTargets(packageRoot).map((target) => target.namespace),
    ]),
  };
}

function docKey(id: string, path: string, namespace: string): string {
  return `${id}#${path}#${namespace}`;
}

/**
 * Convert every `script-api` candidate's docs through `source`, then write
 * `asset-portal-script-api.json` (sorted by id) and recreate
 * `asset-portal-script-api/api-doc/<page>.json` under `packageRoot`. Candidacy
 * is computed with the portal lane emptied, so a re-sync does not read its own
 * pages as tracked and drop them. A gone repo, a doc the converter rejects, a
 * candidate left with no doc, or a page key that still collides throws.
 */
export async function syncAssetPortalScriptApi(
  packageRoot: string,
  source: ScriptApiSource,
): Promise<AssetPortalScriptApiManifest> {
  const manifest = readAssetPortalManifest(packageRoot);
  const coverage = portalCoverage(
    manifest,
    { ...readCoverageRegistries(packageRoot), portal: [] },
    readPortalAliases(packageRoot),
    readPortalVerdicts(packageRoot),
  );
  const paged = new Set(
    coverage.filter((entry) => entry.candidate && entry.kind === "script-api").map((e) => e.id),
  );
  const reserved = await loadPortalReservedNamespaces(packageRoot);

  const surveyed: (Omit<AssetPortalScriptApiLibrary, "docs"> & {
    docs: { path: string; namespace: string }[];
  })[] = [];
  const docJson = new Map<string, ApiDocJson>();
  for (const entry of manifest.entries) {
    if (!paged.has(entry.id)) continue;
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
        docs.push({ path, namespace: doc.info.namespace });
        docJson.set(docKey(entry.id, path, doc.info.namespace), doc);
      }
    }
    if (docs.length === 0) {
      throw new Error(`${LABEL}: ${repo}@${ref} declares no .script_api table under include_dirs`);
    }
    surveyed.push({
      id: entry.id,
      repo,
      ref,
      refKind,
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

  const apiDocDir = join(packageRoot, "asset-portal-script-api", "api-doc");
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
    join(packageRoot, "asset-portal-script-api.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  return output;
}

if (import.meta.main && process.argv.includes("--fetch")) {
  const { libraries } = await syncAssetPortalScriptApi(PACKAGE_ROOT, livePortalSource());
  const docs = libraries.reduce((sum, library) => sum + library.docs.length, 0);
  console.log(`paged ${libraries.length} Asset Portal script_api libraries, ${docs} docs`);
}
