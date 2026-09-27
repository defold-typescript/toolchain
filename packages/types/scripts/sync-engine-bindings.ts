import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type ApiTarget, loadApiTargets } from "./regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
export const ENGINE_BINDINGS_DIR = "engine-bindings";

const ENGINE_SOURCE = /^engine\/.+\/src\/.+\.cpp$/;
// `profiler.cpp` is the one binding file whose name carries no `script` token.
const BINDING_BASENAME = /script|_props_lua|^profiler\.cpp$/;
// Platform stubs with no Lua surface of their own. `_js` files stay: the web
// build's `script_html5_js.cpp` is the only file that registers `html5`.
const PLATFORM_STUB = /_(null|android)\.cpp$/;
// A kept file either registers a Lua table or defines a `lua_State*` helper a
// binding calls, such as the go property-options reader in `gameobject_script_util.cpp`.
const LUA_SOURCE =
  /\bluaL_register\s*\(|\bluaL_[rR]eg\s+\w+\s*\[\s*\]|\b\w+\s*\(\s*(?:struct\s+)?lua_State\s*\*/;

export interface EngineBindingFile {
  readonly path: string;
  readonly blobSha: string;
  readonly sha256: string;
}

export interface EngineBindingManifest {
  readonly tag: string;
  readonly commit: string;
  readonly files: readonly EngineBindingFile[];
}

export function selectBindingPaths(treePaths: readonly string[]): string[] {
  return treePaths
    .filter((path) => ENGINE_SOURCE.test(path) && !path.includes("/test/"))
    .filter((path) => {
      const basename = path.slice(path.lastIndexOf("/") + 1);
      return BINDING_BASENAME.test(basename) && !PLATFORM_STUB.test(basename);
    })
    .sort();
}

export function isLuaBindingSource(source: string): boolean {
  return LUA_SOURCE.test(source);
}

export function sha256(contents: string | Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

export function bindingsDir(target: ApiTarget, packageRoot: string = PACKAGE_ROOT): string {
  return resolve(packageRoot, target.fixturesDir, ENGINE_BINDINGS_DIR);
}

export function vendoredTargets(targets: readonly ApiTarget[] = loadApiTargets()): ApiTarget[] {
  return targets.filter((target) => target.source === null);
}

export function targetTag(target: ApiTarget): string {
  const tag = target.id.replace(/^defold-/, "");
  if (tag === target.id) throw new Error(`target id ${target.id} names no Defold tag`);
  return tag;
}

async function githubJson(url: string, token: string | undefined): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

interface TreeEntry {
  readonly path: string;
  readonly type: string;
  readonly sha: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function biomeFormatJson(raw: string): string {
  const out = Bun.spawnSync(["bunx", "biome", "format", "--stdin-file-path=manifest.json"], {
    stdin: Buffer.from(raw),
  });
  if (out.exitCode !== 0) {
    throw new Error(`biome format failed: ${out.stderr.toString()}`);
  }
  return out.stdout.toString();
}

export async function syncTarget(
  target: ApiTarget,
  token: string | undefined = process.env.GITHUB_TOKEN,
): Promise<EngineBindingManifest> {
  const tag = targetTag(target);
  const api = "https://api.github.com/repos/defold/defold";
  const { sha: commit } = (await githubJson(`${api}/commits/${tag}`, token)) as { sha: string };
  const tree = (await githubJson(`${api}/git/trees/${commit}?recursive=1`, token)) as {
    truncated: boolean;
    tree: TreeEntry[];
  };
  if (tree.truncated) throw new Error(`tree listing for ${tag} is truncated`);
  const blobs = new Map(
    tree.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha] as const),
  );

  const dir = bindingsDir(target);
  rmSync(dir, { recursive: true, force: true });
  const files: EngineBindingFile[] = [];
  for (const path of selectBindingPaths([...blobs.keys()])) {
    const source = await fetchText(
      `https://raw.githubusercontent.com/defold/defold/${commit}/${path}`,
    );
    if (!isLuaBindingSource(source)) continue;
    const out = resolve(dir, path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, source);
    files.push({ path, blobSha: blobs.get(path) as string, sha256: sha256(source) });
  }
  const manifest: EngineBindingManifest = { tag, commit, files };
  writeFileSync(resolve(dir, "manifest.json"), biomeFormatJson(JSON.stringify(manifest)));
  return manifest;
}

if (import.meta.main) {
  for (const target of vendoredTargets()) {
    const manifest = await syncTarget(target);
    console.log(`${target.id}: ${manifest.files.length} binding files @ ${manifest.commit}`);
  }
}
