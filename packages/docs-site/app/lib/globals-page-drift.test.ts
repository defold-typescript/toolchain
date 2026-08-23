import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadApiSurfaceForVersion,
  loadCombinedSurface,
  versionsWithDiskFixtures,
} from "./api-surface-loader";

// `api-content`'s `apiVersions` / `apiPagesForVersion` / `combinedSurface` are
// `process.cwd()`-bound one-line delegations to these loaders, so a root-level
// `bun test` has to name the real types dir the way the sibling drift guards do.
const TYPES_DIR = join(import.meta.dir, "../../../types");
const GLOBALS_NAMESPACE = "globals";

// `defold-1.9.8` is a `source: {kind: "ref-doc"}` target and legitimately carries
// no fixture tree; only committed targets own a globals document.
function committedVersionIds(): string[] {
  const { targets } = JSON.parse(readFileSync(join(TYPES_DIR, "api-targets.json"), "utf8")) as {
    targets: { id: string; source?: unknown }[];
  };
  const committed = new Set(targets.filter((t) => (t.source ?? null) === null).map((t) => t.id));
  return versionsWithDiskFixtures(TYPES_DIR)
    .map((v) => v.id)
    .filter((id) => committed.has(id));
}

function defaultBareVersion(): string {
  const version = versionsWithDiskFixtures(TYPES_DIR).find((v) => v.isDefault);
  if (!version) throw new Error("no default API version");
  return version.id.replace(/^defold-/, "");
}

describe("globals page drift guard", () => {
  test("no canonical globals symbol reads as absent from the default Defold target", () => {
    const surface = loadCombinedSurface(TYPES_DIR);
    const globals = surface.namespaces.find((ns) => ns.namespace === GLOBALS_NAMESPACE);
    if (!globals) throw new Error("no globals namespace on the Combined surface");
    expect(globals.entries.length).toBeGreaterThan(0);
    const current = defaultBareVersion();
    const absent = globals.entries
      .filter((entry) => !entry.availableIn.includes(current))
      .map((entry) => entry.identity.name);
    expect(absent).toEqual([]);
  });

  test("every committed version renders a globals page", () => {
    const ids = committedVersionIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const namespaces = loadApiSurfaceForVersion(TYPES_DIR, id).map((p) => p.namespace);
      expect(namespaces).toContain(GLOBALS_NAMESPACE);
    }
  });
});
