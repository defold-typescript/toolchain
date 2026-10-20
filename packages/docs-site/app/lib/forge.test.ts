import { describe, expect, test } from "bun:test";
import { forgeOf, repoTreeUrl } from "./forge";

describe("forgeOf", () => {
  test("names GitHub and Codeberg by host, case-insensitively", () => {
    expect(forgeOf("https://github.com/britzl/defold-input")).toBe("GitHub");
    expect(forgeOf("https://codeberg.org/Klaleus/defold-shutter")).toBe("Codeberg");
    expect(forgeOf("https://Codeberg.org/Klaleus/defold-shutter")).toBe("Codeberg");
  });

  test("an empty URL or an unknown host names no forge", () => {
    expect(forgeOf("")).toBeUndefined();
    expect(forgeOf("https://gitlab.com/acme/widget")).toBeUndefined();
  });
});

describe("repoTreeUrl", () => {
  test("GitHub browses a ref under /tree/", () => {
    expect(repoTreeUrl("https://github.com/britzl/defcon", "2.6.0")).toBe(
      "https://github.com/britzl/defcon/tree/2.6.0",
    );
  });

  test("Codeberg browses a ref under /src/commit/, since it serves no /tree/ route", () => {
    expect(repoTreeUrl("https://codeberg.org/Klaleus/defold-shutter/", "fc0e632")).toBe(
      "https://codeberg.org/Klaleus/defold-shutter/src/commit/fc0e632",
    );
  });
});
