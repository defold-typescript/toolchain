import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDefoldApiDoc,
  type SignatureStore,
  type TranslationStore,
} from "@defold-typescript/types";
import type { ApiPage, ApiPageCategory } from "./api-surface";
import { parseGlobalTypes } from "./global-types";

interface ApiTarget {
  id: string;
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string }[];
  luaStdlib?: { namespace: string; fixture: string }[];
}

export interface ApiVersion {
  id: string;
  isDefault: boolean;
}

// The same `examples/translations.json` the `.d.ts` emit consumes; a missing
// file degrades gracefully to an empty store (every example renders its Lua
// fallback). The shipped `src/example-store.ts` stays node-free, so the file
// read lives here in the docs-site rather than in the types entry graph.
function loadTranslationStore(typesDir: string): TranslationStore {
  const path = join(typesDir, "examples", "translations.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as TranslationStore;
}

// Merge every `signatures/*.json` override file into one store; an absent dir
// degrades to an empty store (every signature renders its ref-doc form). Like
// `loadTranslationStore`, the file read lives here rather than in the node-free
// types entry graph. Keys are FQNs and never collide across the per-namespace
// files, so a flat `Object.assign` merge is sufficient.
function loadSignatureStore(typesDir: string): SignatureStore {
  const dir = join(typesDir, "signatures");
  if (!existsSync(dir)) return {};
  const stores = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")) as SignatureStore);
  return Object.assign({}, ...stores);
}

function readTargets(typesDir: string): ApiTarget[] {
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };
  return targets;
}

interface LibraryClassification {
  source: { repo: string; commit: string; license: string };
  dirs: { dir: string; modules: string[] }[];
}

// The `/api/<slug>` route for a dotted library module. honox SSG emits a clean
// static file for a literal dot (`…/monarch.monarch/index.html`), so the slug
// keeps the dotted module name verbatim — namespace, card label, and route stay
// identical, and the `[namespace]` route needs no bespoke slug mapping.
export function libraryRouteSlug(namespace: string): string {
  return namespace;
}

