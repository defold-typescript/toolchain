/** @jsxImportSource hono/jsx */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiPageMarkdown } from "../lib/api-page-render";
import { loadCombinedSurface } from "../lib/api-surface-loader";
import { combinedNamespaceToApiPage } from "../lib/combined-surface";
import { type Heading, pageHeadings } from "../lib/headings";
import { renderMarkdown } from "../lib/markdown";
import Toc from "./toc";

const BADGE_RE = /<span class="api-overload-count">([\s\S]*?)<\/span>/;
const TAG_RE = /<[^>]+>/g;

// The escapes hono/jsx writes into text and attribute values.
function decodeHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function anchorOf(html: string, id: string): { open: string; inner: string } {
  const start = html.indexOf(`<a href="#${id}"`);
  if (start < 0) throw new Error(`no outline entry for #${id}`);
  const openEnd = html.indexOf(">", start) + 1;
  return {
    open: html.slice(start, openEnd),
    inner: html.slice(openEnd, html.indexOf("</a>", openEnd)),
  };
}

describe("Toc outline entries (vmath, committed artifacts)", async () => {
  const page = loadCombinedSurface(join(import.meta.dir, "../../../types"))
    .namespaces.map(combinedNamespaceToApiPage)
    .find((p) => p.namespace === "vmath");
  if (!page) throw new Error("namespace vmath missing from the Combined surface");
  const headings: Heading[] = pageHeadings(
    await renderMarkdown(
      apiPageMarkdown(page, (t) => t, { combinedMarkers: true }),
      {
        highlightSignatureHeadings: true,
      },
    ),
  );
  const badged = headings.filter((h) => h.badge !== undefined);
  const plain = headings.filter((h) => h.badge === undefined);
  const renders = {
    rail: String(<Toc headings={headings} />),
    dropdown: String(<Toc headings={headings} showHeading={false} showTooltip={false} />),
  };

  test("both placements have badged and plain entries to check", () => {
    expect(badged.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
  });

  for (const [placement, html] of Object.entries(renders)) {
    test(`${placement}: a badged entry reads its text with the badge in place of the text it stands for`, () => {
      for (const h of badged) {
        const { start, end, label } = h.badge as NonNullable<Heading["badge"]>;
        const { inner } = anchorOf(html, h.id);
        const match = inner.match(BADGE_RE);
        const index = match?.index ?? -1;
        expect({
          id: h.id,
          before: decodeHtml(inner.slice(0, index).replace(TAG_RE, "")),
          label: match && decodeHtml(match[1] ?? ""),
          after: decodeHtml(inner.slice(index + (match?.[0].length ?? 0)).replace(TAG_RE, "")),
        }).toEqual({
          id: h.id,
          before: h.text.slice(0, start),
          label,
          after: h.text.slice(end),
        });
      }
    });

    test(`${placement}: a plain entry reads its heading text unchanged`, () => {
      for (const h of plain) {
        const { inner } = anchorOf(html, h.id);
        expect({ id: h.id, text: decodeHtml(inner) }).toEqual({ id: h.id, text: h.text });
      }
    });
  }

  test("dropdown: every entry's native title is the plain heading text, never the badge label", () => {
    for (const h of headings) {
      const title = anchorOf(renders.dropdown, h.id).open.match(/\stitle="([^"]*)"/)?.[1];
      expect({ id: h.id, title: title && decodeHtml(title) }).toEqual({ id: h.id, title: h.text });
    }
  });
});
