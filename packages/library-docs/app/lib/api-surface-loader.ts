import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type LibraryIndexSlotClassifications,
  parseDefoldApiDoc,
  parseLibraryIndexSlotClassifications,
} from "@defold-typescript/types";
import type { ApiPage, LibraryMeta } from "./api-surface";
import {
  type DefoldEngineRelease,
  loadDefoldEngineReleases,
  releaseEra,
} from "./defold-release-era";
import { repoTreeUrl } from "./forge";
import { parseFrontmatter } from "./frontmatter";
import { readSiteIndexSlots, readSiteLibraries, type SiteLibrary } from "./library-data";
import { type LibraryListing, type LibraryOrigin, libraryLineage } from "./nav";
import {
  assertHttpsUrl,
  assertPageKey,
  assertUpstreamIdentifiers,
  assertUrlPart,
  preserveUpstreamMarkup,
} from "./upstream-text";

// Where a build reads from: `dataDir` is the data folder, `modelDir` the API model
// `library check --api-doc-out` wrote, and `typesDir` the published types package,
// whose engine namespaces a library doc can extend. A dir with no `typesDir`
// extends nothing.
export interface LibraryDirs {
  dataDir: string;
  modelDir: string;
  typesDir?: string;
}

interface LibraryClassification {
  source: { repo: string; commit: string; license: string };
  dirs: { dir: string; modules: string[] }[];
}

interface DefoldExtensionEntry {
  repo: string;
  ref: string;
  refKind: "release" | "tag" | "commit";
  // When a release or tag pin was cut; a commit pin carries none.
  refDate?: string;
  license: string;
  description: string;
  docs: { path: string; namespace: string; page: string }[];
}

function eraOf(
  entry: Pick<DefoldExtensionEntry, "refDate">,
  releases: readonly DefoldEngineRelease[],
): { releaseEra?: string } {
  const era = entry.refDate ? releaseEra(entry.refDate, releases) : undefined;
  return era === undefined ? {} : { releaseEra: era };
}

// Defold's own libraries, surveyed from the `defold` GitHub org by
// `cli/src/library/sync-defold-extensions.ts`. Each `.script_api` doc is a
// Libraries page keyed by its manifest `page`, never its declared namespace:
// four repos declare `firebase`, and `extension-camera` declares the engine
// `camera`. An absent manifest degrades to no Defold pages.
function loadDefoldExtensions(dirs: LibraryDirs): DefoldExtensionEntry[] {
  const path = join(dirs.dataDir, "defold-extensions.json");
  if (!existsSync(path)) return [];
  const { libraries } = JSON.parse(readFileSync(path, "utf8")) as {
    libraries: DefoldExtensionEntry[];
  };
  for (const entry of libraries) assertManifestEntry(entry, "defold-extensions.json");
  return libraries;
}

// A manifest's URLs and pin reach markdown link destinations, and its page keys
// name files and routes, so a bad one fails the build rather than a page.
function assertManifestEntry(entry: DefoldExtensionEntry, manifest: string): void {
  assertHttpsUrl(entry.repo, manifest);
  assertUrlPart(entry.ref, `${manifest}: ${entry.repo} ref`);
  for (const doc of entry.docs) {
    assertPageKey(doc.page, `${manifest}: ${entry.repo} page`);
    assertPageKey(doc.namespace, `${manifest}: ${entry.repo} namespace`);
    assertUrlPart(doc.path, `${manifest}: ${entry.repo} doc path`);
  }
}

function defoldExtensionDocs(
  dirs: LibraryDirs,
): Map<string, { entry: DefoldExtensionEntry; doc: DefoldExtensionEntry["docs"][number] }> {
  const docs = new Map<
    string,
    { entry: DefoldExtensionEntry; doc: DefoldExtensionEntry["docs"][number] }
  >();
  for (const entry of loadDefoldExtensions(dirs)) {
    for (const doc of entry.docs) {
      const previous = docs.get(doc.page);
      if (previous) {
        throw new Error(
          `defold-extensions.json: page "${doc.page}" is claimed by both ${previous.entry.repo} and ${entry.repo}`,
        );
      }
      docs.set(doc.page, { entry, doc });
    }
  }
  return docs;
}

interface PortalScriptApiLibrary extends DefoldExtensionEntry {
  id: string;
}

