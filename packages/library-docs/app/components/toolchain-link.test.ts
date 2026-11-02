import { describe, expect, test } from "bun:test";
import { EXTERNAL_LINK_ICON } from "../lib/phosphor";
import { TOOLCHAIN_DOCS_URL } from "../lib/toolchain-links";
import { ToolchainLink } from "./toolchain-link";

describe("ToolchainLink", () => {
  const html = String(ToolchainLink());

  test("links to the toolchain docs and opens in a new tab", () => {
    expect(html).toContain(`href="${TOOLCHAIN_DOCS_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  test("marks the site it leaves for with the external icon", () => {
    expect(EXTERNAL_LINK_ICON).toContain('class="external-icon"');
    expect(html).toContain(EXTERNAL_LINK_ICON);
  });
});
