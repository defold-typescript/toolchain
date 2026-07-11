import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RegistryTarget } from "./api-registry";

const LABEL_FIXTURE = path.resolve(import.meta.dir, "../../types/fixtures/label_doc.json");
const TYPES_FIXTURES = path.resolve(import.meta.dir, "../../types/fixtures");

interface FakeZip {
  has: (entry: string) => boolean;
  read: (entry: string) => string;
}

// namespace -> ref-doc.zip entry for the multi-kind fixture. Mirrors the
// types-package SYNC_MANIFEST so the fake zip serves docs under the same keys
// `resolveTargetModules` reads.
const MULTI_KIND_ZIP_ENTRIES: Record<string, readonly string[]> = {
  gui: ["doc/gamesys-gui_ddf.proto_doc.json", "doc/gui_script.cpp_doc.json"],
  render: ["doc/render-render_ddf.proto_doc.json", "doc/render-render_script.cpp_doc.json"],
  sprite: ["doc/gamesys-sprite_ddf.proto_doc.json", "doc/scripts-script_sprite.cpp_doc.json"],
};

export const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

// Offline ref-doc resolve options for the `defold-1.9.8` (label-only) target: a
// seeded cache pointing at an in-memory zip that serves the committed label
// fixture. Only `label` is resolved, so the fake zip ignores the entry key.
export function labelRefDocResolveOpts(): {
  cacheDir: string;
  readZip: () => FakeZip;
  download: typeof noDownload;
} {
  const version = "1.9.8";
  const json = readFileSync(LABEL_FIXTURE, "utf8");
  const fakeZip: FakeZip = {
    has: () => true,
    read: () => json,
  };
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ref-doc-"));
  mkdirSync(path.join(cacheDir, version), { recursive: true });
  writeFileSync(path.join(cacheDir, version, "ref-doc.zip"), "seeded");
  return { cacheDir, readZip: () => fakeZip, download: noDownload };
}

// Offline ref-doc resolve options for a multi-namespace target serving a
// restricted-pair (`gui`, `render`) plus a universal module (`sprite`), so a
// kind-narrowed materialization can be observed (the forbidden namespace's
// `.d.ts` drops out while the universal one stays).
export function multiKindRefDocResolveOpts(): {
  cacheDir: string;
  readZip: () => FakeZip;
  download: typeof noDownload;
} {
  const version = "1.9.8";
  const docs: Record<string, string> = {};
  for (const [namespace, zipEntries] of Object.entries(MULTI_KIND_ZIP_ENTRIES)) {
    const fixture = readFileSync(path.join(TYPES_FIXTURES, `${namespace}_doc.json`), "utf8");
    for (const zipEntry of zipEntries) docs[zipEntry] = fixture;
  }
  const fakeZip: FakeZip = {
    has: (entry) => entry in docs,
    read: (entry) => {
      const doc = docs[entry];
      if (doc === undefined) throw new Error(`unexpected zip entry ${entry}`);
      return doc;
    },
  };
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ref-doc-"));
  mkdirSync(path.join(cacheDir, version), { recursive: true });
  writeFileSync(path.join(cacheDir, version, "ref-doc.zip"), "seeded");
  return { cacheDir, readZip: () => fakeZip, download: noDownload };
}

// A registry-shaped `defold-1.9.8` ref-doc target carrying the multi-kind
// module trio, for injecting into `materializeRefDocSurface`/`dispatch` so the
// real (label-only) registry entry need not be mutated to prove narrowing.
export function multiKindRefDocTarget(): RegistryTarget {
  return {
    id: "defold-1.9.8",
    default: false,
    fixturesDir: "fixtures",
    generatedDir: "generated",
    coreTypesImport: "../src/core-types",
    source: { kind: "ref-doc", version: "1.9.8" },
    modules: [
      { namespace: "gui", fixture: "gui_doc.json", outFile: "gui.d.ts" },
      { namespace: "render", fixture: "render_doc.json", outFile: "render.d.ts" },
      { namespace: "sprite", fixture: "sprite_doc.json", outFile: "sprite.d.ts" },
    ],
  };
}
