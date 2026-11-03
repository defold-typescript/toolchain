import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import {
  defoldListingsFromManifest,
  type LibraryDirs,
  libraryOriginByNamespace,
  loadLibraryPageSources,
  portalListingsFromManifest,
} from "./api-surface-loader";
import {
  type LibraryListing,
  type LibraryOrigin,
  type LibraryOwnerGroup,
  libraryOwnerGroups,
} from "./nav";
import { pointAtToolchainDocs, withToolchainLinks } from "./toolchain-links";

// The folder and model `scripts/build-model.ts` recorded, so model and inputs
// always agree. The site never picks the newest folder itself. The root defaults to
// the working directory, which the build runs from; root `bun test` runs from the
// repo root, so a test passes the package directory.
export function siteDirs(root: string = process.cwd()): LibraryDirs {
  const manifest = join(root, ".generated", "site-manifest.json");
  if (!existsSync(manifest)) {
    throw new Error(`${manifest} is missing; run \`bun run build-model\` first`);
  }
  const { dataFolder } = JSON.parse(readFileSync(manifest, "utf8")) as { dataFolder: string };
  return {
    dataDir: dataFolder,
    modelDir: join(root, ".generated", "api-doc"),
    typesDir: join(root, "node_modules", "@defold-typescript", "types"),
  };
}

let realPages: ApiPage[] | undefined;

// Memoized for the real dirs because the renderer reads it once per page and the
// inputs are fixed for a build; explicit dirs drive deterministic tests.
export function apiPages(dirs?: LibraryDirs): ApiPage[] {
  if (dirs) return loadLibraryPageSources(dirs).map((source) => source.page);
  if (!realPages) realPages = loadLibraryPageSources(siteDirs()).map((source) => source.page);
  return realPages;
}

// What the link registries read: the library pages plus the link-only toolchain ones.
export function linkPages(dirs: LibraryDirs = siteDirs()): ApiPage[] {
  const typesDir = dirs.typesDir;
  if (typesDir === undefined) return apiPages(dirs);
  return withToolchainLinks(apiPages(dirs), typesDir);
}

// Namespace -> GitHub `<owner>/<repo>` origin, the lineage the Libraries tree,
// the index cards, and each library page heading all group and title themselves by.
export function libraryOrigins(dirs: LibraryDirs = siteDirs()): Map<string, LibraryOrigin> {
  return libraryOriginByNamespace(dirs);
}

// Libraries with no typed API, listed on the Libraries index as repo cards: Defold's
// own, then the Asset Portal's. The index, the listing routes, the static build and
// the sidebar all read this one list, so a listing cannot reach one and miss another.
export function untypedListings(dirs: LibraryDirs = siteDirs()): LibraryListing[] {
  const siteNamespaces = new Set(apiPages(dirs).map((page) => page.namespace));
  const linked = (text: string): string => pointAtToolchainDocs(text, siteNamespaces);
  return [...defoldListingsFromManifest(dirs), ...portalListingsFromManifest(dirs)].map(
    (listing) => ({
      ...listing,
      ships: linked(listing.ships),
      steps: listing.steps.map(linked),
      ...(listing.engineApis === undefined ? {} : { engineApis: linked(listing.engineApis) }),
    }),
  );
}

// The Libraries tab's owner groups: typed library pages grouped by their GitHub
// origin, with the untyped listings among them. The sidebar renders exactly this,
// so a test over it covers what the renderer ships.
export function libraryNavGroups(
  pages: ApiPage[],
  dirs: LibraryDirs = siteDirs(),
): LibraryOwnerGroup[] {
  return libraryOwnerGroups(
    pages.map((page) => ({ namespace: page.namespace, route: page.route })),
    libraryOrigins(dirs),
    untypedListings(dirs),
  );
}
