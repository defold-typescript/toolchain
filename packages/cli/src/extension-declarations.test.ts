import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { resolveExtensionDeclarations } from "./extension-declarations";
import type { ExtensionDependency } from "./extension-deps";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "extension-declarations-"));
}

function dep(url: string, index = 0): ExtensionDependency {
  return { index, url };
}

const ALPHA = `
- name: alpha
  type: table
  desc: Alpha extension.
  members:
  - name: do_alpha
    type: function
    desc: does alpha
    parameters:
      - name: self
        type: object
        desc: the script self
`;

const BRAVO = `
- name: bravo
  type: table
  desc: Bravo extension.
  members:
  - name: VALUE
    type: number
    desc: a constant
`;

interface FakeArchive {
  entries: string[];
  contents: Record<string, string>;
}

const someBytes = async (): Promise<Uint8Array> => new TextEncoder().encode("z");
const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

function makeReadZip(
  byKey: Record<string, FakeArchive>,
  reads: string[],
): (zipPath: string) => ExtensionZip {
  return (zipPath: string) => {
    const archive = byKey[basename(dirname(zipPath))];
    if (archive === undefined) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => archive.entries,
      read: (entry: string) => {
        reads.push(entry);
        const text = archive.contents[entry];
        if (text === undefined) {
          throw new Error(`unexpected read of ${entry}`);
        }
        return text;
      },
    };
  };
}

describe("resolveExtensionDeclarations", () => {
  test("emits one declaration per located .script_api, in sorted path order", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/multi.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/b.script_api", "ext/api/a.script_api", "ext/readme.md"],
        contents: { "ext/api/a.script_api": ALPHA, "ext/api/b.script_api": BRAVO },
      },
    };
    const bundles = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(bundles.length).toBe(1);
    expect(bundles[0]?.assetOnly).toBe(false);
    expect(bundles[0]?.declarations.map((d) => d.namespace)).toEqual(["alpha", "bravo"]);
  });

  test("asset-only dependency is reported with an empty declarations list, not thrown", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/asset.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["asset/foo.png", "asset/readme.md"],
        contents: {},
      },
    };
    const bundles = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(bundles.length).toBe(1);
    expect(bundles[0]?.assetOnly).toBe(true);
    expect(bundles[0]?.declarations).toEqual([]);
    expect(reads).toEqual([]);
  });

  test("provenance and url propagate verbatim from the underlying resolveExtensions result", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/once.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["a.script_api"],
        contents: { "a.script_api": ALPHA },
      },
    };
    const first = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(first[0]?.url).toBe(url);
    expect(first[0]?.provenance).toBe("download");

    const second = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: noDownload,
      readZip: makeReadZip(byKey, reads),
    });
    expect(second[0]?.url).toBe(url);
    expect(second[0]?.provenance).toBe("cache");
  });

  test("two-dependency project maps to two bundles in declared order, reading only located paths", async () => {
    const cacheDir = tmp();
    const url0 = "https://e/0.zip";
    const url1 = "https://e/1.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url0)]: {
        entries: ["ext0/a.script_api", "ext0/readme.md"],
        contents: { "ext0/a.script_api": ALPHA },
      },
      [extensionArchiveKey(url1)]: {
        entries: ["ext1/b.script_api", "ext1/foo.png"],
        contents: { "ext1/b.script_api": BRAVO },
      },
    };
    const bundles = await resolveExtensionDeclarations([dep(url0, 0), dep(url1, 1)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(bundles.map((b) => b.url)).toEqual([url0, url1]);
    expect(bundles[0]?.declarations.map((d) => d.namespace)).toEqual(["alpha"]);
    expect(bundles[1]?.declarations.map((d) => d.namespace)).toEqual(["bravo"]);
    expect(reads).toEqual(["ext0/a.script_api", "ext1/b.script_api"]);
  });

  test("attaches archive .lua module paths as luaModules on an asset-only bundle, wrapper dir stripped", async () => {
    const cacheDir = tmp();
    const url = "https://github.com/owner/libfoo/archive/main.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: [
          "libfoo-main/libfoo/util.lua",
          "libfoo-main/libfoo/core.lua",
          "libfoo-main/README.md",
        ],
        contents: {},
      },
    };
    const bundles = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(bundles[0]?.assetOnly).toBe(true);
    expect(bundles[0]?.luaModules).toEqual(["libfoo.core", "libfoo.util"]);
    expect(reads).toEqual([]);
  });

  test("attaches luaModules to a .script_api bundle alongside its declarations", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/mixed.zip";
    const reads: string[] = [];
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["mixed-main/api/alpha.script_api", "mixed-main/lua/helper.lua"],
        contents: { "mixed-main/api/alpha.script_api": ALPHA },
      },
    };
    const bundles = await resolveExtensionDeclarations([dep(url)], {
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey, reads),
    });
    expect(bundles[0]?.assetOnly).toBe(false);
    expect(bundles[0]?.declarations.map((d) => d.namespace)).toEqual(["alpha"]);
    expect(bundles[0]?.luaModules).toEqual(["lua.helper"]);
  });
});
