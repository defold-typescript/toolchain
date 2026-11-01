import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { newestDataFolder } from "./data-folder";

// The library-types package sits beside the CLI in this repo, and no package
// declares it as a dependency, so a clean install links it nowhere: it is found by
// its place in the tree. Nothing the published CLI loads reaches this file: the
// package stays in the tree for the toolchain's tests and dev scripts, and is not
// published.
function requireLibraryTypesRoot(): string {
  const root = fileURLToPath(new URL("../../../library-types", import.meta.url));
  if (!existsSync(path.join(root, "package.json"))) {
    throw new Error("@defold-typescript/library-types is not in this checkout");
  }
  return root;
}

export const LIBRARY_TYPES_ROOT = requireLibraryTypesRoot();

// The newest library data folder: the registries and every file their entries
// name. `LIBRARY_TYPES_ROOT` keeps the toolchain's own outputs and inputs.
export const LIBRARY_DATA_DIR = newestDataFolder(LIBRARY_TYPES_ROOT);