// The Asset Portal's `script-api` libraries, synced by
// `scripts/sync-asset-portal-script-api.ts`. Each `.script_api` doc is a Libraries
// page keyed by its manifest `page`, exactly as a Defold extension doc is, but
// owned by its GitHub owner rather than marked official. An absent manifest
// degrades to no portal pages.
function portalScriptApiDocs(
  dirs: LibraryDirs,
): Map<string, { entry: PortalScriptApiLibrary; doc: PortalScriptApiLibrary["docs"][number] }> {
  const docs = new Map<
    string,
    { entry: PortalScriptApiLibrary; doc: PortalScriptApiLibrary["docs"][number] }
  >();
  const path = join(dirs.dataDir, "asset-portal-script-api.json");
  if (!existsSync(path)) return docs;
  const { libraries } = JSON.parse(readFileSync(path, "utf8")) as {
    libraries: PortalScriptApiLibrary[];
  };
  for (const entry of libraries) {
    assertManifestEntry(entry, "asset-portal-script-api.json");
    for (const doc of entry.docs) {
      const previous = docs.get(doc.page);
      if (previous) {
        throw new Error(
          `asset-portal-script-api.json: page "${doc.page}" is claimed by both ${previous.entry.repo} and ${entry.repo}`,
        );
      }
      docs.set(doc.page, { entry, doc });
    }
  }
  return docs;
}

function portalEntryUrl(id: string): string {
  assertPageKey(id, "Asset Portal entry");
  return `https://defold.com/assets/${id}/`;
}

function siteLibraries(dirs: LibraryDirs): SiteLibrary[] {
  const libraries = readSiteLibraries(dirs.dataDir);
  for (const library of libraries) {
    assertHttpsUrl(library.repo, "library data");
    assertUrlPart(library.ref, `library data: ${library.repo} ref`);
  }
  return libraries;
}

// The index slots every library page's notes read: each library folder's own,
// and those of the extension pages no library folder holds.
export function loadLibraryIndexSlots(dirs: LibraryDirs): LibraryIndexSlotClassifications {
  return parseLibraryIndexSlotClassifications(readSiteIndexSlots(dirs.dataDir));
}

interface NativeTarget {
  repo: string;
  ref: string;
  /** Absent means `release`. */
  refKind?: "release" | "tag" | "commit";
  license: string;
  namespace: string;
}

// Curated native extensions from library data: C++ extensions that ship no
// `.script_api`, typed by a hand-authored `@globalTable` module a project imports
// and rendered from the `api-doc/native/<namespace>.json` lowered from it. No
// library data degrades to no native pages.
function loadNativeTargets(dirs: LibraryDirs): Map<string, NativeTarget> {
  return new Map(
    siteLibraries(dirs).flatMap(({ repo, ref, refKind, license, native }) =>
      native === undefined
        ? []
        : [
            [
              native.namespace,
              {
                repo,
                ref,
                ...(refKind === undefined ? {} : { refKind }),
                license,
                namespace: native.namespace,
              },
            ] as const,
          ],
    ),
  );
}

function engineNamespaces(dirs: LibraryDirs): Set<string> {
  if (dirs.typesDir === undefined) return new Set();
  const path = join(dirs.typesDir, "api-targets.json");
  if (!existsSync(path)) return new Set();
  const { targets } = JSON.parse(readFileSync(path, "utf8")) as {
    targets: { modules: { namespace: string }[] }[];
  };
  return new Set(targets.flatMap((target) => target.modules.map((mod) => mod.namespace)));
}

// The `/api/<slug>` route for a dotted library module. honox SSG emits a clean
// static file for a literal dot (`…/monarch.monarch/index.html`), so the slug
// keeps the dotted module name verbatim — namespace, card label, and route stay
// identical, and the `[namespace]` route needs no bespoke slug mapping.
export function libraryRouteSlug(namespace: string): string {
  return namespace;
}

// The vendored `import * as <alias> from "<module>"` string, mirroring the
// upstream ts-defold/library `@example` convention: the alias is the module
// name past its first dotted segment, remaining dots collapsed to underscores
// (`monarch.transitions.easings` -> `transitions_easings`). Double quotes match
// the module declarations in `@defold-typescript/library-types`.
//
// The alias derives from the page `namespace`, but the `from "…"` module path
// takes `moduleId` — the two differ for an authored library whose page
// namespace (`defcon`) is not its require module (`defcon.console`). Every other
// caller passes only `namespace`, so the default keeps the module path identical.
function libraryImportString(namespace: string, moduleId: string = namespace): string {
  const segments = namespace.split(".");
  const alias = segments.length > 1 ? segments.slice(1).join("_") : segments[0];
  return `import * as ${alias} from "${moduleId}"`;
}

