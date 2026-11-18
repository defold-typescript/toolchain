import { afterAll, expect, mock, spyOn, test } from "bun:test";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "@defold-typescript/docs-render/test-dom";
import { withBase } from "@defold-typescript/docs-render/base";
import { exportSearchIndex } from "@defold-typescript/docs-render/search-export";
import {
  fireEvent,
  registerDom,
  render,
  unregisterDom,
  waitFor,
  within,
} from "@defold-typescript/docs-render/test-dom";
import {
  LIBRARY_PAGE,
  SHARED_INDEX_RECORDS,
} from "@defold-typescript/docs-render/test-search-index";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import type { ComponentProps } from "react";

const router = { path: "/", pushed: [] as string[] };

function useRouter() {
  return {
    path: router.path,
    push: async (url: string) => {
      router.pushed.push(url);
    },
    reload: () => {},
  };
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
const { Provider } = await import("./provider");

const INDEX_URL = withBase("/search-index.json");
const INDEX_BODY = JSON.stringify(await exportSearchIndex(SHARED_INDEX_RECORDS));

// Any URL but the index file answers 404, so a wrong fetch fails the search loudly.
async function serveIndex(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url === INDEX_URL
    ? new Response(INDEX_BODY, { headers: { "content-type": "application/json" } })
    : new Response(`no fixture for ${url}`, { status: 404 });
}

registerDom();
const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(serveIndex as typeof fetch);

afterAll(async () => {
  fetchSpy.mockRestore();
  await unregisterDom();
});

function Probe() {
  const { setOpenSearch } = useSearchContext();
  return (
    <button type="button" onClick={() => setOpenSearch(true)}>
      Open search
    </button>
  );
}

async function searchFor(query: string, expected: string) {
  const view = render(
    <Provider>
      <Probe />
    </Provider>,
  );
  const page = within(document.body);
  fireEvent.click(within(view.container).getByRole("button", { name: "Open search" }));
  const dialog = within(await page.findByRole("dialog", {}, { timeout: 10_000 }));
  fireEvent.change(dialog.getByRole("combobox"), { target: { value: query } });
  const hit = await waitFor(
    () => {
      const option = dialog
        .getAllByRole("option")
        .find((element) => element.textContent?.includes(expected));
      if (option === undefined) {
        throw new Error(`no ${expected} option yet`);
      }
      return option;
    },
    { timeout: 10_000 },
  );
  return { view, page, hit };
}

test("library search finds a member through one typo", async () => {
  const { view, page, hit } = await searchFor("regster", "in.button.register");
  fireEvent.click(hit);
  await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
  expect(router.pushed.at(-1)).toBe(`${LIBRARY_PAGE}#in.button.register`);
  view.unmount();
}, 60_000);

test("library search shows a long text hit as the passage around the query", async () => {
  const { view, hit } = await searchFor("install", "install");
  expect(hit.textContent?.length).toBeLessThan(400);
  view.unmount();
}, 60_000);
