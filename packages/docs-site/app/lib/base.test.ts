import { describe, expect, test } from "bun:test";
import { withBase } from "./base";

// Outside Vite (the Bun test runner) `import.meta.env` is undefined, so the base
// resolves to `/` and every call is an identity on an already root-absolute
// path. The subpath rewrite (`/toolchain/...`) is verified by the build itself.
describe("withBase at the domain root", () => {
  test("leaves a root-absolute route unchanged", () => {
    expect(withBase("/api")).toBe("/api");
    expect(withBase("/api/go")).toBe("/api/go");
  });

  test("maps the home path to itself", () => {
    expect(withBase("/")).toBe("/");
  });

  test("normalizes a manifest-relative path to root-absolute", () => {
    expect(withBase("static/client.js")).toBe("/static/client.js");
  });
});

// The base is read once at module load, so a subpath needs a fresh module
// instance evaluated while the build-time token is defined.
async function withBaseUnder(docsBase: string): Promise<typeof withBase> {
  const scope = globalThis as { __DOCS_BASE__?: string };
  scope.__DOCS_BASE__ = docsBase;
  try {
    const specifier = `./base?docs-base=${docsBase}`;
    return ((await import(specifier)) as { withBase: typeof withBase }).withBase;
  } finally {
    delete scope.__DOCS_BASE__;
  }
}

describe("withBase under a subpath", () => {
  test("prefixes a root-absolute route", async () => {
    const underSubpath = await withBaseUnder("/toolchain/");
    expect(underSubpath("/x")).toBe("/toolchain/x");
  });

  test("leaves an absolute URL unchanged", async () => {
    const underSubpath = await withBaseUnder("/toolchain/");
    expect(underSubpath("https://example.com/x")).toBe("https://example.com/x");
    expect(underSubpath("http://example.com/x")).toBe("http://example.com/x");
  });
});
