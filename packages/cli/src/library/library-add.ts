// `library add` starts a library folder from the URL a game would depend on: the
// pin, and a first recipe with the upstream files it reads when the archive's own
// files can generate one. Everything comes out of the one archive, at the paths
// the re-pin fetchers use, and a folder the reader refuses is never left behind.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import {
  archiveGameProjectEntry,
  archiveWrapperOf,
  isContainedResourcePath,
  libraryIncludeDirFiles,
  readLibraryIncludeDirs,
} from "@defold-typescript/transpiler";
import {
  type DownloadExtensionArchive,
  defaultReadZip,
  type ExtensionZip,
  extensionCacheDir,
  resolveExtensionArchive,
} from "../extension-archive";
import {
  type LualsEntry,
  libraryFolderName,
  type RecipeJson,
  readLibraryData,
  type ScriptApiEntry,
  writeLibraryJson,
  writeRecipeJson,
  writeReviewedJson,
} from "./library-data";
import {
  includedEvidence,
  includedScriptApiPaths,
  isApiPath,
  LUALS_ANNOTATION,
  NON_API_DIRS,
  portalEntryKind,
} from "./library-evidence";
import { selectLualsSources } from "./sync-luals-types";

export interface AddLibraryOptions {
  readonly cacheDir?: string;
  readonly download?: DownloadExtensionArchive;
}

export interface AddedLibrary {
  readonly folder: string;
  readonly notes: string[];
}

const FORK_GUIDE = "authoring-forked-library-types.md";
const EXTENSIONS_GUIDE = "extensions.md";
const COMMIT_PIN = "commit:";
const MOVING_REFS: ReadonlySet<string> = new Set(["master", "main"]);
const ARCHIVE_URL = /^(https?:\/\/[^/]+\/.+?)\/archive\/(?:refs\/(tags|heads)\/)?(.+)\.zip$/i;
const LICENSE_FILE = /^licen[cs]e(\.(md|txt))?$/i;

