import { resolveLibraryTypesPackageRoot } from "../library-registry";

function requireLibraryTypesRoot(): string {
  const root = resolveLibraryTypesPackageRoot();
  if (root === null) {
    throw new Error("@defold-typescript/library-types is not installed");
  }
  return root;
}

export const LIBRARY_TYPES_ROOT = requireLibraryTypesRoot();