// The GitHub owner handle is the first path segment of an author URL
// (`https://github.com/paweljarosz/squid` -> `paweljarosz`); an empty or
// hostless URL yields `""`. Handles are consistent across the NOTICE credits,
// unlike the free-text author column casing, so the display alias keys off this.
export function githubOwner(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+\//, "");
  return path.split("/")[0] ?? "";
}

// The repo name is the second path segment of an origin URL
// (`https://github.com/britzl/defold-input` -> `defold-input`); a hostless or
// owner-only URL yields `""`.
export function githubRepo(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+\//, "");
  return path.split("/")[1] ?? "";
}

// Presentation-only owner-first label for a library module:
// `<owner> / <repo>[ · <leaf>]`. The spaced slash signals "label, not a require
// path". The `· <leaf>` tail is kept only for a genuinely multi-module repo whose
// module leaf differs from the repo name (`defold-input` -> `· button`); a
// single-module repo, or a module whose last segment equals its repo
// (`monarch.monarch`), drops the leaf. A missing owner falls back to the bare repo.
export function libraryDisplayName(
  namespace: string,
  repo: string,
  ownerHandle: string,
  moduleCountInRepo: number,
): string {
  const leaf = namespace.split(".").at(-1) ?? namespace;
  const repoPart = moduleCountInRepo > 1 && leaf !== repo ? `${repo} · ${leaf}` : repo;
  return ownerHandle ? `${ownerHandle} / ${repoPart}` : repoPart;
}

// Parse the `NOTICE` attribution table (`- <dir> — <author>, <url>` lines) into
// a per-upstream-dir map so each library page can credit its original author.
function parseNoticeAttribution(notice: string): Map<string, { author: string; url: string }> {
  const attribution = new Map<string, { author: string; url: string }>();
  const line = /^\s*-\s+(\S+)\s+—\s+(.+?),\s+(https?:\/\/\S+)\s*$/;
  for (const raw of notice.split("\n")) {
    const match = line.exec(raw);
    if (match?.[1] && match[2] && match[3]) {
      attribution.set(match[1], { author: match[2], url: match[3] });
    }
  }
  return attribution;
}

