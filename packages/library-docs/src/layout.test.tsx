import { afterAll, expect, mock, test } from "bun:test";
import { join } from "node:path";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "@defold-typescript/docs-render/test-dom";
import { withBase } from "@defold-typescript/docs-render/base";
import { registerDom, unregisterDom } from "@defold-typescript/docs-render/test-dom";
import { flattenTree } from "fumadocs-core/page-tree";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";

function useRouter() {
  return { path: "/", push: async () => {}, reload: () => {} };
}

function Link({ to, children, ...props }: ComponentProps<"a"> & { to: string }) {
  return (
    <a href={to} {...props}>
      {children}
    </a>
  );
}

mock.module("waku", () => ({ useRouter, Link }));
mock.module("waku/router/client", () => ({ useRouter, Link }));
const { Provider } = await import("./components/provider");
const { default: Layout } = await import("./pages/_layout");
const { navCategories, pageTree } = await import("./lib/site");

registerDom();
afterAll(unregisterDom);

// The layout reads the site's model from the working directory, as the build runs it.
function inSiteRoot<T>(run: () => T): T {
  const previous = process.cwd();
  process.chdir(join(import.meta.dir, ".."));
  try {
    return run();
  } finally {
    process.chdir(previous);
  }
}

test("the static HTML of a page lists every link of the library sidebar", () => {
  const { html, urls } = inSiteRoot(() => ({
    html: renderToString(
      <Provider>
        <Layout>
          <main />
        </Layout>
      </Provider>,
    ),
    urls: flattenTree(pageTree(navCategories()).children).map((item) => withBase(item.url)),
  }));
  const host = document.createElement("div");
  host.innerHTML = html;
  const aside = host.querySelector("#nd-sidebar");
  if (aside === null) {
    throw new Error("no sidebar rendered");
  }
  const hrefs = new Set(
    [...aside.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")),
  );
  expect(urls.length).toBeGreaterThan(10);
  expect(urls.filter((url) => !hrefs.has(url))).toEqual([]);
}, 30_000);
