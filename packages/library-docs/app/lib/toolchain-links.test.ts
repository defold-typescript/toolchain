import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  apiLinkify,
  apiPageMarkdown,
  apiSignatureSymbolLinks,
} from "@defold-typescript/docs-render/api-page-render";
import type { ApiPage } from "@defold-typescript/docs-render/api-surface";
import { withBase } from "@defold-typescript/docs-render/base";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { renderCanonicalApiPage } from "@defold-typescript/docs-render/toolchain-page";
import { canonicalApiPages } from "@defold-typescript/docs-render/toolchain-surface";
import { parseDefoldApiDoc } from "@defold-typescript/types";
import { Hono } from "hono";
import { createApiNamespaceRoute } from "../routes/api/[host]/[owner]/[repo]/[namespace]";
import { apiPages, siteDirs } from "./api-content";
import {
  pointAtToolchainDocs,
  TOOLCHAIN_DOCS_URL,
  toolchainPages,
  withToolchainLinks,
} from "./toolchain-links";

const SITE_DIR = join(import.meta.dir, "../..");
const TYPES_DIR = join(SITE_DIR, "node_modules/@defold-typescript/types");
const LINKS_TIMEOUT_MS = 600_000;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  test("holds exactly the namespaces the toolchain docs serve", () => {
    const namespaces = pages.map((page) => page.namespace);
    expect(namespaces).toEqual(canonicalApiPages(TYPES_DIR).map((page) => page.namespace));
    for (const name of ["Vector3", "Hash", "Opaque"]) expect(namespaces).toContain(name);
  });
});

describe("toolchain member links on library pages", () => {
  test(
    "every toolchain member link on a library page lands on a heading",
    async () => {
      const REAL_DIRS = siteDirs(SITE_DIR);
      const app = new Hono();
      app.get("/api/:host/:owner/:repo/:namespace", ...createApiNamespaceRoute(REAL_DIRS));
      const linkPattern = new RegExp(
        `href="${escapeRegExp(TOOLCHAIN_DOCS_URL)}/api/([^"#]+)#([^"]+)"`,
        "g",
      );
      const holders = new Map<string, Set<string>>();
      for (const page of apiPages(REAL_DIRS)) {
        const res = await app.request(page.route);
        expect(res.status).toBe(200);
        for (const [, namespace, id] of (await res.text()).matchAll(linkPattern)) {
          const key = `${namespace}#${id}`;
          const pagesHolding = holders.get(key) ?? new Set<string>();
          pagesHolding.add(page.namespace);
          holders.set(key, pagesHolding);
        }
      }
      expect(holders.size).toBeGreaterThan(0);

      const toolchainHtml = new Map<string, string | undefined>();
      const missing: string[] = [];
      for (const [key, pagesHolding] of holders) {
        const [namespace = "", id = ""] = key.split("#");
        if (!toolchainHtml.has(namespace)) {
          toolchainHtml.set(namespace, await renderCanonicalApiPage(namespace, TYPES_DIR));
        }
        if (!toolchainHtml.get(namespace)?.includes(`id="${id}"`)) {
          missing.push(`${key} (on ${[...pagesHolding].sort().join(", ")})`);
        }
      }
      expect(missing).toEqual([]);
    },
    LINKS_TIMEOUT_MS,
  );
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
      const { withBase } = await import("@defold-typescript/docs-render/base");
      const { splitSignatureBrandLinks } = await import("@defold-typescript/docs-render/signature-brand-links");
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
  test("repoints a single-segment link to the toolchain docs and keeps a library page route", () => {
    expect(
      pointAtToolchainDocs(
        "Reads [`sys`](/api/sys#a), [`iap`](/api/github.com/defold/extension-iap/iap) and [`gui`](/api/gui).",
      ),
    ).toBe(
      `Reads [\`sys\`](${TOOLCHAIN_DOCS_URL}/api/sys#a), [\`iap\`](/api/github.com/defold/extension-iap/iap) and [\`gui\`](${TOOLCHAIN_DOCS_URL}/api/gui).`,
    );
  });
});
