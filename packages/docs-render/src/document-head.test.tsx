import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentHead } from "./document-head";

function renderHead(child?: ReactNode): Document {
  const html = renderToStaticMarkup(
    <html lang="en">
      <DocumentHead basePath="/toolchain/">{child}</DocumentHead>
      <body />
    </html>,
  );
  const window = new Window();
  window.document.write(html);
  return window.document as unknown as Document;
}

describe("DocumentHead", () => {
  test("declares UTF-8 and a device-width viewport once each", () => {
    const head = renderHead().head;
    const charsets = head.querySelectorAll("meta[charset]");
    expect(charsets.length).toBe(1);
    expect(charsets[0]?.getAttribute("charset")?.toLowerCase()).toBe("utf-8");
    const viewports = head.querySelectorAll('meta[name="viewport"]');
    expect(viewports.length).toBe(1);
    expect(viewports[0]?.getAttribute("content")).toBe("width=device-width, initial-scale=1");
  });

  test("resolves the stylesheet and every favicon under the base path", () => {
    const head = renderHead().head;
    const stylesheet = head.querySelector('link[rel="stylesheet"]');
    expect(stylesheet?.getAttribute("href")).toBe("/toolchain/critical.css");
    const icons = [...head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.getAttribute("href")).toStartWith("/toolchain/");
  });

  test("renders a child inside the head, before the stylesheet", () => {
    const head = renderHead(<script id="child-script" />).head;
    const child = head.querySelector("#child-script");
    const stylesheet = head.querySelector('link[rel="stylesheet"]');
    expect(child).not.toBeNull();
    expect(stylesheet).not.toBeNull();
    if (!child || !stylesheet) return;
    const FOLLOWING = 4;
    expect(child.compareDocumentPosition(stylesheet) & FOLLOWING).toBe(FOLLOWING);
  });
});
