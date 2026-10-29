import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive } from "../../types/test/zip-fixture";
import {
  type DownloadExtensionArchive,
  type ExtensionZip,
  extensionArchiveKey,
  extensionCacheDir,
  resolveExtensionArchive,
  resolveExtensions,
} from "./extension-archive";
import type { ExtensionDependency } from "./extension-deps";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "extension-archive-"));
}

const noDownload: DownloadExtensionArchive = async () => {
  throw new Error("download should not be called");
};

function ok(text: string, etag?: string): ReturnType<DownloadExtensionArchive> {
  return Promise.resolve({
    status: "ok",
    bytes: new TextEncoder().encode(text),
    ...(etag === undefined ? {} : { etag }),
  });
}

function fakeZip(entries: string[]): ExtensionZip {
  return {
    entries: () => entries,
    read: (entry) => {
      throw new Error(`read should not be called: ${entry}`);
    },
    comment: () => "",
    bytes: () => new Uint8Array(0),
  };
}

function dep(url: string, index = 0): ExtensionDependency {
  return { index, url };
}

// Every file under `dir` with its contents, to show a run wrote nothing there.
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true }) as string[]) {
    const path = join(dir, name);
    out[name] = statSync(path).isDirectory() ? "<dir>" : readFileSync(path, "base64");
  }
  return out;
}

describe("extensionCacheDir", () => {
  test("honors DEFOLD_TYPESCRIPT_CACHE override", () => {
    expect(extensionCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/custom/root" }, () => "/home/u")).toBe(
      join("/custom/root", "extensions"),
    );
  });

  test("falls back to XDG_CACHE_HOME when override unset", () => {
    expect(extensionCacheDir({ XDG_CACHE_HOME: "/xdg/cache" }, () => "/home/u")).toBe(
      join("/xdg/cache", "defold-typescript", "extensions"),
    );
  });

  test("falls back to <homedir>/.cache when neither env var set", () => {
    expect(extensionCacheDir({}, () => "/home/u")).toBe(
      join("/home/u", ".cache", "defold-typescript", "extensions"),
    );
  });
});

