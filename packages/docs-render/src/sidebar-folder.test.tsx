import { afterAll, expect, test } from "bun:test";
// A document must exist before React DOM and Radix load; see test-dom.ts.
import "./test-dom";
import { flattenTree, type Root } from "fumadocs-core/page-tree";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { fireEvent, registerDom, render, unregisterDom, within } from "./test-dom";

const { FrameworkProvider } = await import("fumadocs-core/framework");
const { RootProvider } = await import("fumadocs-ui/provider/base");
const { DocsLayout } = await import("fumadocs-ui/layouts/docs");
const { MountedSidebarFolder } = await import("./sidebar-folder");

registerDom();
afterAll(unregisterDom);

// Folder A has no index page; folder B has one and nests folder C.
const TREE: Root = {
  name: "Docs",
  children: [
    {
      type: "folder",
      name: "A",
      children: [
        { type: "page", name: "A one", url: "/a/one" },
        { type: "page", name: "A two", url: "/a/two" },
      ],
    },
    {
      type: "folder",
      name: "B",
      index: { type: "page", name: "B", url: "/b" },
      children: [
        { type: "page", name: "B one", url: "/b/one" },
        {
          type: "folder",
          name: "C",
          children: [{ type: "page", name: "C one", url: "/b/c/one" }],
        },
      ],
    },
  ],
};

const TREE_URLS = flattenTree(TREE.children).map((item) => item.url);

function Link({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
  return <a {...props} />;
}

const router = { push: () => {}, refresh: () => {} };

function Docs({ path }: { path: string }) {
  return (
    <FrameworkProvider
      usePathname={() => path}
      useParams={() => ({})}
      useRouter={() => router}
      Link={Link}
    >
      <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
        <DocsLayout tree={TREE} sidebar={{ components: { Folder: MountedSidebarFolder } }}>
          <main />
        </DocsLayout>
      </RootProvider>
    </FrameworkProvider>
  );
}

// The server shows the desktop sidebar; a DOM render may pick the drawer instead.
function sidebarIn(container: ParentNode): HTMLElement {
  const aside =
    container.querySelector<HTMLElement>("#nd-sidebar") ??
    container.querySelector<HTMLElement>("#nd-sidebar-mobile");
  if (aside === null) {
    throw new Error("no sidebar rendered");
  }
  return aside;
}

function serverSidebar(path: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToString(<Docs path={path} />);
  return sidebarIn(host);
}

function linkTo(aside: HTMLElement, url: string): HTMLAnchorElement {
  const link = aside.querySelector<HTMLAnchorElement>(`a[href="${url}"]`);
  if (link === null) {
    throw new Error(`no sidebar link to ${url}`);
  }
  return link;
}

function hiddenByUrl(aside: HTMLElement): Record<string, boolean> {
  return Object.fromEntries(
    TREE_URLS.map((url) => [url, linkTo(aside, url).parentElement?.closest("[hidden]") != null]),
  );
}

test("the server HTML holds every link of the tree and keeps closed folders' links hidden", () => {
  const aside = serverSidebar("/a/one");
  expect(hiddenByUrl(aside)).toEqual({
    "/a/one": false,
    "/a/two": false,
    "/b": false,
    "/b/one": true,
    "/b/c/one": true,
  });
});

test("a folder on the current path starts open and marks its index link as the current page", () => {
  const aside = serverSidebar("/b");
  expect(hiddenByUrl(aside)).toEqual({
    "/a/one": true,
    "/a/two": true,
    "/b": false,
    "/b/one": false,
    "/b/c/one": true,
  });
  expect(linkTo(aside, "/b").getAttribute("aria-current")).toBe("page");
  expect(linkTo(aside, "/b/one").getAttribute("aria-current")).toBeNull();
});

test("folder triggers still open and close their folders", () => {
  const view = render(<Docs path="/a/one" />);
  const aside = sidebarIn(view.container);
  const chevron = linkTo(aside, "/b").querySelector("[data-icon]");
  if (chevron === null) {
    throw new Error("folder B's link has no chevron");
  }
  fireEvent.click(chevron);
  expect(hiddenByUrl(aside)["/b/one"]).toBe(false);
  const trigger = within(aside).getByRole("button", { name: "C" });
  fireEvent.click(trigger);
  expect(hiddenByUrl(aside)["/b/c/one"]).toBe(false);
  fireEvent.click(trigger);
  expect(hiddenByUrl(aside)["/b/c/one"]).toBe(true);
  view.unmount();
});
