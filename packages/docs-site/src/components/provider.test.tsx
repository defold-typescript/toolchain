import { afterAll, expect, mock, spyOn, test } from "bun:test";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "@defold-typescript/docs-render/test-dom";
import { withBase } from "@defold-typescript/docs-render/base";
import { exportSearchIndex } from "@defold-typescript/docs-render/search-export";
import {
  type SearchRecord,
  searchIndexFileForRoute,
  searchPageHref,
} from "@defold-typescript/docs-render/search-route";
import {
  fireEvent,
  registerDom,
  render,
  unregisterDom,
  waitFor,
  within,
} from "@defold-typescript/docs-render/test-dom";
import { SHARED_INDEX_RECORDS } from "@defold-typescript/docs-render/test-search-index";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { type ComponentProps, useEffect } from "react";

const VERSION_IDS = ["defold-1.12.0", "defold-1.13.0"];

const router = { path: "/guides/build", pushed: [] as string[] };

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

function surfaceRecords(prefix: string): SearchRecord[] {
  return [
    { route: `${prefix}/go`, title: "go", text: "Game object API" },
    { route: `${prefix}/go#go.animate`, title: "go.animate", text: "Animates a property" },
  ];
}

const indexes = new Map<string, string>();
for (const [file, records] of [
  ["search-index.json", SHARED_INDEX_RECORDS],
  ["search-index-defold-1.12.0.json", surfaceRecords("/api/defold-1.12.0")],
  ["search-index-defold-1.13.0.json", surfaceRecords("/api/defold-1.13.0")],
] as const) {
  const index = await exportSearchIndex(records);
  indexes.set(withBase(`/${file}`), JSON.stringify(index));
}

// Any URL but the three index files answers 404, so a wrong fetch fails the search loudly.
async function serveIndex(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = indexes.get(url);
  return body === undefined
    ? new Response(`no fixture for ${url}`, { status: 404 })
    : new Response(body, { headers: { "content-type": "application/json" } });
}

registerDom();
const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(serveIndex as typeof fetch);

afterAll(async () => {
  fetchSpy.mockRestore();
  await unregisterDom();
});

let probeMounts = 0;

function Probe() {
  const { setOpenSearch } = useSearchContext();
  useEffect(() => {
    probeMounts += 1;
  }, []);
  return (
    <button type="button" onClick={() => setOpenSearch(true)}>
      Open search
    </button>
  );
}

test("the search dialog queries the current route's index and remounts alone", async () => {
  const tree = () => (
    <Provider versionIds={VERSION_IDS}>
      <Probe />
    </Provider>
  );
  const view = render(tree());
  const page = within(document.body);

  const navigate = (path: string) => {
    router.path = path;
    view.rerender(tree());
  };

  const searchAnimate = async (): Promise<string | undefined> => {
    fireEvent.click(view.getByRole("button", { name: "Open search" }));
    const dialog = within(await page.findByRole("dialog", {}, { timeout: 10_000 }));
    fireEvent.change(dialog.getByRole("combobox"), { target: { value: "go.animate" } });
    const hit = await waitFor(
      () => {
        const option = dialog
          .getAllByRole("option")
          .find((element) => element.textContent?.includes("go.animate"));
        if (option === undefined) {
          throw new Error("no go.animate option yet");
        }
        return option;
      },
      { timeout: 10_000 },
    );
    fireEvent.click(hit);
    await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
    return router.pushed.at(-1);
  };

  expect(await searchAnimate()).toBe("/api/go#go.animate");

  navigate("/api/defold-1.12.0/go");
  expect(await searchAnimate()).toBe("/api/defold-1.12.0/go#go.animate");

  navigate("/api/defold-1.13.0/go");
  expect(await searchAnimate()).toBe("/api/defold-1.13.0/go#go.animate");

  navigate("/guides/build");
  expect(await searchAnimate()).toBe("/api/go#go.animate");

  expect(probeMounts).toBe(1);
}, 60_000);

test("the search dialog finds a member through one typo", async () => {
  router.path = "/guides/build";
  const view = render(
    <Provider versionIds={VERSION_IDS}>
      <Probe />
    </Provider>,
  );
  const page = within(document.body);

  // Testing Library cleans up only in the file that loads it first, so an earlier
  // test's tree can still be mounted here.
  fireEvent.click(within(view.container).getByRole("button", { name: "Open search" }));
  const dialog = within(await page.findByRole("dialog", {}, { timeout: 10_000 }));
  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "animte" } });
  const hit = await waitFor(
    () => {
      const option = dialog
        .getAllByRole("option")
        .find((element) => element.textContent?.includes("go.animate"));
      if (option === undefined) {
        throw new Error("no go.animate option yet");
      }
      return option;
    },
    { timeout: 10_000 },
  );
  fireEvent.click(hit);
  await waitFor(() => expect(page.queryByRole("dialog")).toBeNull());
  expect(router.pushed.at(-1)).toBe("/api/go#go.animate");
  view.unmount();
}, 60_000);

test("the search dialog links to the results page for the query and the route's index", async () => {
  router.path = "/api/defold-1.13.0/go";
  const view = render(
    <Provider versionIds={VERSION_IDS}>
      <Probe />
    </Provider>,
  );
  const page = within(document.body);

  fireEvent.click(within(view.container).getByRole("button", { name: "Open search" }));
  const dialog = within(await page.findByRole("dialog", {}, { timeout: 10_000 }));
  const resultsLinks = () =>
    dialog
      .queryAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.startsWith(withBase("/search")));

  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "a" } });
  expect(resultsLinks()).toEqual([]);

  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "animate" } });
  expect(resultsLinks()).toEqual([
    searchPageHref("animate", searchIndexFileForRoute("/api/defold-1.13.0/go", VERSION_IDS)),
  ]);
  view.unmount();
}, 60_000);

test("the search dialog shows a long text hit as the passage around the query", async () => {
  router.path = "/guides/build";
  const view = render(
    <Provider versionIds={VERSION_IDS}>
      <Probe />
    </Provider>,
  );
  const page = within(document.body);

  fireEvent.click(within(view.container).getByRole("button", { name: "Open search" }));
  const dialog = within(await page.findByRole("dialog", {}, { timeout: 10_000 }));
  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "install" } });
  const hit = await waitFor(
    () => {
      const option = dialog
        .getAllByRole("option")
        .find((element) => element.textContent?.includes("install"));
      if (option === undefined) {
        throw new Error("no install option yet");
      }
      return option;
    },
    { timeout: 10_000 },
  );
  expect(hit.textContent?.length).toBeLessThan(400);
  view.unmount();
}, 60_000);
