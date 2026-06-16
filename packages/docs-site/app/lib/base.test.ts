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