// A branch has no fixed name to pin, so `tag` is left unset and the archive's
// commit pins it. A bare `/archive/<name>.zip` is a tag unless it is a default branch.
function readArchiveUrl(url: string): { repo: string; tag?: string } {
  const match = ARCHIVE_URL.exec(url.split(/[?#]/, 1)[0] ?? "");
  const [, repo, kind, name] = match ?? [];
  if (repo === undefined || name === undefined) {
    throw new Error(`${url} is not a repository archive URL: expected <repo>/archive/<ref>.zip`);
  }
  return kind === "heads" || (kind === undefined && MOVING_REFS.has(name))
    ? { repo }
    : { repo, tag: name };
}

function licenseId(text: string): string | undefined {
  const [first = "", second = ""] = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (/\bMIT\b/.test(first)) return "MIT";
  if (
    /\bApache[- ]2\.0\b/i.test(first) ||
    (/\bApache License\b/i.test(first) && /\bVersion 2\.0\b/i.test(`${first} ${second}`))
  ) {
    return "Apache-2.0";
  }
  const bsd = /\bBSD[- ]([23])-Clause\b/i.exec(first);
  if (bsd !== null) return `BSD-${bsd[1]}-Clause`;
  return /\bzlib\b/i.test(first) ? "Zlib" : undefined;
}

function archiveLicense(zip: ExtensionZip): string | undefined {
  const entries = zip.entries();
  const wrapper = archiveWrapperOf(entries);
  const file = entries.find((entry) =>
    LICENSE_FILE.test(wrapper === undefined ? entry : entry.slice(wrapper.length + 1)),
  );
  return file === undefined ? undefined : licenseId(zip.read(file));
}

interface Recipe {
  readonly recipe: RecipeJson;
  // Each upstream path, by the path it is copied to under the library folder.
  readonly copies: Map<string, string>;
  readonly notes: string[];
}

function lualsRecipe(
  paths: readonly string[],
  annotated: readonly string[],
  includeDirs: readonly string[],
): Recipe {
  const named = includeDirs
    .map((dir) => `${dir}/${posix.basename(dir)}.lua`)
    .find((path) => annotated.includes(path));
  const own = named ?? (annotated[0] as string);
  const moduleId = own.slice(0, -".lua".length).replaceAll("/", ".");
  const namespace = posix.basename(own, ".lua");
  const lua = paths.filter((path) => path.endsWith(".lua"));
  const ignore = [...NON_API_DIRS]
    .filter((dir) => lua.some((path) => path.split("/").slice(0, -1).includes(dir)))
    .map((dir) => `**/${dir}/**`);
  const sourceGlobs = includeDirs
    .filter((dir) => annotated.some((path) => path.startsWith(`${dir}/`)))
    .map((dir) => `${dir}/**/*.lua`);
  const entry: LualsEntry = {
    sourceGlobs,
    moduleId,
    namespace,
    ...(ignore.length > 0 ? { ignore } : {}),
  };
  const selected = selectLualsSources(lua, { sourceGlobs, ignore });
  return {
    recipe: { luals: [entry] },
    copies: new Map(selected.map((path) => [`source/${namespace}/${path}`, path])),
    notes:
      annotated.length > 1
        ? [
            `recipe.json types the module ${moduleId}; add an entry for each other module the library exposes.`,
          ]
        : [],
  };
}

function scriptApiRecipe(paths: readonly string[], includeDirs: readonly string[]): Recipe {
  const entries = new Map<string, ScriptApiEntry>();
  const copies = new Map<string, string>();
  const notes: string[] = [];
  for (const path of includedScriptApiPaths(paths, includeDirs)) {
    const dir = includeDirs.find((includeDir) => path.startsWith(`${includeDir}/`)) as string;
    const namespace = posix.basename(path, ".script_api");
    const moduleId = `${dir.replaceAll("/", ".")}.${namespace}`;
    // A native extension's `.script_api` documents a global no game can `require`,
    // and `resolve` already types it from the dependency's own archive.
    if (!paths.includes(`${dir}/${namespace}.lua`)) {
      notes.push(
        `${path} names no Lua module at ${dir}/${namespace}.lua, so recipe.json has no entry for it: resolve types it from the archive, see ${EXTENSIONS_GUIDE}.`,
      );
      continue;
    }
    if (entries.has(moduleId)) {
      notes.push(`${path} is left out: another .script_api file is already module ${moduleId}.`);
      continue;
    }
    entries.set(moduleId, {
      scriptApi: path,
      moduleId,
      namespace,
      apiDoc: `api-doc/${namespace}.json`,
    });
    copies.set(`source/${moduleId}.script_api`, path);
  }
  return { recipe: { scriptApi: [...entries.values()] }, copies, notes };
}

/**
 * Write the folder of the library `url` archives into the data folder `dataDir`,
 * and return its name with what is left to do by hand. Throws, leaving `dataDir` as
 * it was, on a URL that names no repository archive, an existing folder, a branch
 * whose archive names no commit, an archive that declares no `include_dirs`, an
 * entry that leaves its folder, and a result the reader refuses.
 */
export async function addLibrary(
  url: string,
  dataDir: string,
  opts: AddLibraryOptions,
): Promise<AddedLibrary> {
  const { repo, tag } = readArchiveUrl(url);
  const folder = libraryFolderName(repo);
  const root = join(dataDir, folder);
  if (existsSync(root)) {
    throw new Error(`library folder ${folder} already exists in ${dataDir}`);
  }

  const archive = await resolveExtensionArchive(
    { index: 0, url },
    {
      cacheDir: opts.cacheDir ?? extensionCacheDir(),
      ...(opts.download === undefined ? {} : { download: opts.download }),
    },
  );
  const ref =
    tag ??
    (archive.resolvedVersion.startsWith(COMMIT_PIN)
      ? archive.resolvedVersion.slice(COMMIT_PIN.length)
      : undefined);
  if (ref === undefined) {
    throw new Error(`${url} is a branch and its archive names no commit: use a tag URL`);
  }

  const zip = await defaultReadZip(archive.archivePath);
  const entries = zip.entries();
  const gameProjectEntry = archiveGameProjectEntry(entries);
  const gameProject = gameProjectEntry === undefined ? undefined : zip.read(gameProjectEntry);
  const includeDirs = gameProject === undefined ? [] : readLibraryIncludeDirs(gameProject);
  const shared = libraryIncludeDirFiles(entries, gameProject);
  for (const { entry, path } of shared) {
    if (!isContainedResourcePath(path)) {
      throw new Error(`${url} holds ${entry}, which leaves the library's folder`);
    }
  }
  const entryAt = new Map(shared.map(({ entry, path }) => [path, entry]));
  const paths = [...entryAt.keys()].sort();
  const annotated = paths.filter(
    (path) =>
      path.endsWith(".lua") &&
      isApiPath(path) &&
      LUALS_ANNOTATION.test(zip.read(entryAt.get(path) as string)),
  );
  const kind = portalEntryKind({
    readable: true,
    includeDirs,
    ...includedEvidence(paths, includeDirs),
    luaAnnotated: annotated.length,
  });
  if (kind === "not-a-dependency") {
    throw new Error(`${url} declares no [library] include_dirs, so no game can depend on it`);
  }

  const generated =
    kind === "script-api"
      ? scriptApiRecipe(paths, includeDirs)
      : kind === "pure-lua-annotated"
        ? lualsRecipe(paths, annotated, includeDirs)
        : undefined;
  const notes = [...(archive.warning === undefined ? [] : [archive.warning])];
  if (generated !== undefined) {
    notes.push(...generated.notes);
  } else if (kind === "native-untyped") {
    notes.push(
      `${folder} is a native extension with no .script_api, so it has no recipe: write its declaration by hand, see ${FORK_GUIDE}.`,
    );
  } else {
    notes.push(
      `${folder} holds no annotated Lua and no .script_api, so it has no recipe: fork it by hand, see ${FORK_GUIDE}.`,
    );
  }

  const license = archiveLicense(zip);
  try {
    writeLibraryJson(dataDir, { repo, ...(license === undefined ? {} : { license }) });
    writeReviewedJson(dataDir, folder, { ref });
    if (generated !== undefined && generated.copies.size > 0) {
      writeRecipeJson(dataDir, folder, generated.recipe);
      for (const [dest, path] of generated.copies) {
        const file = join(root, dest);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, zip.bytes(entryAt.get(path) as string));
      }
    }
    readLibraryData(dataDir);
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
  return { folder, notes };
}
