import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  coloredChars,
  SIGNATURE_CODE_RE,
} from "@defold-typescript/docs-render/__fixtures__/signature-colors";
import { apiPageMarkdown } from "@defold-typescript/docs-render/api-page-render";
import {
  type ApiSymbol,
  apiModuleSymbols,
  groupOverloadForms,
  overloadFormCodes,
  overloadHeading,
  splitCallForm,
} from "@defold-typescript/docs-render/api-surface";
import { allPageHeadings, pageHeadings, slugify } from "@defold-typescript/docs-render/headings";
import { renderMarkdown } from "@defold-typescript/docs-render/markdown";
import { loadCombinedSurface } from "./api-surface-loader";
import { combinedNamespaceToApiPage } from "./combined-surface";

describe("overload block headings and form lines (committed artifacts)", () => {
  const pages = loadCombinedSurface(join(import.meta.dir, "../../../types")).namespaces.map(
    combinedNamespaceToApiPage,
  );
  const rendered = ["b2d.shape", "vmath"].map((namespace) => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`namespace ${namespace} missing from the Combined surface`);
    const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.kind === "function",
    );
    return { page, groups: groupOverloadForms(rows, page.availability?.versions ?? []) };
  });
  const htmlOf = new Map<string, Promise<string>>();
  const render = (namespace: string, markdown: () => string): Promise<string> => {
    let html = htmlOf.get(namespace);
    if (html === undefined) {
      html = renderMarkdown(markdown(), { highlightSignatureHeadings: true });
      htmlOf.set(namespace, html);
    }
    return html;
  };
  const pageHtml = (page: (typeof rendered)[number]["page"]) =>
    render(page.namespace, () => apiPageMarkdown(page, (t) => t, { combinedMarkers: true }));
  // The colors a lone signature heading gives each character: the reference a
  // fragment of that signature must match wherever it renders on its own.
  const signatureColors = async (signature: string) => {
    const html = await renderMarkdown(`### \`${signature}\`\n`, {
      highlightSignatureHeadings: true,
    });
    const code = [...html.matchAll(SIGNATURE_CODE_RE)][0]?.[1] ?? "";
    return coloredChars(code);
  };
  const h3Of = (html: string, id: string): string => {
    const start = html.indexOf(`<h3 id="${id}"`);
    if (start < 0) throw new Error(`no h3 with id ${id}`);
    return html.slice(start, html.indexOf("</h3>", start));
  };
  const multi = (groups: ApiSymbol[][]) => groups.filter((g) => g.length > 1);

  test("each overload heading splices its count badge into the colored signature", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const heading = overloadHeading(group);
        const h3 = h3Of(html, slugify(heading));
        const codes = [...h3.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
        expect({ name: head.name, codes: codes.length }).toEqual({ name: head.name, codes: 1 });
        const code = codes[0] ?? "";
        expect({ name: head.name, text: coloredChars(code).text }).toEqual({
          name: head.name,
          text: heading.replace("(...)", "()"),
        });
        const badge = code.match(
          /<span class="api-overload-count" data-toc-text="\.\.\.">(\d+) overloads<\/span>/,
        );
        expect({ name: head.name, count: badge?.[1] }).toEqual({
          name: head.name,
          count: String(group.length),
        });
        const [before, after] = code.split(badge?.[0] ?? "\u0000");
        expect({ name: head.name, before: coloredChars(before ?? "").text }).toEqual({
          name: head.name,
          before: `${head.name}(`,
        });
        expect(coloredChars(after ?? "").text.startsWith(")")).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("each overview item of a grouped function splices its count badge into the colored signature", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      const start = html.indexOf('<div class="api-overview"');
      const overview = html.slice(start, html.indexOf("</div>", start));
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const heading = overloadHeading(group);
        const slug = slugify(heading);
        expect(h3Of(html, slug)).toContain(slug);
        const link = overview.indexOf(`<a href="#${slug}">`);
        expect({ name: head.name, linked: link >= 0 }).toEqual({ name: head.name, linked: true });
        const item = overview.slice(link, overview.indexOf("</a>", link));
        const codes = [...item.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
        expect({ name: head.name, codes: codes.length }).toEqual({ name: head.name, codes: 1 });
        const code = codes[0] ?? "";
        const badges = [
          ...code.matchAll(/<span class="api-overload-count"[^>]*>(\d+) overloads<\/span>/g),
        ];
        expect({ name: head.name, counts: badges.map((b) => b[1]) }).toEqual({
          name: head.name,
          counts: [String(group.length)],
        });
        expect({ name: head.name, text: coloredChars(code).text }).toEqual({
          name: head.name,
          text: heading.replace("(...)", "()"),
        });
        const [before, after] = code.split(badges[0]?.[0] ?? "\u0000");
        expect({ name: head.name, before: coloredChars(before ?? "").text }).toEqual({
          name: head.name,
          before: `${head.name}(`,
        });
        expect(coloredChars(after ?? "").text.startsWith(")")).toBe(true);
        checked += 1;
      }
      expect({
        namespace: page.namespace,
        badges: overview.match(/class="api-overload-count"/g)?.length ?? 0,
      }).toEqual({ namespace: page.namespace, badges: multi(groups).length });
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("form lines, overview items and the heading color each character as the full signature does", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      const html = await pageHtml(page);
      const overview = html.slice(
        html.indexOf('<div class="api-overview"'),
        html.indexOf("</div>", html.indexOf('<div class="api-overview"')),
      );
      const overviewCodes = [...overview.matchAll(SIGNATURE_CODE_RE)].map((m) => m[1] ?? "");
      let cursor = 0;
      for (const group of groups) {
        const [head] = group;
        if (head === undefined) continue;
        cursor += 1;
        if (group.length === 1) continue;
        const codes = overloadFormCodes(group);
        const h3 = h3Of(html, slugify(overloadHeading(group)));
        const blockStart = html.indexOf(h3);
        const block = html.slice(blockStart, html.indexOf("</ol>", blockStart));
        const formLines = block
          .split('<li class="api-overload">')
          .slice(1)
          .map((item) => [...item.matchAll(SIGNATURE_CODE_RE)][0]?.[1]);
        const children = overviewCodes.slice(cursor, cursor + codes.length);
        cursor += codes.length;
        for (const [index, code] of codes.entries()) {
          const expected = await signatureColors(`${head.name}${code}`);
          const want = {
            text: expected.text.slice(head.name.length),
            colors: expected.colors.slice(head.name.length),
          };
          for (const [where, got] of [
            ["form line", formLines[index]],
            ["overview item", children[index]],
          ] as const) {
            expect({ name: head.name, where, index, ...coloredChars(got ?? "") }).toEqual({
              name: head.name,
              where,
              index,
              ...want,
            });
          }
        }
        // A generic head (`vmath.lerp<T ...>`) makes Shiki read the name as a
        // plain identifier; the heading drops it, so it matches a plain call form.
        const plain = group.find((s) => splitCallForm(s).params.startsWith("(")) ?? head;
        const full = await signatureColors(plain.signature);
        const heading = coloredChars([...h3.matchAll(SIGNATURE_CODE_RE)][0]?.[1] ?? "");
        const returns = overloadHeading(group).slice(`${head.name}(...)`.length);
        const n = head.name.length;
        expect({ name: head.name, colors: heading.colors.slice(0, n) }).toEqual({
          name: head.name,
          colors: full.colors.slice(0, n),
        });
        if (returns) {
          expect({ name: head.name, colors: heading.colors.slice(-returns.length) }).toEqual({
            name: head.name,
            colors: full.colors.slice(-returns.length),
          });
        }
        checked += 1;
      }
      expect({ namespace: page.namespace, cursor }).toEqual({
        namespace: page.namespace,
        cursor: overviewCodes.length,
      });
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("the outline reads each overload heading as its heading text", async () => {
    let checked = 0;
    for (const { page, groups } of rendered) {
      // The version-dot glyphs every Combined heading ends with are not in scope.
      const html = (await pageHtml(page)).replace(
        /<span class="api-badge-dot[^"]*"[^>]*>[^<]*<\/span>/g,
        "",
      );
      const headings = allPageHeadings(html);
      for (const group of multi(groups)) {
        const id = slugify(overloadHeading(group));
        expect(headings.find((h) => h.id === id)?.text).toBe(overloadHeading(group));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("the outline carries each overload heading's badge over its `...`, and no other heading has one", async () => {
    let checked = 0;
    let plain = 0;
    for (const { page, groups } of rendered) {
      const headings = pageHeadings(await pageHtml(page));
      const overloadIds = new Set<string>();
      for (const group of multi(groups)) {
        const [head] = group;
        if (head === undefined) continue;
        const id = slugify(overloadHeading(group));
        overloadIds.add(id);
        const heading = headings.find((h) => h.id === id);
        const badge = heading?.badge;
        expect({
          name: head.name,
          covers: badge && heading?.text.slice(badge.start, badge.end),
          start: badge?.start,
          label: badge?.label,
        }).toEqual({
          name: head.name,
          covers: "...",
          start: head.name.length + 1,
          label: `${group.length} overloads`,
        });
        checked += 1;
      }
      for (const heading of headings) {
        if (overloadIds.has(heading.id)) continue;
        expect({ id: heading.id, badge: "badge" in heading }).toEqual({
          id: heading.id,
          badge: false,
        });
        plain += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(plain).toBeGreaterThan(10);
  });
});
