import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  channelArchiveUrl,
  channelInfoUrl,
  createFetchChannelInfo,
  defaultDistributionRoots,
  localRefDocLocator,
  refDocCacheDir,
  resolveDownloadPlan,
  resolveRefDoc,
} from "./doc-source";
import { refDocUrl, type ZipAccessor } from "./sync-api-docs";

function fakeReadZip(path: string): ZipAccessor {
  return {
    has: () => true,
    entries: () => [],
    read: () => readFileSync(path, "utf8"),
  };
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "doc-source-test-"));
}

describe("refDocCacheDir", () => {
  test("honors DEFOLD_TYPESCRIPT_CACHE override", () => {
    const dir = refDocCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/custom/root" }, () => "/home/u");
    expect(dir).toBe(join("/custom/root", "ref-doc"));
  });

  test("falls back to XDG_CACHE_HOME when override unset", () => {
    const dir = refDocCacheDir({ XDG_CACHE_HOME: "/xdg/cache" }, () => "/home/u");
    expect(dir).toBe(join("/xdg/cache", "defold-typescript", "ref-doc"));
  });

  test("falls back to <homedir>/.cache when neither env var set", () => {
    const dir = refDocCacheDir({}, () => "/home/u");
    expect(dir).toBe(join("/home/u", ".cache", "defold-typescript", "ref-doc"));
  });
});

describe("localRefDocLocator", () => {
  test("returns null for any version when env var unset", () => {
    const locate = localRefDocLocator({});
    expect(locate("1.2.3")).toBeNull();
  });

  test("returns <root>/<version>/ref-doc.zip when env set and file exists", () => {
    const root = tmp();
    const zipPath = join(root, "1.2.3", "ref-doc.zip");
    mkdirSync(join(root, "1.2.3"), { recursive: true });
    writeFileSync(zipPath, "local-bytes");
    const locate = localRefDocLocator({ DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION: root });
    expect(locate("1.2.3")).toBe(zipPath);
  });

  test("returns null when env set but no matching file exists", () => {
    const root = tmp();
    const locate = localRefDocLocator({ DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION: root });
    expect(locate("1.2.3")).toBeNull();
  });

  test("auto-probes a platform root when no env var is set", () => {
    const home = tmp();
    const zipPath = join(home, "Applications", "Defold", "1.2.3", "ref-doc.zip");
    mkdirSync(join(home, "Applications", "Defold", "1.2.3"), { recursive: true });
    writeFileSync(zipPath, "local-bytes");
    const locate = localRefDocLocator({}, "darwin", () => home);
    expect(locate("1.2.3")).toBe(zipPath);
  });

  test("prefers the env root over a platform root when both hold the file", () => {
    const envRoot = tmp();
    const home = tmp();
    const envZip = join(envRoot, "1.2.3", "ref-doc.zip");
    mkdirSync(join(envRoot, "1.2.3"), { recursive: true });
    writeFileSync(envZip, "env-bytes");
    const platZip = join(home, "Applications", "Defold", "1.2.3", "ref-doc.zip");
    mkdirSync(join(home, "Applications", "Defold", "1.2.3"), { recursive: true });
    writeFileSync(platZip, "plat-bytes");
    const locate = localRefDocLocator(
      { DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION: envRoot },
      "darwin",
      () => home,
    );
    expect(locate("1.2.3")).toBe(envZip);
  });

  test("returns null when neither env var nor any platform root holds the file", () => {
    const home = tmp();
    const locate = localRefDocLocator({}, "darwin", () => home);
    expect(locate("1.2.3")).toBeNull();
  });
});

describe("defaultDistributionRoots", () => {
  test("darwin returns the system and per-user Applications roots in order", () => {
    expect(defaultDistributionRoots("darwin", {}, () => "/home/u")).toEqual([
      "/Applications/Defold",
      join("/home/u", "Applications", "Defold"),
    ]);
  });

  test("linux returns the home and /opt roots", () => {
    expect(defaultDistributionRoots("linux", {}, () => "/home/u")).toEqual([
      join("/home/u", "Defold"),
      "/opt/Defold",
    ]);
  });

  test("win32 returns the Defold dir under each set env root, skipping unset ones", () => {
    expect(
      defaultDistributionRoots(
        "win32",
        { LOCALAPPDATA: "C:\\la", PROGRAMFILES: "C:\\pf" },
        () => "C:\\u",
      ),
    ).toEqual([join("C:\\la", "Defold"), join("C:\\pf", "Defold")]);
    expect(defaultDistributionRoots("win32", { PROGRAMFILES: "C:\\pf" }, () => "C:\\u")).toEqual([
      join("C:\\pf", "Defold"),
    ]);
  });

  test("unknown platform returns no roots", () => {
    expect(defaultDistributionRoots("freebsd", {}, () => "/home/u")).toEqual([]);
  });
});