// The vendored `import * as <alias> from '<module>'` string, mirroring the
// upstream ts-defold/library `@example` convention: the alias is the module
// name past its first dotted segment, remaining dots collapsed to underscores
// (`monarch.transitions.easings` -> `transitions_easings`).
function libraryImportString(namespace: string): string {
  const segments = namespace.split(".");
  const alias = segments.length > 1 ? segments.slice(1).join("_") : segments[0];
  return `import * as ${alias} from '${namespace}'`;
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
export function libraryModuleDirs(libraryTypesDir: string): Map<string, string> {
  const classification = JSON.parse(
    readFileSync(join(libraryTypesDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const moduleDir = new Map<string, string>();
  for (const entry of classification.dirs) {
    for (const mod of entry.modules) moduleDir.set(mod, entry.dir);
  }
  return moduleDir;
}

// Per-library provenance, joined from `library-classification.json` (repo,
// pinned commit, license, and the dir each module belongs to) plus `NOTICE`
// (the upstream author/url). Mirrors the `lua-stdlib` prepend so a reader
// landing on `/api/monarch.monarch` sees why this surface is vendored, not
// generated. Returns a per-module note builder.
function loadLibraryProvenance(libraryTypesDir: string): (namespace: string) => string {
  const classification = JSON.parse(
    readFileSync(join(libraryTypesDir, "library-classification.json"), "utf8"),
  ) as LibraryClassification;
  const noticePath = join(libraryTypesDir, "NOTICE");
  const attribution = existsSync(noticePath)
    ? parseNoticeAttribution(readFileSync(noticePath, "utf8"))
    : new Map<string, { author: string; url: string }>();

  const moduleDir = libraryModuleDirs(libraryTypesDir);

  const { repo, commit, license } = classification.source;
  return (namespace: string): string => {
    const dir = moduleDir.get(namespace);
    const credit = dir ? attribution.get(dir) : undefined;
    const upstream =
      dir && credit
        ? `${dir} library by ${credit.author} (${credit.url})`
        : `${dir ?? namespace} library`;
    // The import string is fenced in backticks so the prose linkifier (which
    // skips code spans) leaves the dotted module name inside it alone rather
    // than turning it into an `/api/<slug>` link mid-statement.
    return (
      `Vendored from the ${upstream}, packaged by the ts-defold/library project ` +
      `(${repo}) at pinned commit ${commit} (${license}). Import: \`${libraryImportString(namespace)}\`.`
    );
  };
}

// Docs-only pages for the vendored third-party libraries in
// `@defold-typescript/library-types`: each `api-doc/*.json` fixture parsed by
// `parseDefoldApiDoc`, gated on an already-vendored `generated/*.d.ts` sibling,
// tagged `category: "library"`, routed default-only under `/api/<slug>` (no
// version prefix — library types are pinned to a ts-defold/library commit, not
// a Defold version), and led by a per-library provenance note. Library symbols
// carry no authored translations/signatures, so those stores stay empty.
function loadLibraryPages(libraryTypesDir: string): ApiPage[] {
  const apiDocDir = join(libraryTypesDir, "api-doc");
  if (!existsSync(apiDocDir)) return [];
  const noteFor = loadLibraryProvenance(libraryTypesDir);

  const pages: ApiPage[] = [];
  for (const file of readdirSync(apiDocDir)) {
    if (!file.endsWith(".json")) continue;
    const namespace = file.replace(/\.json$/, "");
    if (!existsSync(join(libraryTypesDir, "generated", `${namespace}.d.ts`))) continue;
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(join(apiDocDir, file), "utf8")));
    const note = noteFor(namespace);
    module.description = note + (module.description ? `\n\n${module.description}` : "");
    pages.push({
      namespace,
      route: `/api/${libraryRouteSlug(namespace)}`,
      brief: module.brief,
      module,
      translations: {},
      signatures: {},
      category: "library",
    });
  }
  return pages;
}

// Assemble one target's pages: engine modules, the presence-gated globals page,
// the target's `luaStdlib` pages, and (default only) the shared core-types
// global-type pages. `routePrefix` is `""` for the default target and
// `/<version>` for a non-default one, so every page's route reads
// `/api${routePrefix}/<namespace>` and all downstream link derivation follows.
function loadTargetPages(
  typesDir: string,
  target: ApiTarget,
  opts: { routePrefix: string; includeCoreTypes: boolean; libraryTypesDir: string | undefined },
): ApiPage[] {
  const translations = loadTranslationStore(typesDir);
  const signatures = loadSignatureStore(typesDir);

  const pages = target.modules.map((mod): ApiPage => {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    return {
      namespace: mod.namespace,
      route: `/api${opts.routePrefix}/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    };
  });

  // Hand-vendored, presence-gated: the prefixless global symbols (`hash`, …)
  // have no api-targets module, so they never reach regen/generated output.
  const globalsPath = join(typesDir, target.fixturesDir, "globals_doc.json");
  if (existsSync(globalsPath)) {
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(globalsPath, "utf8")));
    pages.push({
      namespace: "globals",
      route: `/api${opts.routePrefix}/globals`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "engine",
    });
  }

  // Docs-only Lua standard library pages (`base`, `bit`, …): types are owned
  // by the `lua-types` dependency the `lua-stdlib-globals` goal adopted, so
  // these fixtures never feed regen / `MODULE_MANIFEST`; docs-site reads them
  // directly to render the "Lua standard library" reference category. The
  // per-namespace page also leads with a provenance note so a reader landing
  // on `/api/base` sees *why* this surface is not generated like the rest.
  for (const mod of target.luaStdlib ?? []) {
    const raw = JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8"));
    const module = parseDefoldApiDoc(raw);
    const provenanceNote =
      "Types for this namespace are provided by the `lua-types` dependency " +
      "and are not generated by `@defold-typescript/types`.";
    module.description = provenanceNote + (module.description ? `\n\n${module.description}` : "");
    pages.push({
      namespace: mod.namespace,
      route: `/api${opts.routePrefix}/${mod.namespace}`,
      brief: module.brief,
      module,
      translations,
      signatures,
      category: "lua-stdlib",
    });
  }

  // Hand-curated core value types (`Vector3`, `Hash`, …), parsed from the
  // typings source string rather than a ref-doc fixture so they never feed
  // regen / `MODULE_MANIFEST`; presence-gated like the `globals` block. These
  // are version-independent and stay on the default surface only.
  const coreTypesPath = join(typesDir, "src", "core-types.ts");
  if (opts.includeCoreTypes && existsSync(coreTypesPath)) {
    for (const page of parseGlobalTypes(readFileSync(coreTypesPath, "utf8"))) {
      pages.push({ ...page, translations, signatures });
    }
  }

  // Vendored third-party library pages ride on the default, core-types-including
  // surface only, so they never appear under a versioned `/api/<version>` route.
  if (opts.libraryTypesDir) {
    pages.push(...loadLibraryPages(opts.libraryTypesDir));
  }

  const categoryRank: Record<ApiPageCategory, number> = {
    engine: 0,
    "global-type": 1,
    "lua-stdlib": 2,
    library: 3,
  };
  return pages.sort((a, b) => {
    if (a.category !== b.category) return categoryRank[a.category] - categoryRank[b.category];
    if (a.namespace === b.namespace) return 0;
    if (a.category === "engine") {
      if (a.namespace === "globals") return -1;
      if (b.namespace === "globals") return 1;
    }
    return a.namespace.localeCompare(b.namespace);
  });
}

export function loadApiSurfaceForVersion(
  typesDir: string,
  versionId: string,
  libraryTypesDir?: string,
): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.id === versionId);
  if (!target) {
    throw new Error(
      `loadApiSurfaceForVersion: no target with id "${versionId}" in api-targets.json`,
    );
  }
  const isDefault = target.default === true;
  return loadTargetPages(typesDir, target, {
    routePrefix: isDefault ? "" : `/${target.id}`,
    includeCoreTypes: isDefault,
    // Library pages are default-surface only; a versioned target never gets them
    // even when a library dir is supplied.
    libraryTypesDir: isDefault ? libraryTypesDir : undefined,
  });
}

export function loadApiSurface(typesDir: string, libraryTypesDir?: string): ApiPage[] {
  const target = readTargets(typesDir).find((t) => t.default === true);
  if (!target) {
    throw new Error("loadApiSurface: no target marked default: true in api-targets.json");
  }
  return loadApiSurfaceForVersion(typesDir, target.id, libraryTypesDir);
}

function orderedTargets(typesDir: string): ApiTarget[] {
  return [...readTargets(typesDir)].sort(
    (a, b) => Number(b.default === true) - Number(a.default === true),
  );
}

export function listApiVersions(typesDir: string): ApiVersion[] {
  return orderedTargets(typesDir).map((t) => ({ id: t.id, isDefault: t.default === true }));
}

// Enumeration guard for routing / version chrome: the default target is always
// kept (it is the canonical surface), but a non-default target whose declared
// module fixtures are not on disk is dropped rather than allowed to ENOENT at
// build time. A ref-doc-sourced target (resolved on demand, materialization
// deferred to a future Worker) therefore stays invisible until its fixtures are
// committed — direct `loadApiSurfaceForVersion` by id still throws for unknowns.
function targetIsMaterialized(typesDir: string, target: ApiTarget): boolean {
  return target.modules.every((mod) => existsSync(join(typesDir, target.fixturesDir, mod.fixture)));
}

export function versionsWithDiskFixtures(typesDir: string): ApiVersion[] {
  return orderedTargets(typesDir)
    .filter((t) => t.default === true || targetIsMaterialized(typesDir, t))
    .map((t) => ({ id: t.id, isDefault: t.default === true }));
}
