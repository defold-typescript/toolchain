import { resolveLibraryTypesPackageRoot } from "../library-registry";
import { newestDataFolder } from "./data-folder";

function requireLibraryTypesRoot(): string {
  const root = resolveLibraryTypesPackageRoot();
  if (root === null) {
    throw new Error("@defold-typescript/library-types is not installed");
  }
  return root;
}

export const LIBRARY_TYPES_ROOT = requireLibraryTypesRoot();

// The newest library data folder: the registries and every file their entries
// name. `LIBRARY_TYPES_ROOT` keeps the toolchain's own outputs and inputs.
export const LIBRARY_DATA_DIR = newestDataFolder(LIBRARY_TYPES_ROOT);
