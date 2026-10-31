import { createRequire } from "node:module";
import * as path from "node:path";
import { newestDataFolder } from "./data-folder";

// The library-types package exports only its `package.json`, so resolve that and
// take the directory as the package root. Nothing the published CLI loads reaches
// this file: the package stays in the tree for the toolchain's tests and dev
// scripts, and is not published.
function requireLibraryTypesRoot(): string {
  try {
    const require = createRequire(import.meta.url);
    return path.dirname(require.resolve("@defold-typescript/library-types/package.json"));
  } catch {
    throw new Error("@defold-typescript/library-types is not installed");
  }
}

export const LIBRARY_TYPES_ROOT = requireLibraryTypesRoot();

// The newest library data folder: the registries and every file their entries
// name. `LIBRARY_TYPES_ROOT` keeps the toolchain's own outputs and inputs.
export const LIBRARY_DATA_DIR = newestDataFolder(LIBRARY_TYPES_ROOT);
