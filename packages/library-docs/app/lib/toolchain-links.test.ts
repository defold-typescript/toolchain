import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { apiLinkify, apiPageMarkdown, apiSignatureSymbolLinks } from "./api-page-render";
import type { ApiPage } from "./api-surface";
import { withBase } from "./base";
import { renderMarkdown } from "./markdown";
import {
  pointAtToolchainDocs,
  TOOLCHAIN_DOCS_URL,
  toolchainPages,
  withToolchainLinks,
} from "./toolchain-links";

const SITE_DIR = join(import.meta.dir, "../..");
const TYPES_DIR = join(SITE_DIR, "node_modules/@defold-typescript/types");

function libraryPage(): ApiPage {
  const module = parseDefoldApiDoc({
    info: { namespace: "demo", brief: "", description: "Wraps `go.animate` and go.animate." },
    elements: [
      {
        type: "FUNCTION",
        name: "demo.move",
        brief: "Moves.",
        description: "Calls go.animate for you.",
        parameters: [{ name: "to", doc: "Target.", types: ["Vector3"] }],
        returnvalues: [{ name: "shape", doc: "", types: ["demo.Shape"] }],
      },
      {
        type: "TYPEDEF",
        name: "Shape",
        types: ["number"],
      },
    ],
  });
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: module.brief,
    module,
    translations: {},
    signatures: {},
    category: "library",
  };
}

async function renderDemo(page: ApiPage, linkPages: ApiPage[]): Promise<string> {
  return renderMarkdown(apiPageMarkdown(page, apiLinkify(linkPages)), {
    highlightSignatureHeadings: true,
    signatureSymbolLinks: apiSignatureSymbolLinks(linkPages, page),
  });
}

describe("toolchainPages", () => {
  const pages = toolchainPages(TYPES_DIR);

  test("routes every page at its absolute toolchain docs URL", () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.route).toBe(`${TOOLCHAIN_DOCS_URL}/api/${page.namespace}`);
    }
  });

  test("holds the core types and every module of the default target", () => {
    const { targets } = JSON.parse(readFileSync(join(TYPES_DIR, "api-targets.json"), "utf8")) as {
      targets: { default?: boolean; modules: { namespace: string }[] }[];
    };
    const target = targets.find((candidate) => candidate.default);
    const namespaces = new Set(pages.map((page) => page.namespace));
    expect(target?.modules.length).toBeGreaterThan(0);
    for (const { namespace } of target?.modules ?? []) expect(namespaces).toContain(namespace);
    for (const name of ["Vector3", "Hash", "Opaque"]) expect(namespaces).toContain(name);
  });
});

describe("links back to the toolchain docs", () => {
  const page = libraryPage();
  const linkPages = withToolchainLinks([page], TYPES_DIR);

  test("a library page's own namespace wins over a link-only page of that name", () => {
    const gui = { ...page, namespace: "gui", route: "/api/gui" };
    const all = withToolchainLinks([gui], TYPES_DIR);
    expect(all.filter((candidate) => candidate.namespace === "gui")).toEqual([gui]);
  });

  test("a doc mention of an engine symbol links to the toolchain page", async () => {
    const html = await renderDemo(page, linkPages);
    expect(html).toContain(`href="${TOOLCHAIN_DOCS_URL}/api/go#`);
  });

  test("a signature naming a core type links it to the toolchain page", async () => {
    const html = await renderDemo(page, linkPages);
    expect(html).toContain(`href="${TOOLCHAIN_DOCS_URL}/api/Vector3"`);
  });

  test("a page's own type links on its own page", async () => {
    const links = apiSignatureSymbolLinks(linkPages, page);
    expect(JSON.stringify(links.get("Shape"))).toContain("/api/demo#");
  });

  test("a page's own type keeps a name a core type also has", () => {
    const own = libraryPage();
    own.module.typedefs.push({ name: "Hash", types: ["string"] } as never);
    const links = apiSignatureSymbolLinks(withToolchainLinks([own], TYPES_DIR), own);
    expect(JSON.stringify(links.get("Hash"))).toContain("/api/demo");
  });

  test("withBase leaves an absolute URL alone and prefixes a path", () => {
    expect(withBase(`${TOOLCHAIN_DOCS_URL}/api/Vector3`)).toBe(`${TOOLCHAIN_DOCS_URL}/api/Vector3`);
    expect(withBase("/api/demo")).toBe("/api/demo");
  });

  test("under a non-root base a core type link takes no prefix and a site path does", () => {
    const script = `
      globalThis.__DOCS_BASE__ = "/library-data/";
      const { withBase } = await import(${JSON.stringify(join(SITE_DIR, "app/lib/base.ts"))});
      const { splitSignatureBrandLinks } = await import(${JSON.stringify(join(SITE_DIR, "app/lib/signature-brand-links.ts"))});
      console.log(JSON.stringify({
        core: withBase(${JSON.stringify(`${TOOLCHAIN_DOCS_URL}/api/Vector3`)}),
        site: withBase("/api/demo"),
        applied: typeof splitSignatureBrandLinks,
      }));`;
    const child = Bun.spawnSync(["bun", "-e", script], { cwd: SITE_DIR });
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual({
      core: `${TOOLCHAIN_DOCS_URL}/api/Vector3`,
      site: "/library-data/api/demo",
      applied: "function",
    });
  });
});

describe("pointAtToolchainDocs", () => {
  test("repoints a link to an engine page and keeps one to a page this site has", () => {
    expect(
      pointAtToolchainDocs("Reads [`sys`](/api/sys#a) and [`iap`](/api/iap).", new Set(["iap"])),
    ).toBe(`Reads [\`sys\`](${TOOLCHAIN_DOCS_URL}/api/sys#a) and [\`iap\`](/api/iap).`);
  });
});
