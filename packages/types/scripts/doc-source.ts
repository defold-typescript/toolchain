import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readZip, refDocUrl, type ZipAccessor } from "./sync-api-docs";

export type DocSourceProvenance = "cache" | "local" | "download";

export interface ResolvedRefDoc {
  zip: ZipAccessor;
  zipPath: string;
  provenance: DocSourceProvenance;
}

// Download by the *resolved* URL (channel-aware), not by re-deriving it from the
// version: stable is the GitHub release URL, beta/alpha are the channel-head
// archive on d.defold.com.
export type DownloadRefDoc = (url: string) => Promise<Uint8Array>;

export type LocateLocalRefDoc = (version: string) => string | null;

export type RefDocChannel = "stable" | "beta" | "alpha";

export const DEFAULT_REF_DOC_CHANNEL: RefDocChannel = "stable";

export const channelInfoUrl = (channel: RefDocChannel): string =>
  `https://d.defold.com/${channel}/info.json`;

// The channel segment is canonical; the bare `archive/<sha>/...` form
// 301-redirects to `archive/<channel>/<sha>/...`.
export const channelArchiveUrl = (channel: RefDocChannel, sha1: string): string =>
  `https://d.defold.com/archive/${channel}/${sha1}/engine/share/ref-doc.zip`;

export interface ChannelInfo {
  readonly version: string;
  readonly sha1: string;
}

export type FetchChannelInfo = (channel: RefDocChannel) => Promise<ChannelInfo>;

export function createFetchChannelInfo(fetchImpl: typeof fetch = fetch): FetchChannelInfo {
  return async (channel) => {
    const url = channelInfoUrl(channel);
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(
        `channel info fetch failed for '${channel}': ${url} -> ${res.status} ${res.statusText}`,
      );
    }
    const data = (await res.json()) as ChannelInfo;
    return { version: data.version, sha1: data.sha1 };
  };
}

const defaultFetchChannelInfo: FetchChannelInfo = createFetchChannelInfo();

export interface RefDocDownloadPlan {
  readonly url: string;
  readonly cacheSubdir: string;
}

// Where the ref-doc bytes live and where they cache. Stable is version-addressed
// (GitHub release, `<version>` subdir) with no network probe; beta/alpha are
// channel-head-addressed, so the channel head sha is read from info.json and the
// cache is scoped `<channel>/<sha1>`.
export async function resolveDownloadPlan(opts: {
  version: string;
  channel?: RefDocChannel;
  fetchChannelInfo?: FetchChannelInfo;
}): Promise<RefDocDownloadPlan> {
  const channel = opts.channel ?? DEFAULT_REF_DOC_CHANNEL;
  if (channel === "stable") {
    return { url: refDocUrl(opts.version), cacheSubdir: opts.version };
  }
  const info = await (opts.fetchChannelInfo ?? defaultFetchChannelInfo)(channel);
  return { url: channelArchiveUrl(channel, info.sha1), cacheSubdir: join(channel, info.sha1) };
}

export function defaultDistributionRoots(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string[] {
  switch (platform) {
    case "darwin":
      return ["/Applications/Defold", join(home(), "Applications", "Defold")];
    case "linux":
      return [join(home(), "Defold"), "/opt/Defold"];
    case "win32":
      return [env.LOCALAPPDATA, env.PROGRAMFILES]
        .filter((root): root is string => Boolean(root))
        .map((root) => join(root, "Defold"));
    default:
      return [];
  }
}

export function localRefDocLocator(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: () => string = homedir,
): LocateLocalRefDoc {
  const roots = [
    ...(env.DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION ? [env.DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION] : []),
    ...defaultDistributionRoots(platform, env, home),
  ];
  return (version) => {
    for (const root of roots) {
      const path = join(root, version, "ref-doc.zip");
      if (existsSync(path)) {
        return path;
      }
    }
    return null;
  };
}

export function refDocCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string {
  if (env.DEFOLD_TYPESCRIPT_CACHE) {
    return join(env.DEFOLD_TYPESCRIPT_CACHE, "ref-doc");
  }
  return join(env.XDG_CACHE_HOME ?? join(home(), ".cache"), "defold-typescript", "ref-doc");
}

const fetchRefDoc: DownloadRefDoc = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: ${url} -> ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
};

export async function resolveRefDoc(opts: {
  version: string;
  cacheDir: string;
  channel?: RefDocChannel;
  download?: DownloadRefDoc;
  locate?: LocateLocalRefDoc;
  readZip?: typeof readZip;
  fetchChannelInfo?: FetchChannelInfo;
}): Promise<ResolvedRefDoc> {
  const open = opts.readZip ?? readZip;
  const plan = await resolveDownloadPlan({
    version: opts.version,
    ...(opts.channel ? { channel: opts.channel } : {}),
    ...(opts.fetchChannelInfo ? { fetchChannelInfo: opts.fetchChannelInfo } : {}),
  });
  const zipPath = join(opts.cacheDir, plan.cacheSubdir, "ref-doc.zip");
  if (existsSync(zipPath)) {
    return { zip: open(zipPath), zipPath, provenance: "cache" };
  }
  const locate = opts.locate ?? localRefDocLocator();
  const localPath = locate(opts.version);
  if (localPath && existsSync(localPath)) {
    mkdirSync(dirname(zipPath), { recursive: true });
    copyFileSync(localPath, zipPath);
    return { zip: open(zipPath), zipPath, provenance: "local" };
  }
  const download = opts.download ?? fetchRefDoc;
  const bytes = await download(plan.url);
  mkdirSync(dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, bytes);
  return { zip: open(zipPath), zipPath, provenance: "download" };
}
