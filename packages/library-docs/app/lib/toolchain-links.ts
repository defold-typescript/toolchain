import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDefoldApiDoc,
  routeTypeDeclarations,
  type SkipOverloadRule,
  withholdOverloads,
} from "@defold-typescript/types";
import type { ApiPage } from "./api-surface";
import { parseGlobalTypes } from "./global-types";

export const TOOLCHAIN_DOCS_URL = "https://defold-typescript.github.io/toolchain";

interface ApiTarget {
  default?: boolean;
  fixturesDir: string;
  modules: { namespace: string; fixture: string; skipOverloads?: SkipOverloadRule[] }[];
}

const toolchainRoute = (namespace: string): string => `${TOOLCHAIN_DOCS_URL}/api/${namespace}`;

function engineModules(typesDir: string, target: ApiTarget) {
  const modules = routeTypeDeclarations(
    target.modules.map((mod) =>
      withholdOverloads(
        parseDefoldApiDoc(
          JSON.parse(readFileSync(join(typesDir, target.fixturesDir, mod.fixture), "utf8")),
        ),
        mod.skipOverloads ?? [],
      ),
    ),
  );
  const globals = join(typesDir, target.fixturesDir, "globals_doc.json");
  return existsSync(globals)
    ? [...modules, parseDefoldApiDoc(JSON.parse(readFileSync(globals, "utf8")))]
    : modules;
}

const pagesByTypesDir = new Map<string, ApiPage[]>();

// Pages that exist only to be linked to: the core types and the default target's
// engine namespaces, each routed at its absolute toolchain docs URL. They get no
// route, index card or search record here.
export function toolchainPages(typesDir: string): ApiPage[] {
  const cached = pagesByTypesDir.get(typesDir);
  if (cached) return cached;
  const { targets } = JSON.parse(readFileSync(join(typesDir, "api-targets.json"), "utf8")) as {
    targets: ApiTarget[];
  };
  const target = targets.find((candidate) => candidate.default === true);
  if (!target) throw new Error("api-targets.json names no default target");
  const coreTypes = parseGlobalTypes(readFileSync(join(typesDir, "src", "core-types.ts"), "utf8"));
  const pages: ApiPage[] = [
    ...coreTypes.map((page) => ({ ...page, route: toolchainRoute(page.namespace) })),
    ...engineModules(typesDir, target).map(
      (module): ApiPage => ({
        namespace: module.namespace,
        route: toolchainRoute(module.namespace),
        brief: module.brief,
        module,
        translations: {},
        signatures: {},
        category: "engine",
      }),
    ),
  ];
  pagesByTypesDir.set(typesDir, pages);
  return pages;
}

// What the link registries read: the library pages, with the toolchain pages whose
// namespace no library page owns. Library pages stay last, so a shared key is theirs.
export function withToolchainLinks(pages: ApiPage[], typesDir: string): ApiPage[] {
  const owned = new Set(pages.map((page) => page.namespace));
  return [...toolchainPages(typesDir).filter((page) => !owned.has(page.namespace)), ...pages];
}

// An authored summary links engine pages root-relative, as it reads on the toolchain
// docs. Those pages live there, so only a link to a page this site has stays relative.
export function pointAtToolchainDocs(markdown: string, siteNamespaces: Set<string>): string {
  return markdown.replace(/\]\(\/api\/([^)#\s]+)/g, (link: string, namespace: string) =>
    siteNamespaces.has(namespace) ? link : `](${toolchainRoute(namespace)}`,
  );
}
