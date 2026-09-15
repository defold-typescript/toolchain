import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModuleManifestEntry } from "./regen";

// Committed declarations the `resolve` emitter must reproduce for the extensions
// whose ref-docs this repo carries. They are a golden lane, not a surface: no
// entrypoint, kind index or pinned version imports them. They live in their own
// module because `resolve` imports `regen.ts` from the published package, which
// does not ship these root fixtures, so reading them at `regen.ts` load time would
// break every installed `resolve`.
export const EXTENSION_GOLDENS_DIR = "extension-goldens";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const EXTENSION_GOLDEN_NAMESPACES = ["iac", "iap", "push", "webview"] as const;

export const EXTENSION_GOLDEN_MANIFEST: readonly ModuleManifestEntry[] =
  EXTENSION_GOLDEN_NAMESPACES.map((namespace) => ({
    namespace,
    doc: JSON.parse(
      readFileSync(resolve(PACKAGE_ROOT, "fixtures", `${namespace}_doc.json`), "utf8"),
    ),
    outFile: `${namespace}.d.ts`,
  }));