describe("resolveRefDoc", () => {
  test("cache miss: downloads once, persists archive, provenance download", async () => {
    const cacheDir = tmp();
    let calls = 0;
    const download = async (_url: string) => {
      calls++;
      return new TextEncoder().encode("zip-bytes-1.2.3");
    };
    const result = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download,
      readZip: fakeReadZip,
    });
    expect(calls).toBe(1);
    expect(result.provenance).toBe("download");
    const zipPath = join(cacheDir, "1.2.3", "ref-doc.zip");
    expect(result.zipPath).toBe(zipPath);
    expect(readFileSync(zipPath, "utf8")).toBe("zip-bytes-1.2.3");
    expect(result.zip.read("any")).toBe("zip-bytes-1.2.3");
  });

  test("cache hit: pre-seeded archive served without download, provenance cache", async () => {
    const cacheDir = tmp();
    const zipPath = join(cacheDir, "1.2.3", "ref-doc.zip");
    mkdirSync(join(cacheDir, "1.2.3"), { recursive: true });
    writeFileSync(zipPath, "seeded-bytes");
    let calls = 0;
    const download = async () => {
      calls++;
      return new Uint8Array();
    };
    const result = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download,
      readZip: fakeReadZip,
    });
    expect(calls).toBe(0);
    expect(result.provenance).toBe("cache");
    expect(result.zip.read("any")).toBe("seeded-bytes");
  });

  test("persistence: second call for same version serves from cache", async () => {
    const cacheDir = tmp();
    let calls = 0;
    const download = async (version: string) => {
      calls++;
      return new TextEncoder().encode(`zip-${version}`);
    };
    const first = await resolveRefDoc({
      version: "9.9.9",
      cacheDir,
      download,
      readZip: fakeReadZip,
    });
    const second = await resolveRefDoc({
      version: "9.9.9",
      cacheDir,
      download,
      readZip: fakeReadZip,
    });
    expect(calls).toBe(1);
    expect(first.provenance).toBe("download");
    expect(second.provenance).toBe("cache");
  });

  test("local hit: cache miss resolves located archive, copies to cache, provenance local", async () => {
    const cacheDir = tmp();
    const distRoot = tmp();
    const localPath = join(distRoot, "1.2.3", "ref-doc.zip");
    mkdirSync(join(distRoot, "1.2.3"), { recursive: true });
    writeFileSync(localPath, "local-archive-bytes");
    let downloads = 0;
    const download = async () => {
      downloads++;
      return new Uint8Array();
    };
    const result = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download,
      locate: () => localPath,
      readZip: fakeReadZip,
    });
    expect(downloads).toBe(0);
    expect(result.provenance).toBe("local");
    const zipPath = join(cacheDir, "1.2.3", "ref-doc.zip");
    expect(result.zipPath).toBe(zipPath);
    expect(readFileSync(zipPath, "utf8")).toBe("local-archive-bytes");
    expect(result.zip.read("any")).toBe("local-archive-bytes");
  });

  test("local-hit persistence: second call serves from cache, locate and download unused", async () => {
    const cacheDir = tmp();
    const distRoot = tmp();
    const localPath = join(distRoot, "1.2.3", "ref-doc.zip");
    mkdirSync(join(distRoot, "1.2.3"), { recursive: true });
    writeFileSync(localPath, "local-archive-bytes");
    let downloads = 0;
    let locates = 0;
    const download = async () => {
      downloads++;
      return new Uint8Array();
    };
    const locate = () => {
      locates++;
      return localPath;
    };
    const first = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download,
      locate,
      readZip: fakeReadZip,
    });
    const second = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download,
      locate,
      readZip: fakeReadZip,
    });
    expect(first.provenance).toBe("local");
    expect(second.provenance).toBe("cache");
    expect(locates).toBe(1);
    expect(downloads).toBe(0);
  });

  test("cache precedence: pre-seeded cache never consults locate", async () => {
    const cacheDir = tmp();
    const zipPath = join(cacheDir, "1.2.3", "ref-doc.zip");
    mkdirSync(join(cacheDir, "1.2.3"), { recursive: true });
    writeFileSync(zipPath, "seeded-bytes");
    let locates = 0;
    const result = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download: async () => new Uint8Array(),
      locate: () => {
        locates++;
        return null;
      },
      readZip: fakeReadZip,
    });
    expect(locates).toBe(0);
    expect(result.provenance).toBe("cache");
  });

  test("local miss: locate returns null, download fires once, provenance download", async () => {
    const cacheDir = tmp();
    let downloads = 0;
    const result = await resolveRefDoc({
      version: "1.2.3",
      cacheDir,
      download: async () => {
        downloads++;
        return new TextEncoder().encode("zip-bytes");
      },
      locate: () => null,
      readZip: fakeReadZip,
    });
    expect(downloads).toBe(1);
    expect(result.provenance).toBe("download");
  });

  test("beta: cache miss downloads the channel-head archive, caches it channel-scoped", async () => {
    const cacheDir = tmp();
    let downloadedUrl: string | undefined;
    const result = await resolveRefDoc({
      version: "1.12.4",
      channel: "beta",
      cacheDir,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "deadbeef" }),
      download: async (url) => {
        downloadedUrl = url;
        return new TextEncoder().encode("beta-bytes");
      },
      locate: () => null,
      readZip: fakeReadZip,
    });
    expect(downloadedUrl).toBe(channelArchiveUrl("beta", "deadbeef"));
    expect(result.provenance).toBe("download");
    const zipPath = join(cacheDir, "beta", "deadbeef", "ref-doc.zip");
    expect(result.zipPath).toBe(zipPath);
    expect(readFileSync(zipPath, "utf8")).toBe("beta-bytes");

    const second = await resolveRefDoc({
      version: "1.12.4",
      channel: "beta",
      cacheDir,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "deadbeef" }),
      download: async () => {
        throw new Error("download should not run on a channel-scoped cache hit");
      },
      locate: () => null,
      readZip: fakeReadZip,
    });
    expect(second.provenance).toBe("cache");
    expect(second.zipPath).toBe(zipPath);
  });

  test("stable: channel-scoped path and fetchChannelInfo are not used", async () => {
    const cacheDir = tmp();
    let infoCalls = 0;
    const result = await resolveRefDoc({
      version: "1.12.4",
      channel: "stable",
      cacheDir,
      fetchChannelInfo: async () => {
        infoCalls++;
        return { version: "1.12.4", sha1: "irrelevant" };
      },
      download: async () => new TextEncoder().encode("stable-bytes"),
      locate: () => null,
      readZip: fakeReadZip,
    });
    expect(infoCalls).toBe(0);
    expect(result.zipPath).toBe(join(cacheDir, "1.12.4", "ref-doc.zip"));
  });
});

