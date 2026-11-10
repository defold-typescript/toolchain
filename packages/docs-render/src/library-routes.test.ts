import { describe, expect, test } from "bun:test";
import { libraryApiRoute, libraryListingRoute } from "./library-routes";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("libraryApiRoute", () => {
  test("addresses a page by its origin host, owner, repo and namespace", () => {
    expect(libraryApiRoute("https://github.com/Insality/defold-tweener", "tweener")).toBe(
      "/api/github.com/insality/defold-tweener/tweener",
    );
  });

  test("keeps the dots of a dotted module", () => {
    expect(libraryApiRoute("https://github.com/britzl/monarch", "monarch.monarch")).toBe(
      "/api/github.com/britzl/monarch/monarch.monarch",
    );
  });

  test("lowercases the namespace", () => {
    expect(libraryApiRoute("https://github.com/someone/defold-anim", "bzAnim")).toBe(
      "/api/github.com/someone/defold-anim/bzanim",
    );
  });

  test("routes a Codeberg origin under its own host", () => {
    expect(libraryApiRoute("https://codeberg.org/Klaleus/defold-checkpoint", "checkpoint")).toBe(
      "/api/codeberg.org/klaleus/defold-checkpoint/checkpoint",
    );
  });

  test("lowercases the host", () => {
    expect(libraryApiRoute("https://GitHub.com/britzl/monarch", "monarch")).toBe(
      "/api/github.com/britzl/monarch/monarch",
    );
  });

  test("drops a default port from the host", () => {
    expect(libraryApiRoute("https://github.com:443/britzl/monarch", "monarch")).toBe(
      "/api/github.com/britzl/monarch/monarch",
    );
  });

  test("keeps a host whose name ends in a dash and digits apart from one with a port", () => {
    expect(libraryApiRoute("http://git.acme.com-3000/games/monarch", "monarch")).toBe(
      "/api/git.acme.com-3000/games/monarch/monarch",
    );
    const ported = "http://git.acme.com:3000/games/monarch";
    expect(() => libraryApiRoute(ported, "monarch")).toThrow(new RegExp(escapeRegExp(ported)));
  });

  test("reads only the owner and repo from a longer origin URL", () => {
    expect(libraryApiRoute("https://github.com/defold/extension-spine/", "gui")).toBe(
      "/api/github.com/defold/extension-spine/gui",
    );
  });
});

describe("libraryListingRoute", () => {
  test("addresses a listing by its origin host, owner and repo", () => {
    expect(libraryListingRoute("https://github.com/Jerakin/editor-script-align")).toBe(
      "/libraries/github.com/jerakin/editor-script-align",
    );
  });
});

describe("a URL or segment that cannot name a route", () => {
  test("a URL with no owner or no repo throws naming the URL", () => {
    for (const url of ["https://github.com/", "https://github.com/someone", "github.com/a/b"]) {
      expect(() => libraryListingRoute(url)).toThrow(new RegExp(escapeRegExp(url)));
      expect(() => libraryApiRoute(url, "lib")).toThrow(new RegExp(escapeRegExp(url)));
    }
  });

  test("an origin segment that is not one safe route and file name throws naming the URL", () => {
    for (const url of [
      "https://github.com/someone/.github",
      "https://github.com/con/lib",
      "https://github.com/someone/lib-",
      "https://github.com/someone/nul.lib",
    ]) {
      expect(() => libraryListingRoute(url)).toThrow(new RegExp(escapeRegExp(url)));
      expect(() => libraryApiRoute(url, "lib")).toThrow(new RegExp(escapeRegExp(url)));
    }
  });

  test("a namespace that is not one safe route and file name throws naming the URL", () => {
    const url = "https://github.com/someone/lib";
    for (const namespace of ["", ".lib", "lib.", "Aux", "com1.gui", "a/b", "a b"]) {
      expect(() => libraryApiRoute(url, namespace)).toThrow(new RegExp(escapeRegExp(url)));
    }
  });
});
