import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
// A document must exist before React DOM loads; see test-dom.ts.
import "./test-dom";
import { withBase } from "./base";
import { exportSearchIndex } from "./search-export";
import { DEFAULT_SEARCH_INDEX_FILE, type SearchRecord } from "./search-route";
import { registerDom, render, unregisterDom, waitFor, within } from "./test-dom";
import { SHARED_INDEX_RECORDS } from "./test-search-index";

const { SearchResults } = await import("./search-results");

const VERSION_RECORDS: SearchRecord[] = [
  { route: "/api/defold-1.14.0/go", title: "go", text: "Game object API" },
  {
    route: "/api/defold-1.14.0/go#go.animate",
    title: "go.animate",
    text: "Animates a property",
  },
];

// The shared index carries the records every test that searches it must serve; see
// test-search-index.ts.
const indexes = new Map<string, string>();
for (const [file, records] of [
  [DEFAULT_SEARCH_INDEX_FILE, SHARED_INDEX_RECORDS],
  ["search-index-defold-1.14.0.json", VERSION_RECORDS],
] as const) {
  indexes.set(withBase(`/${file}`), JSON.stringify(await exportSearchIndex(records)));
}

// Any URL but the index files answers 404, so a page that fetches the wrong index finds nothing.
async function serveIndex(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = indexes.get(url);
  return body === undefined
    ? new Response(`no fixture for ${url}`, { status: 404 })
    : new Response(body, { headers: { "content-type": "application/json" } });
}

const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(serveIndex as typeof fetch);

beforeAll(registerDom);

afterEach(() => {
  fetchSpy.mockClear();
});

afterAll(async () => {
  fetchSpy.mockRestore();
  await unregisterDom();
});

// The registered window starts on `about:blank`, where history cannot change the URL.
function openPage(pathAndSearch: string) {
  const { happyDOM } = window as unknown as { happyDOM: { setURL(url: string): void } };
  happyDOM.setURL(`http://docs.test${pathAndSearch}`);
  return render(<SearchResults versionIds={["defold-1.14.0"]} />);
}

test("the results page searches the index its URL names, through one typo", async () => {
  const view = openPage("/search?q=animte&index=search-index-defold-1.14.0.json");
  const results = within(view.container);
  const href = withBase("/api/defold-1.14.0/go#go.animate");
  await waitFor(
    () => {
      const links = results.getAllByRole("link").map((link) => link.getAttribute("href"));
      expect(links).toContain(href);
    },
    { timeout: 10_000 },
  );
  view.unmount();
}, 30_000);

test("the results page shows a long section as the passage around the query", async () => {
  const view = openPage("/search?q=install");
  const results = within(view.container);
  const hit = await waitFor(
    () => {
      const link = results
        .getAllByRole("link")
        .find((element) => element.textContent?.includes("install"));
      if (link === undefined) {
        throw new Error("no install hit yet");
      }
      return link;
    },
    { timeout: 10_000 },
  );
  expect(hit.textContent?.length).toBeLessThan(400);
  view.unmount();
}, 30_000);

test("the results page fetches nothing without a query", async () => {
  const view = openPage("/search");
  await waitFor(() => expect(within(view.container).getByRole("status")).toBeDefined());
  expect(fetchSpy).not.toHaveBeenCalled();
  view.unmount();
});