describe("resolveExtensionArchive", () => {
  test("cache miss: downloads once, stores the archive and its ETag, provenance download", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/ext.zip";
    const sent: (string | undefined)[] = [];
    const download: DownloadExtensionArchive = async (target, etag) => {
      sent.push(etag);
      return ok(`bytes-${target}`, '"v1"');
    };
    const result = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download,
      readZip: () => fakeZip(["ext/api/ext.script_api", "ext/readme.md"]),
    });
    expect(sent).toEqual([undefined]);
    expect(result.provenance).toBe("download");
    expect(result.url).toBe(url);
    expect(result.scriptApis).toEqual(["ext/api/ext.script_api"]);
    expect(result.assetOnly).toBe(false);
    const expectedPath = join(cacheDir, extensionArchiveKey(url), "archive.zip");
    expect(result.archivePath).toBe(expectedPath);
    expect(readFileSync(expectedPath, "utf8")).toBe(`bytes-${url}`);
    expect(readFileSync(join(dirname(expectedPath), "etag"), "utf8")).toBe('"v1"');
  });

  test("a cached copy is revalidated by its ETag; not modified serves the cache", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/ext.zip";
    const readZip = () => fakeZip(["a.script_api"]);
    await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: () => ok("v1", '"v1"'),
      readZip,
    });

    const sent: (string | undefined)[] = [];
    const second = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: async (_url, etag) => {
        sent.push(etag);
        return { status: "not-modified" };
      },
      readZip,
    });
    expect(sent).toEqual(['"v1"']);
    expect(second.provenance).toBe("cache");
    expect(second.scriptApis).toEqual(["a.script_api"]);
    expect(readFileSync(second.archivePath, "utf8")).toBe("v1");
  });

  test("a changed archive replaces the cached copy and its ETag", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/master.zip";
    const readZip = () => fakeZip(["a.script_api"]);
    await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: () => ok("v1", '"v1"'),
      readZip,
    });

    const second = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: () => ok("v2", '"v2"'),
      readZip,
    });
    expect(second.provenance).toBe("download");
    expect(readFileSync(second.archivePath, "utf8")).toBe("v2");
    expect(readFileSync(join(dirname(second.archivePath), "etag"), "utf8")).toBe('"v2"');

    const sent: (string | undefined)[] = [];
    await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: async (_url, etag) => {
        sent.push(etag);
        return { status: "not-modified" };
      },
      readZip,
    });
    expect(sent).toEqual(['"v2"']);
  });

  test("a failed download serves the cached copy and warns, naming the URL", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/ext.zip";
    const readZip = () => fakeZip(["a.script_api"]);
    await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: () => ok("v1", '"v1"'),
      readZip,
    });

    const offline = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: async () => {
        throw new Error("getaddrinfo ENOTFOUND example.com");
      },
      readZip,
    });
    expect(offline.provenance).toBe("cache");
    expect(readFileSync(offline.archivePath, "utf8")).toBe("v1");
    expect(offline.warning).toContain(url);
    expect(offline.warning).toContain("getaddrinfo ENOTFOUND example.com");
  });

  test("a failed download with no cached copy fails", async () => {
    const url = "https://example.com/ext.zip";
    await expect(
      resolveExtensionArchive(dep(url), {
        cacheDir: tmp(),
        download: async () => {
          throw new Error("getaddrinfo ENOTFOUND example.com");
        },
        readZip: () => fakeZip(["a.script_api"]),
      }),
    ).rejects.toThrow("getaddrinfo ENOTFOUND example.com");
  });

  test("asset-only archive: no .script_api yields assetOnly, reported not thrown", async () => {
    const cacheDir = tmp();
    const result = await resolveExtensionArchive(dep("https://example.com/asset.zip"), {
      cacheDir,
      download: () => ok("z"),
      readZip: () => fakeZip(["asset/foo.png", "asset/readme.md"]),
    });
    expect(result.assetOnly).toBe(true);
    expect(result.scriptApis).toEqual([]);
    expect(result.provenance).toBe("download");
  });

  describe("Defold's fetched archives", () => {
    // Named the way Defold names it in `.internal/lib/`: the sha1 of the URL,
    // then the base64 of the ETag it was served with.
    const url = "https://github.com/king8fisher/defold-pixels/archive/refs/heads/master.zip";
    const urlSha1 = "f7a4a6e51f23d741a5f233b044f3c47395025345";
    const commit = "d1b21f1956652ca7ed5e17497aa702b2afbab349";

    function fetchedProject(comment: string): { projectDir: string; zipPath: string } {
      const projectDir = tmp();
      const lib = join(projectDir, ".internal", "lib");
      mkdirSync(lib, { recursive: true });
      writeFileSync(
        join(lib, "dependencies.json"),
        JSON.stringify([{ url, "commit-sha1": commit, "payload-sha1": "a".repeat(40) }]),
      );
      const zipPath = join(lib, `${urlSha1}-${Buffer.from('"e1"').toString("base64")}.zip`);
      writeFileSync(
        zipPath,
        writeZipArchive(
          [{ name: "defold-pixels-master/api/pixels.script_api", text: "- name: pixels\n" }],
          { comment },
        ),
      );
      return { projectDir, zipPath };
    }

    test("serves the zip Defold fetched for the listed commit, writing nothing", async () => {
      const { projectDir, zipPath } = fetchedProject(commit);
      const cacheDir = tmp();
      const before = snapshot(projectDir);

      const result = await resolveExtensionArchive(dep(url), {
        cacheDir,
        projectDir,
        download: noDownload,
        readZip,
      });

      expect(result.provenance).toBe("defold");
      expect(result.archivePath).toBe(zipPath);
      expect(result.scriptApis).toEqual(["defold-pixels-master/api/pixels.script_api"]);
      expect(result.resolvedVersion).toBe(`commit:${commit}`);
      expect(snapshot(projectDir)).toEqual(before);
      expect(readdirSync(cacheDir)).toEqual([]);
    });

    test("downloads instead when Defold's zip does not carry the listed commit", async () => {
      const { projectDir } = fetchedProject("0123456789abcdef0123456789abcdef01234567");
      const cacheDir = tmp();
      let calls = 0;
      const archive = writeZipArchive([{ name: "pixels/pixels.script_api", text: "" }]);

      const result = await resolveExtensionArchive(dep(url), {
        cacheDir,
        projectDir,
        download: async () => {
          calls++;
          return { status: "ok", bytes: archive };
        },
        readZip,
      });

      expect(calls).toBe(1);
      expect(result.provenance).toBe("download");
      expect(result.archivePath).toBe(join(cacheDir, extensionArchiveKey(url), "archive.zip"));
    });
  });
});

describe("resolveExtensions", () => {
  test("maps each dependency to one resolved extension, in index order", async () => {
    const cacheDir = tmp();
    const deps = [dep("https://e/0.zip", 0), dep("https://e/1.zip", 1)];
    const entriesByKey: Record<string, string[]> = {
      [extensionArchiveKey("https://e/0.zip")]: ["zero.script_api"],
      [extensionArchiveKey("https://e/1.zip")]: ["one/api.script_api"],
    };
    const results = await resolveExtensions(deps, {
      cacheDir,
      download: () => ok("z"),
      readZip: (zipPath) => fakeZip(entriesByKey[basename(dirname(zipPath))] ?? []),
    });
    expect(results.length).toBe(2);
    expect(results[0]?.url).toBe("https://e/0.zip");
    expect(results[0]?.scriptApis).toEqual(["zero.script_api"]);
    expect(results[1]?.url).toBe("https://e/1.zip");
    expect(results[1]?.scriptApis).toEqual(["one/api.script_api"]);
  });
});