// Module -> upstream `dir` join from `library-classification.json`
// (`dirs[].modules[]`): the reverse index every library-surface consumer needs
// to attribute a dotted module (`monarch.monarch`, `in.button`) to its library.
export function libraryModuleDirs(dirs: LibraryDirs): Map<string, string> {
  const classification = JSON.parse(
    readFileSync(join(dirs.dataDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const moduleDir = new Map<string, string>();
  for (const entry of classification.dirs) {
    for (const mod of entry.modules) moduleDir.set(mod, entry.dir);
  }
  return moduleDir;
}

// Namespace -> GitHub origin, joined from the library data every maintained
// library carries: its LuaLS recipe (druid, decore), its script_api recipe
// (bridge), and its forks (defcon, the severed forks). Lineage is the origin URL and nothing else — the NOTICE credit
// column is free-text attribution whose casing and org renames drift from the
// handle a repo actually lives under, so it never feeds the Libraries tree.
export function libraryOriginByNamespace(dirs: LibraryDirs): Map<string, LibraryOrigin> {
  const origins = new Map<string, LibraryOrigin>();
  const maintainedHere = [
    ...loadLualsProvenance(dirs),
    ...loadScriptApiProvenance(dirs),
    ...loadAuthoredProvenance(dirs),
  ];
  for (const [namespace, provenance] of maintainedHere) {
    const owner = githubOwner(provenance.repo);
    const repo = githubRepo(provenance.repo);
    if (owner && repo) origins.set(namespace, { owner, repo });
  }
  for (const [page, { entry }] of defoldExtensionDocs(dirs)) {
    const owner = githubOwner(entry.repo);
    const repo = githubRepo(entry.repo);
    if (owner && repo) origins.set(page, { owner, repo, official: true });
  }
  for (const [namespace, target] of loadNativeTargets(dirs)) {
    const owner = githubOwner(target.repo);
    const repo = githubRepo(target.repo);
    if (owner && repo) origins.set(namespace, { owner, repo });
  }
  for (const [page, { entry }] of portalScriptApiDocs(dirs)) {
    const owner = githubOwner(entry.repo);
    const repo = githubRepo(entry.repo);
    if (owner && repo) origins.set(page, { owner, repo });
  }
  return origins;
}

const LISTING_SECTIONS = ["What it ships", "Using it", "Engine APIs"] as const;

// A summary body is exactly its `## ` sections. `Using it` is an ordered list of
// the steps after fetching the dependency — the page renders that first step
// itself — so each item, continuation lines joined, becomes one step.
function parseListingSummary(
  body: string,
  file: string,
): { ships: string; steps: string[]; engineApis?: string } {
  const where = `defold-extensions/summaries/${file}`;
  const sections = new Map<string, string>();
  const [preamble = "", ...chunks] = body.split(/^## /m);
  if (preamble.trim() !== "") {
    throw new Error(`${where}: content before the first section heading`);
  }
  for (const chunk of chunks) {
    const newline = chunk.indexOf("\n");
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
    if (!(LISTING_SECTIONS as readonly string[]).includes(heading)) {
      throw new Error(
        `${where}: unknown section "${heading}"; expected ${LISTING_SECTIONS.join(", ")}`,
      );
    }
    if (sections.has(heading)) throw new Error(`${where}: duplicate section "${heading}"`);
    sections.set(heading, newline === -1 ? "" : chunk.slice(newline + 1).trim());
  }
  const ships = sections.get("What it ships") ?? "";
  if (ships === "") throw new Error(`${where}: section "What it ships" is missing or empty`);
  const using = sections.get("Using it") ?? "";
  if (using === "") throw new Error(`${where}: section "Using it" is missing or empty`);
  const steps: string[] = [];
  for (const line of using.split("\n")) {
    const item = /^\d+\. (.+)$/.exec(line);
    const continuation = /^ {3}(\S.*)$/.exec(line);
    if (line.trim() === "") continue;
    if (item?.[1]) steps.push(item[1].trim());
    else if (continuation?.[1] && steps.length > 0) {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${continuation[1].trim()}`;
    } else {
      throw new Error(
        `${where}: section "Using it" must be only numbered steps with 3-space continuation lines, got ${JSON.stringify(line)}`,
      );
    }
  }
  const engineApis = sections.get("Engine APIs");
  if (engineApis === "") throw new Error(`${where}: section "Engine APIs" is empty`);
  return engineApis === undefined ? { ships, steps } : { ships, steps, engineApis };
}

// Defold's libraries that ship no `.script_api` (`docs: []`). Each gets a
// `/libraries/<owner>/<repo>` page from an authored summary in
// `defold-extensions/summaries/<repo>.md`, whose frontmatter records whether the
// library registers anything a script calls (`api`) and how a reader adopts it
// (`adoption`, `standard` when absent). A listing without a summary, or a
// summary naming no untyped entry, throws: either would ship a page that says
// nothing, or a description that silently reaches no page. An `unavailable`
// summary that claims an `untyped` api throws too, since a repository with
// nothing to adopt cannot register functions.
export function defoldListingsFromManifest(dirs: LibraryDirs): LibraryListing[] {
  const summariesDir = join(dirs.dataDir, "defold-extensions", "summaries");
  const untyped = loadDefoldExtensions(dirs).filter((entry) => entry.docs.length === 0);
  const engineReleases = loadDefoldEngineReleases(dirs.dataDir);
  const untypedRepos = new Set(untyped.map((entry) => githubRepo(entry.repo)));
  if (existsSync(summariesDir)) {
    for (const file of readdirSync(summariesDir)) {
      if (!file.endsWith(".md")) continue;
      const repo = file.slice(0, -".md".length);
      if (!untypedRepos.has(repo)) {
        throw new Error(
          `defold-extensions/summaries/${file}: no defold-extensions.json entry without docs is named ${repo}`,
        );
      }
    }
  }
  return untyped
    .map((entry): LibraryListing => {
      const owner = githubOwner(entry.repo);
      const repo = githubRepo(entry.repo);
      const path = join(summariesDir, `${repo}.md`);
      if (!existsSync(path)) {
        throw new Error(
          `defold-extensions.json: ${entry.repo} ships no .script_api and has no summary at defold-extensions/summaries/${repo}.md`,
        );
      }
      const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
      if (data.api !== "none" && data.api !== "untyped") {
        throw new Error(
          `defold-extensions/summaries/${repo}.md: frontmatter api must be "none" or "untyped", got ${JSON.stringify(data.api)}`,
        );
      }
      const adoption = data.adoption ?? "standard";
      if (adoption !== "standard" && adoption !== "fork" && adoption !== "unavailable") {
        throw new Error(
          `defold-extensions/summaries/${repo}.md: frontmatter adoption must be "standard", "fork" or "unavailable", got ${JSON.stringify(data.adoption)}`,
        );
      }
      if (adoption === "unavailable" && data.api !== "none") {
        throw new Error(
          `defold-extensions/summaries/${repo}.md: frontmatter adoption "unavailable" requires api "none", got ${JSON.stringify(data.api)}`,
        );
      }
      const { ships, steps, engineApis } = parseListingSummary(body, `${repo}.md`);
      return {
        owner,
        repo,
        url: entry.repo,
        ref: entry.ref,
        pinKind: entry.refKind,
        ...eraOf(entry, engineReleases),
        description: entry.description,
        official: true as const,
        route: `/libraries/${owner}/${repo}`,
        api: data.api,
        adoption,
        ships,
        steps,
        ...(engineApis === undefined ? {} : { engineApis }),
      };
    })
    .filter((listing) => listing.owner !== "" && listing.repo !== "");
}

interface AssetPortalEntry {
  id: string;
  description: string;
  repo?: string;
  ref?: string;
  refKind?: "release" | "tag" | "commit";
  refDate?: string;
  kind: string;
}

// Community libraries from the Defold Asset Portal, synced by
// `cli/src/library/sync-asset-portal.ts`. Only a `no-lua-api` entry gets a
// listing: its `include_dirs` hold shaders, materials, sounds or editor scripts,
// so there is nothing to type and the portal description is the whole page lead.
// A repo that already has a Defold listing or a typed library page keeps that one,
// matched case-folded since GitHub owner and repo names are case-insensitive. A
// listed entry with a blank description throws rather than ship an empty page. An
// absent manifest degrades to no portal listings.
export function portalListingsFromManifest(dirs: LibraryDirs): LibraryListing[] {
  const path = join(dirs.dataDir, "asset-portal.json");
  if (!existsSync(path)) return [];
  const { entries } = JSON.parse(readFileSync(path, "utf8")) as { entries: AssetPortalEntry[] };
  const engineReleases = loadDefoldEngineReleases(dirs.dataDir);
  const repoKey = (owner: string, repo: string): string => `${owner}/${repo}`.toLowerCase();
  const listed = new Set([
    ...[...libraryOriginByNamespace(dirs).values()].map(({ owner, repo }) => repoKey(owner, repo)),
    ...loadDefoldExtensions(dirs).map((entry) =>
      repoKey(githubOwner(entry.repo), githubRepo(entry.repo)),
    ),
  ]);
  return entries.flatMap((entry): LibraryListing[] => {
    if (entry.kind !== "no-lua-api" || !entry.repo || !entry.ref || !entry.refKind) return [];
    assertHttpsUrl(entry.repo, `asset-portal.json: entry "${entry.id}"`);
    assertUrlPart(entry.ref, `asset-portal.json: entry "${entry.id}" ref`);
    const owner = githubOwner(entry.repo);
    const repo = githubRepo(entry.repo);
    if (owner === "" || repo === "" || listed.has(repoKey(owner, repo))) return [];
    const description = entry.description.trim();
    if (description === "") {
      throw new Error(`asset-portal.json: entry "${entry.id}" has no description to lead its page`);
    }
    return [
      {
        owner,
        repo,
        url: entry.repo,
        ref: entry.ref,
        pinKind: entry.refKind,
        ...eraOf(entry, engineReleases),
        description,
        route: `/libraries/${owner}/${repo}`,
        api: "none",
        adoption: "standard",
        ships: description,
        steps: [],
        portal: { id: entry.id, url: portalEntryUrl(entry.id) },
      },
    ];
  });
}

// A LuaLS-sourced library's own pin, read from its library data. Unlike the
// ts-defold libraries — vendored en masse from one `ts-defold/library` commit —
// each druid-style library lives in its own repo at its own tag, so it carries
// its own `repo`/`ref` and cannot be attributed from the shared classification.
interface LualsProvenance {
  repo: string;
  ref: string;
  license: string;
  // Authored libraries only: the require module id when it differs from the page
  // namespace (`defcon` page -> `defcon.console` module). LuaLS/script_api
  // entries leave it undefined, so the import module path falls back to the
  // namespace, keeping their `from "…"` output unchanged.
  moduleId?: string;
  // Authored libraries only: set when upstream publishes no releases, so the adopt
  // step names the pinned tag or commit archive instead of a releases page.
  refKind?: "release" | "tag" | "commit";
}

function loadLualsProvenance(dirs: LibraryDirs): Map<string, LualsProvenance> {
  return new Map(
    siteLibraries(dirs).flatMap(({ repo, ref, license, luals }) =>
      luals.map(({ namespace }) => [namespace, { repo, ref, license }] as const),
    ),
  );
}

// A script_api-sourced library's own pin, read from its library data.
// Same shape and role as `loadLualsProvenance`: a library this repo maintains
// from a primary source (here the upstream's own `.script_api`) that is absent
// from the ts-defold classification, so it carries its own repo/ref rather than
// the shared vendored commit. Keyed by the entry's `namespace`, which is also
// the `api-doc/<namespace>.json` stem and thus the page key.
function loadScriptApiProvenance(dirs: LibraryDirs): Map<string, LualsProvenance> {
  return new Map(
    siteLibraries(dirs).flatMap(({ repo, ref, license, scriptApi }) =>
      scriptApi.map(({ namespace }) => [namespace, { repo, ref, license }] as const),
    ),
  );
}

// An authored/forked library's own pin, read from its library data. Same
// shape and role as the LuaLS/script_api loaders: a library this repo maintains
// as a first-party hand-authored or forked `.d.ts` (its upstream has no usable
// structured source), absent from the ts-defold classification, so it carries
// its own repo/ref rather than the shared vendored commit. Keyed by the entry's
// `namespace`, bare or dotted, which is also the `api-doc/<namespace>.json`
// stem and thus the page key either way.
function loadAuthoredProvenance(dirs: LibraryDirs): Map<string, LualsProvenance> {
  return new Map(
    siteLibraries(dirs).flatMap(({ repo, ref, license, refKind, forks }) =>
      forks.map(
        ({ namespace, moduleId }) =>
          [
            namespace,
            {
              repo,
              ref,
              license,
              moduleId,
              ...(refKind === undefined ? {} : { refKind }),
            },
          ] as const,
      ),
    ),
  );
}

// Per-library provenance, joined from `library-classification.json` (repo,
// pinned commit, license, and the dir each module belongs to) plus `NOTICE`
// (the upstream author/url). Returns a per-module `LibraryMeta` builder the
// render layer turns into the uniform Author / GitHub / Commit pin / Import /
// License block; the module description is left clean.
//
// A module absent from the ts-defold classification but present in a library's
// LuaLS recipe is a LuaLS-sourced library (druid): it is attributed to
// its own repo at its own ref, not pinned to the shared ts-defold/library
// commit the classification would otherwise default it to.
export function loadLibraryProvenance(dirs: LibraryDirs): (namespace: string) => LibraryMeta {
  const classification = JSON.parse(
    readFileSync(join(dirs.dataDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const noticePath = join(dirs.dataDir, "..", "..", "NOTICE");
  const attribution = existsSync(noticePath)
    ? parseNoticeAttribution(readFileSync(noticePath, "utf8"))
    : new Map<string, { author: string; url: string }>();

  const moduleDir = libraryModuleDirs(dirs);
  // A namespace this repo maintains from primary source — LuaLS, script_api, *or*
  // a first-party authored/forked `.d.ts` — is authored-here and carries its own
  // upstream pin. Every loader yields the same `{repo, ref, license}` shape keyed
  // by namespace.
  const maintainedHere = new Map([
    ...loadLualsProvenance(dirs),
    ...loadScriptApiProvenance(dirs),
    ...loadAuthoredProvenance(dirs),
  ]);

  const defoldDocs = defoldExtensionDocs(dirs);
  const portalDocs = portalScriptApiDocs(dirs);
  const engine = engineNamespaces(dirs);
  const nativeTargets = loadNativeTargets(dirs);
  const engineReleases = loadDefoldEngineReleases(dirs.dataDir);

  // A `.script_api` page, Defold's or the portal's, is pinned to the release,
  // tag or commit its manifest recorded, and imported as the module `resolve`
  // writes for it. A doc adding members to an engine namespace stays that
  // ambient global, as `resolve` keeps it. A dated pin names the Defold version
  // current when it was cut; both manifests record a release or tag pin's date.
  const scriptApiMeta = (
    entry: DefoldExtensionEntry,
    doc: DefoldExtensionEntry["docs"][number],
  ): LibraryMeta => {
    const extendsEngine = engine.has(doc.namespace);
    return {
      author: "",
      authorUrl: entry.repo,
      commit: entry.ref,
      sourceUrl: `${entry.repo}/blob/${entry.ref}/${doc.path}`,
      importString: extendsEngine ? "" : libraryImportString(doc.namespace),
      license: entry.license,
      authoredHere: true,
      pinKind: entry.refKind,
      ...eraOf(entry, engineReleases),
      ...(extendsEngine
        ? { usage: "ambient", globalNamespace: doc.namespace, extendsNamespace: doc.namespace }
        : { usage: "import" }),
    };
  };

  const { repo, commit, license } = classification.source;
  return (namespace: string): LibraryMeta => {
    const native = nativeTargets.get(namespace);
    if (native) {
      return {
        author: "",
        authorUrl: native.repo,
        commit: native.ref,
        sourceUrl: repoTreeUrl(native.repo, native.ref),
        importString: libraryImportString(native.namespace),
        license: native.license,
        authoredHere: true,
        usage: "import",
        ...(native.refKind ? { pinKind: native.refKind } : {}),
      };
    }
    const defold = defoldDocs.get(namespace);
    if (defold) return scriptApiMeta(defold.entry, defold.doc);
    const portal = portalDocs.get(namespace);
    if (portal) {
      const { id } = portal.entry;
      return {
        ...scriptApiMeta(portal.entry, portal.doc),
        portal: { id, url: portalEntryUrl(id) },
      };
    }
    const authoredEntry = moduleDir.has(namespace) ? undefined : maintainedHere.get(namespace);
    if (authoredEntry) {
      return {
        author: "",
        authorUrl: authoredEntry.repo,
        commit: authoredEntry.ref,
        sourceUrl: repoTreeUrl(authoredEntry.repo, authoredEntry.ref),
        importString: libraryImportString(namespace, authoredEntry.moduleId ?? namespace),
        license: authoredEntry.license,
        authoredHere: true,
        usage: "import",
        ...(authoredEntry.refKind ? { pinKind: authoredEntry.refKind } : {}),
      };
    }
    const dir = moduleDir.get(namespace);
    const credit = dir ? attribution.get(dir) : undefined;
    const sourceUrl = `${repo}/tree/${commit}`;
    return {
      author: credit?.author ?? "",
      authorUrl: credit?.url ?? "",
      commit,
      sourceUrl,
      importString: libraryImportString(namespace),
      license,
      authoredHere: false,
      usage: "import",
    };
  };
}

// Docs-only pages for the vendored third-party libraries in
// `@defold-typescript/library-types`: each `api-doc/*.json` fixture parsed by
// `parseDefoldApiDoc`, gated on a library target naming it,
// tagged `category: "library"`, routed default-only under `/api/<slug>` (no
// version prefix — library types are pinned to a ts-defold/library commit, not
// a Defold version), and carrying a structured `libraryMeta` the render layer
// turns into the uniform provenance block. Library symbols carry no authored
// translations/signatures, so those stores stay empty.
//
// A library page whose api-doc fixture has an empty `info.description` falls
// back to the per-upstream-dir text in `library-descriptions.json` (keyed by
// library dir, populated from the upstream GitHub `description` field at sync
// time + a curated overrides map). A richer per-module description, where the
// api-doc fixture already supplies one, still wins — the fallback only fills
// the empty cases that the previous step rendered as a floating provenance
// block.
// Each library page with the raw api-doc JSON it was parsed from, for the scans
// that read what the parser drops (a function's `notes`).
export function loadLibraryPageSources(dirs: LibraryDirs): { page: ApiPage; doc: unknown }[] {
  const apiDocDir = dirs.modelDir;
  if (!existsSync(apiDocDir)) return [];
  const metaFor = loadLibraryProvenance(dirs);

  const descByDir = loadLibraryDescriptions(dirs);
  const moduleDir = libraryModuleDirs(dirs);
  const displayOverrides = loadLibraryDisplayOverrides(dirs);

  const jsonStems = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((file) => file.endsWith(".json"))
          .map((file) => file.replace(/\.json$/, ""))
      : [];
  const namespaces = jsonStems(apiDocDir);

  // Defold pages share the one `/api/<page>` route space with the vendored
  // libraries, so a key that lands on a vendored namespace would shadow a page.
  const defoldDocs = defoldExtensionDocs(dirs);
  const vendored = new Set(namespaces);
  for (const [page, { entry }] of defoldDocs) {
    if (vendored.has(page)) {
      throw new Error(
        `defold-extensions.json: page "${page}" from ${entry.repo} collides with a vendored library namespace`,
      );
    }
    namespaces.push(page);
  }
  const defoldApiDocDir = join(dirs.dataDir, "defold-extensions", "api-doc");

  // A native namespace is a Lua global, so it shares the same route space and
  // must not land on a page another lane already owns.
  const nativeApiDocDir = join(apiDocDir, "native");
  const nativeTargets = loadNativeTargets(dirs);
  const nativeNamespaces = new Set(jsonStems(nativeApiDocDir));
  for (const namespace of nativeNamespaces) {
    if (namespaces.includes(namespace)) {
      throw new Error(
        `library data: native namespace "${namespace}" from ${nativeTargets.get(namespace)?.repo} collides with another library page`,
      );
    }
    namespaces.push(namespace);
  }

  // A portal page key is unique within its manifest and, as the sync assigns it,
  // shadows no engine namespace, `/api/defold-<version>` route or other lane's
  // page; a hand edit that breaks any of these would replace a page at its route.
  const portalDocs = portalScriptApiDocs(dirs);
  const portalApiDocDir = join(dirs.dataDir, "asset-portal-script-api", "api-doc");
  const engine = engineNamespaces(dirs);
  for (const [page, { entry }] of portalDocs) {
    if (namespaces.includes(page) || engine.has(page) || page.startsWith("defold-")) {
      throw new Error(
        `asset-portal-script-api.json: page "${page}" from ${entry.repo} collides with an engine, version or library route`,
      );
    }
    namespaces.push(page);
  }

  // Modules-per-repo count drives whether the display label keeps its `· <leaf>`
  // distinguisher; a single-module repo drops it. It is the same count the
  // Libraries tree collapses a one-module repo on, resolved from the same
  // `owner/repo` origin, so label and tree depth cannot disagree.
  const origins = libraryOriginByNamespace(dirs);
  const indexSlots = loadLibraryIndexSlots(dirs);
  const repoCounts = new Map<string, number>();
  for (const namespace of namespaces) {
    const { repo } = libraryLineage(namespace, origins);
    repoCounts.set(repo, (repoCounts.get(repo) ?? 0) + 1);
  }

  const pages: { page: ApiPage; doc: unknown }[] = [];
  for (const namespace of namespaces) {
    const defold = defoldDocs.get(namespace);
    const portal = portalDocs.get(namespace);
    const docDir = defold
      ? defoldApiDocDir
      : portal
        ? portalApiDocDir
        : nativeNamespaces.has(namespace)
          ? nativeApiDocDir
          : apiDocDir;
    const doc: unknown = JSON.parse(readFileSync(join(docDir, `${namespace}.json`), "utf8"));
    const module = parseDefoldApiDoc(doc);
    const dir = moduleDir.get(namespace);
    const scriptApiEntry = defold?.entry ?? portal?.entry;
    if (!module.description && scriptApiEntry?.description) {
      module.description = scriptApiEntry.description;
    } else if (!module.description) {
      // ts-defold libraries key the description on their upstream dir; a LuaLS
      // library has no classification dir, so it keys on its namespace directly
      // (druid documents its own `---@class` and never reaches this fallback).
      const fallback = (dir ? descByDir?.get(dir) : undefined) ?? descByDir?.get(namespace);
      if (fallback) module.description = fallback;
    }
    assertUpstreamIdentifiers(module);
    preserveUpstreamMarkup(module);
    const meta = metaFor(namespace);
    const { owner, repo } = libraryLineage(namespace, origins);
    const displayName =
      displayOverrides.get(namespace) ??
      libraryDisplayName(namespace, repo, owner, repoCounts.get(repo) ?? 1);
    pages.push({
      page: {
        namespace,
        route: `/api/${libraryRouteSlug(namespace)}`,
        brief: module.brief,
        module,
        translations: {},
        signatures: {},
        category: "library",
        libraryMeta: meta,
        displayName,
        indexSlots,
      },
      doc,
    });
  }
  return pages;
}

// Curated display-name overrides from `library-display-overrides.json` (dotted
// namespace -> label). The escape hatch for a namespace whose derived
// author-first label reads awkwardly; an absent file degrades to an empty map,
// so every module falls back to `libraryDisplayName`. Mirrors the
// `loadLibraryDescriptions` override-loader pattern.
function loadLibraryDisplayOverrides(dirs: LibraryDirs): Map<string, string> {
  const path = join(dirs.dataDir, "library-display-overrides.json");
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return new Map(Object.entries(raw));
}

// Per-upstream-dir description text from `library-descriptions.json`, keyed by
// the library dir (not the dotted module). A missing or unreadable file
// degrades to undefined — every page falls back to its own (possibly empty)
// api-doc description, which matches the pre-step behavior.
function loadLibraryDescriptions(dirs: LibraryDirs): Map<string, string> | undefined {
  const path = join(dirs.dataDir, "library-descriptions.json");
  if (!existsSync(path)) return undefined;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  return new Map(Object.entries(raw));
}