describe("channel URL builders", () => {
  test("channelInfoUrl points at the per-channel info.json", () => {
    expect(channelInfoUrl("beta")).toBe("https://d.defold.com/beta/info.json");
  });

  test("channelArchiveUrl points at the channel-scoped ref-doc.zip", () => {
    expect(channelArchiveUrl("alpha", "abc123")).toBe(
      "https://d.defold.com/archive/alpha/abc123/engine/share/ref-doc.zip",
    );
  });
});

describe("resolveDownloadPlan", () => {
  test("stable uses the GitHub release URL and version cache subdir, no info fetch", async () => {
    let infoCalls = 0;
    const plan = await resolveDownloadPlan({
      version: "1.12.4",
      channel: "stable",
      fetchChannelInfo: async () => {
        infoCalls++;
        return { version: "1.12.4", sha1: "x" };
      },
    });
    expect(plan.url).toBe(refDocUrl("1.12.4"));
    expect(plan.cacheSubdir).toBe("1.12.4");
    expect(infoCalls).toBe(0);
  });

  test("omitted channel defaults to stable", async () => {
    const plan = await resolveDownloadPlan({ version: "1.12.4" });
    expect(plan.url).toBe(refDocUrl("1.12.4"));
    expect(plan.cacheSubdir).toBe("1.12.4");
  });

  test("beta resolves the channel head and scopes the cache subdir by sha", async () => {
    let seenChannel: string | undefined;
    const plan = await resolveDownloadPlan({
      version: "1.12.4",
      channel: "beta",
      fetchChannelInfo: async (channel) => {
        seenChannel = channel;
        return { version: "1.13.0", sha1: "deadbeef" };
      },
    });
    expect(seenChannel).toBe("beta");
    expect(plan.url).toBe(channelArchiveUrl("beta", "deadbeef"));
    expect(plan.cacheSubdir).toBe(join("beta", "deadbeef"));
  });
});

describe("createFetchChannelInfo", () => {
  test("parses version and sha1 from a 200 info.json", async () => {
    const fetchInfo = createFetchChannelInfo((async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ version: "1.13.0", sha1: "deadbeef" }),
    })) as unknown as typeof fetch);
    expect(await fetchInfo("beta")).toEqual({ version: "1.13.0", sha1: "deadbeef" });
  });

  test("a non-ok response throws an error naming the channel and the info.json URL", async () => {
    const fetchInfo = createFetchChannelInfo((async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    })) as unknown as typeof fetch);
    await expect(fetchInfo("beta")).rejects.toThrow(/beta/);
    await expect(fetchInfo("beta")).rejects.toThrow(channelInfoUrl("beta"));
  });
});
