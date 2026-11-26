import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  apiLinkifier,
  apiSignatureSymbolLinker,
} from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import type { SignatureSymbolTarget } from "@defold-typescript/docs-render/signature-brand-links";
import type { SymbolLinker } from "@defold-typescript/docs-render/symbol-linkify";
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

let buildDirs: LibraryDirs | undefined;

// The build's dirs, read once so every caller that passes none shares one cache
// entry below.
function defaultDirs(): LibraryDirs {
  buildDirs ??= siteDirs();
  return buildDirs;
}

function perDirs<T>(cache: WeakMap<LibraryDirs, T>, dirs: LibraryDirs, build: () => T): T {
  const hit = cache.get(dirs);
  if (hit !== undefined) return hit;
  const value = build();
  cache.set(dirs, value);
  return value;
}

const pagesByDirs = new WeakMap<LibraryDirs, ApiPage[]>();
const linkPagesByDirs = new WeakMap<LibraryDirs, ApiPage[]>();
const linkersByDirs = new WeakMap<LibraryDirs, LibraryLinkers>();

// Memoized per `dirs` object because the renderer reads it once per page and the
// inputs are fixed for a build. A fixture test therefore builds one `dirs` object
// per folder and writes nothing into that folder after reading it.
export function apiPages(dirs: LibraryDirs = defaultDirs()): ApiPage[] {
  return perDirs(pagesByDirs, dirs, () =>
    loadLibraryPageSources(dirs).map((source) => source.page),
  );
}

// What the link registries read: the library pages plus the link-only toolchain ones.
export function linkPages(dirs: LibraryDirs = defaultDirs()): ApiPage[] {
  return perDirs(linkPagesByDirs, dirs, () => {
    const typesDir = dirs.typesDir;
    if (typesDir === undefined) return apiPages(dirs);
    return withToolchainLinks(apiPages(dirs), typesDir);
  });
}

export interface LibraryLinkers {
  linkify: (page?: ApiPage) => SymbolLinker;
  signatureLinks: (page?: ApiPage) => Map<string, SignatureSymbolTarget>;
}

// A library page's prose linker and signature link map over the link set, the
// page-independent half built once per `dirs` object. A name several libraries
// (or a library and the engine) declare is dropped from the shared half, so it
// links only on a page that declares it.
export function libraryLinkers(dirs: LibraryDirs = defaultDirs()): LibraryLinkers {
  return perDirs(linkersByDirs, dirs, () => {
    const links = linkPages(dirs);
    return {
      linkify: apiLinkifier(links, { ambiguous: "drop" }),
      signatureLinks: apiSignatureSymbolLinker(links, links, { ambiguous: "drop" }),
    };
  });
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
  return [...defoldListingsFromManifest(dirs), ...portalListingsFromManifest(dirs)].map(
    (listing) => ({
      ...listing,
      ships: pointAtToolchainDocs(listing.ships),
      steps: listing.steps.map(pointAtToolchainDocs),
      ...(listing.engineApis === undefined
        ? {}
        : { engineApis: pointAtToolchainDocs(listing.engineApis) }),
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
