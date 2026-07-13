import { describe, expect, test } from "bun:test";
import { redirectHtml } from "./api-redirect";

describe("redirectHtml", () => {
  test("emits a meta refresh, canonical link, noindex, and location.replace to the target", () => {
    const html = redirectHtml("/api/combined/camera", "/api/camera");
    expect(html).toContain('content="0; url=/api/camera"');
    expect(html).toContain('<link rel="canonical" href="/api/camera">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('location.replace("/api/camera")');
    expect(html).toContain('<a href="/api/camera">');
  });

  test("redirects the Combined index to the canonical /api index", () => {
    const html = redirectHtml("/api/combined", "/api");
    expect(html).toContain('content="0; url=/api"');
    expect(html).toContain('<link rel="canonical" href="/api">');
    expect(html).toContain('location.replace("/api")');
  });

  test("prepends the deploy base to the target on both the meta refresh and canonical", () => {
    const html = redirectHtml("/api/combined/go", "/api/go", "/toolchain");
    expect(html).toContain('content="0; url=/toolchain/api/go"');
    expect(html).toContain('<link rel="canonical" href="/toolchain/api/go">');
    expect(html).toContain('location.replace("/toolchain/api/go")');
  });
});
