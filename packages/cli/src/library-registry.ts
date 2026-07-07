// IO shell around the pure `library-match` core: locate the installed
// `@defold-typescript/library-types` package, read its two committed registry
// JSONs, and hand `buildLibraryRegistry` the parsed data. `resolve` calls this
// once per run to match each `assetOnly` `[dependencies]` entry against the
// vendored pure-Lua corpus. Mirrors `api-registry.ts`'s empty-fallback shape so
// a workspace without the corpus degrades to "no libraries" rather than throwing.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import {
  buildLibraryRegistry,
  type LibraryClassification,
  type LibraryTargets,
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

export interface VendoredLibraryRegistry {
  readonly registry: VendoredLibrary[];
  readonly generatedDir: string | null;
}

const EMPTY: VendoredLibraryRegistry = { registry: [], generatedDir: null };

export function loadVendoredLibraryRegistry(
  root: string | null = resolveLibraryTypesPackageRoot(),
): VendoredLibraryRegistry {
  if (root === null) {
    return EMPTY;
  }
  const classificationPath = path.join(root, "library-classification.json");
  const targetsPath = path.join(root, "library-targets.json");
  if (!existsSync(classificationPath) || !existsSync(targetsPath)) {
    return EMPTY;
  }
  try {
    const classification = JSON.parse(
      readFileSync(classificationPath, "utf8"),
    ) as LibraryClassification;
    const targets = JSON.parse(readFileSync(targetsPath, "utf8")) as LibraryTargets;
    return {
      registry: buildLibraryRegistry(classification, targets),
      generatedDir: path.join(root, "generated"),
    };
  } catch {
    return EMPTY;
  }
}
