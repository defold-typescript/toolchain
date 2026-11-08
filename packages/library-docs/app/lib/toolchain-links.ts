import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { canonicalApiPages } from "@defold-typescript/docs-render/toolchain-surface";

export const TOOLCHAIN_DOCS_URL = "https://defold-typescript.github.io/toolchain";

const toolchainRoute = (namespace: string): string => `${TOOLCHAIN_DOCS_URL}/api/${namespace}`;

const pagesByTypesDir = new Map<string, ApiPage[]>();

// Pages that exist only to be linked to: the toolchain docs' canonical surface, the
// one its `/api/<ns>` pages render, each routed at its absolute toolchain docs URL.
// Reading the same surface is what lands a member link on the heading the
// toolchain renders for it. They get no route, index card or search record here.
export function toolchainPages(typesDir: string): ApiPage[] {
  const cached = pagesByTypesDir.get(typesDir);
  if (cached) return cached;
  const pages = canonicalApiPages(typesDir).map((page) => ({
    ...page,
    route: toolchainRoute(page.namespace),
  }));
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
// docs. Those pages live there, at a single-segment `/api/<namespace>`; a library
// page here is `/api/<owner>/<repo>/<namespace>`, so it stays relative.
export function pointAtToolchainDocs(markdown: string): string {
  return markdown.replace(
    /\]\(\/api\/([^)#\s/]+)(?=[)#\s])/g,
    (_link: string, namespace: string) => `](${toolchainRoute(namespace)}`,
  );
}
