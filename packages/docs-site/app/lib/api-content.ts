import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import {
  type ApiVersion,
  libraryModuleDirs,
  libraryOwnerByDir,
  loadApiSurface,
  loadApiSurfaceForVersion,
  versionsWithDiskFixtures,
} from "./api-surface-loader";

export const TYPES_DIR = join(process.cwd(), "../types");
export const LIBRARY_TYPES_DIR = join(process.cwd(), "../library-types");

export function apiPages(): ApiPage[] {
  return loadApiSurface(TYPES_DIR, LIBRARY_TYPES_DIR);
}

// Enumeration for routing and version chrome: a non-default target with no
// on-disk fixtures is skipped (it would ENOENT at build time), so an
// unmaterialized ref-doc version stays invisible until its fixtures are committed.
export function apiVersions(): ApiVersion[] {
  return versionsWithDiskFixtures(TYPES_DIR);
}

export function apiPagesForVersion(versionId: string): ApiPage[] {
  return loadApiSurfaceForVersion(TYPES_DIR, versionId);
}

export function defaultGlobalTypePages(): ApiPage[] {
  return apiPages().filter((p) => p.category === "global-type");
}

// Module -> upstream-library `dir` map for the vendored library surface, used to
// group Libraries nav and index pages by library.
export function libraryDirs(): Map<string, string> {
  return libraryModuleDirs(LIBRARY_TYPES_DIR);
}

export function libraryOwners(): Map<string, string> {
  return libraryOwnerByDir(LIBRARY_TYPES_DIR);
}
