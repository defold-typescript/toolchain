import { describe, expect, test } from "bun:test";
import { libraryApiRoute, libraryListingRoute } from "./library-routes";

describe("libraryApiRoute", () => {
  test("addresses a page by its origin owner, repo and namespace", () => {
    expect(libraryApiRoute("https://github.com/Insality/defold-tweener", "tweener")).toBe(
      "/api/insality/defold-tweener/tweener",
    );
  });

  test("keeps the dots of a dotted module", () => {
    expect(libraryApiRoute("https://github.com/britzl/monarch", "monarch.monarch")).toBe(
      "/api/britzl/monarch/monarch.monarch",
    );
  });

  test("lowercases the namespace", () => {
    expect(libraryApiRoute("https://github.com/someone/defold-anim", "bzAnim")).toBe(
      "/api/someone/defold-anim/bzanim",
    );
  });

  test("routes a Codeberg origin the same way, leaving the host out of the path", () => {
    expect(libraryApiRoute("https://codeberg.org/Klaleus/defold-checkpoint", "checkpoint")).toBe(
      "/api/klaleus/defold-checkpoint/checkpoint",
    );
  });

  test("reads only the owner and repo from a longer origin URL", () => {
    expect(libraryApiRoute("https://github.com/defold/extension-spine/", "gui")).toBe(
      "/api/defold/extension-spine/gui",
    );
  });
});

describe("libraryListingRoute", () => {
  test("addresses a listing by its origin owner and repo", () => {
    expect(libraryListingRoute("https://github.com/Jerakin/editor-script-align")).toBe(
      "/libraries/jerakin/editor-script-align",
    );
  });
});

describe("a URL or segment that cannot name a route", () => {
  const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
