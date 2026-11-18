import { afterAll, expect, mock, test } from "bun:test";
import { join } from "node:path";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "@defold-typescript/docs-render/test-dom";
import { withBase } from "@defold-typescript/docs-render/base";
import { registerDom, unregisterDom } from "@defold-typescript/docs-render/test-dom";
import { flattenTree } from "fumadocs-core/page-tree";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { CANONICAL_SURFACE } from "../app/lib/api-surface-pref";
import { listGuidePages } from "../app/lib/guide-loader";

function useRouter() {
  return { path: "/build", push: async () => {}, reload: () => {} };
}

function Link({
  to,
  children,
  unstable_prefetchOnEnter: _prefetch,
  ...props
}: ComponentProps<"a"> & { to: string; unstable_prefetchOnEnter?: unknown }) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

// The site resolves its types and guide folders from the working directory the build runs in,
// once per process, so the test hands over the package's own folders.
const TYPES_DIR = join(import.meta.dir, "../../types");
const GUIDE_DIR = join(import.meta.dir, "../../docs/guide");
const apiContent = await import("../app/lib/api-content");
const content = await import("../app/lib/content");
mock.module("../app/lib/api-content", () => ({ ...apiContent, TYPES_DIR }));
mock.module("../app/lib/content", () => ({
  ...content,
  GUIDE_DIR,
  guidePages: () => listGuidePages(GUIDE_DIR),
}));

mock.module("waku", () => ({ useRouter, Link }));
mock.module("waku/router/client", () => ({ useRouter, Link }));
const { Provider } = await import("./components/provider");
const { default: Layout } = await import("./pages/_layout");
const { apiSurfaceConfig, surfaceTrees } = await import("./lib/site");

registerDom();
afterAll(unregisterDom);

test("the static HTML of a guide lists every link of the guides sidebar, closed groups hidden", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <Provider versionIds={apiSurfaceConfig().versionIds}>
      <Layout>
        <main />
      </Layout>
    </Provider>,
  );
  const aside = host.querySelector("#nd-sidebar");
  if (aside === null) {
    throw new Error("no sidebar rendered");
  }
  const guides = surfaceTrees()[CANONICAL_SURFACE]?.children.find(
    (node) => node.type === "folder" && node.name === "Guides",
  );
  if (guides?.type !== "folder") {
    throw new Error("the canonical tree has no Guides folder");
  }
  const urls = flattenTree(guides.children).map((item) => withBase(item.url));
  const links = new Map(
    [...aside.querySelectorAll("a[href]")].map((link) => [link.getAttribute("href"), link]),
  );
  expect(urls.length).toBeGreaterThan(5);
  expect(urls.filter((url) => !links.has(url))).toEqual([]);
  const hidden = urls.filter((url) => links.get(url)?.parentElement?.closest("[hidden]"));
  expect(hidden.length).toBeGreaterThan(0);
}, 30_000);
