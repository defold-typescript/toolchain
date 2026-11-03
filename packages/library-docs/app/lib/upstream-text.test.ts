import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apiLinkify, apiPageMarkdown, listingPageMarkdown } from "./api-page-render";
import {
  defoldListingsFromManifest,
  type LibraryDirs,
  loadLibraryPageSources,
  portalListingsFromManifest,
} from "./api-surface-loader";
import { renderMarkdown } from "./markdown";
import { isSafeLink } from "./upstream-text";

const SCRIPT = "<script>alert(1)</script>";
const ENCODED_SCRIPT = "&lt;script&gt;alert(1)&lt;/script&gt;";
const IMG = "<img src=x onerror=alert(1)>";
const LINK = "[x](javascript:alert(1))";
const PAYLOAD = `${SCRIPT} ${IMG} ${LINK}`;
const BAD_PORTAL_ID = `x) ${IMG}`;

function dataDirs(): LibraryDirs {
  const root = mkdtempSync(join(tmpdir(), "upstream-text-"));
  const dataDir = join(root, "data", "0.55.0");
  const modelDir = join(root, "model");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(
    join(dataDir, "library-classification.json"),
    JSON.stringify({
      source: { repo: "https://github.com/x/y", commit: "a", license: "MIT" },
      dirs: [],
    }),
  );
  return { dataDir, modelDir };
}

function writeLibrary(dirs: LibraryDirs, namespace: string): void {
  const folder = join(dirs.dataDir, namespace);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "library.json"),
    JSON.stringify({
      repo: `https://github.com/someone/${namespace}`,
      license: "MIT",
      forks: [{ moduleId: namespace, namespace, apiDoc: `api-doc/${namespace}.json` }],
    }),
  );
  writeFileSync(join(folder, "reviewed.json"), JSON.stringify({ ref: "1.0.0" }));
}

function writeModule(dirs: LibraryDirs, namespace: string, doc: string, deprecated = doc): void {
  writeLibrary(dirs, namespace);
  writeFileSync(
    join(dirs.modelDir, `${namespace}.json`),
    JSON.stringify({
      info: { namespace, brief: doc, description: doc },
      elements: [
        {
          type: "FUNCTION",
          name: `${namespace}.run`,
          brief: doc,
          description: doc,
          parameters: [
            { name: "first", doc, types: ["string"] },
            { name: "second", doc: `prose\n${doc}`, types: ["string"] },
          ],
          returnvalues: [{ name: "out", doc, types: ["string"] }],
          examples: `x\n\`\`\`\n${doc}`,
          deprecated,
        },
      ],
    }),
  );
}

// The `deprecated` note is the symbol's `@deprecated` source text, not ref-doc HTML, so
// a test about how HTML converts gives it text of its own.
async function renderPage(doc: string, deprecated = doc): Promise<string> {
  const dirs = dataDirs();
  writeModule(dirs, "demo", doc, deprecated);
  const [source] = loadLibraryPageSources(dirs);
  if (!source) throw new Error("no page");
  return renderMarkdown(apiPageMarkdown(source.page, apiLinkify([source.page])));
}

function writeListing(dirs: LibraryDirs, repoUrl: string, ships: string): void {
  mkdirSync(join(dirs.dataDir, "defold-extensions", "summaries"), { recursive: true });
  writeFileSync(
    join(dirs.dataDir, "defold-extensions.json"),
    JSON.stringify({
      libraries: [
        {
          repo: repoUrl,
          ref: "1.0.0",
          refKind: "release",
          license: "MIT",
          description: "",
          docs: [],
        },
      ],
    }),
  );
  const file = repoUrl.split("/").pop() ?? "";
  writeFileSync(
    join(dirs.dataDir, "defold-extensions", "summaries", `${file}.md`),
    [
      "---",
      "api: none",
      "---",
      "",
      "## What it ships",
      "",
      ships,
      "",
      "## Using it",
      "",
      `1. ${ships}`,
      "",
      "## Engine APIs",
      "",
      ships,
      "",
    ].join("\n"),
  );
}

function writePortalLibrary(dirs: LibraryDirs, id: string): void {
  const docDir = join(dirs.dataDir, "asset-portal-script-api", "api-doc");
  mkdirSync(docDir, { recursive: true });
  writeFileSync(
    join(docDir, "demo.json"),
    JSON.stringify({ info: { namespace: "demo", brief: "", description: "" }, elements: [] }),
  );
  writeFileSync(
    join(dirs.dataDir, "asset-portal-script-api.json"),
    JSON.stringify({
      libraries: [
        {
          id,
          repo: "https://github.com/someone/demo",
          ref: "1.0.0",
          refKind: "tag",
          license: "MIT",
          description: "A demo.",
          docs: [{ path: "api/demo.script_api", namespace: "demo", page: "demo" }],
        },
      ],
    }),
  );
}

async function renderPortalPage(id: string): Promise<string> {
  const dirs = dataDirs();
  writePortalLibrary(dirs, id);
  const [source] = loadLibraryPageSources(dirs);
  if (!source) throw new Error("no page");
  return renderMarkdown(apiPageMarkdown(source.page, apiLinkify([source.page])));
}

function writePortalListing(dirs: LibraryDirs, id: string, description: string): void {
  writeFileSync(
    join(dirs.dataDir, "asset-portal.json"),
    JSON.stringify({
      entries: [
        {
          id,
          description,
          repo: "https://github.com/someone/demo",
          ref: "1.0.0",
          refKind: "tag",
          kind: "no-lua-api",
        },
      ],
    }),
  );
}

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

function expectInert(html: string): void {
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<img");
  expect(html).not.toMatch(/<[^>]*\sonerror=/);
  expect(html).not.toMatch(/href="\s*javascript:/i);
}

describe("upstream doc text on a library page", () => {
  test("a payload in the description, member and slot docs stays inert, its tags stripped", async () => {
    const html = await renderPage(PAYLOAD, "Use demo.walk.");
    expectInert(html);
    expect(textOf(html)).toContain("alert(1)");
    expect(textOf(html)).not.toContain("<script");
  });

  test("a tag the types package strips is stripped as on the toolchain site", async () => {
    const html = await renderPage(
      "Use <strong>bold</strong> and <table><tr><td>cell</td></tr></table>.",
      "Use demo.walk.",
    );
    expect(textOf(html)).toContain("Use bold and cell.");
    expect(html).not.toContain("&lt;strong");
    expect(html).not.toContain("&lt;table");
  });

  test("the deprecation note, source text rather than HTML, shows a payload as inert text", async () => {
    const html = await renderPage("Run it.", PAYLOAD);
    expectInert(html);
    expect(textOf(html)).toContain(`Deprecated — ${SCRIPT} ${IMG} x`);
  });

  test("an entity-encoded payload, which the ref-doc conversion decodes, stays inert", async () => {
    const html = await renderPage(
      "&lt;script&gt;alert(1)&lt;/script&gt; &#60;img src=x onerror=alert(1)&#62;",
    );
    expectInert(html);
    expect(textOf(html)).toContain(SCRIPT);
  });

  test("a backtick that opens no code span on its own line cannot hide a tag", async () => {
    for (const doc of [`\`x\n\`${SCRIPT}\``, `\`a\n- ${SCRIPT}\``, `\`\`\`\n${SCRIPT}\n\`\`\``]) {
      expectInert(await renderPage(doc));
    }
  });

  test("the payload reaches the deprecation note and breaks out of the example fence", async () => {
    const html = await renderPage(ENCODED_SCRIPT, SCRIPT);
    expect(html).toContain("api-availability");
    expect(html.split("&lt;script&gt;").length).toBeGreaterThan(4);
  });

  test("the same payload in a code span stays code, escaped once rather than twice", async () => {
    const html = await renderPage(
      `Before \`${ENCODED_SCRIPT}\` after`,
      `Before \`${SCRIPT}\` after`,
    );
    expectInert(html);
    expect(html).toContain("<code>&lt;script&gt;alert(1)&lt;/script&gt;</code>");
    expect(html).not.toContain("&amp;lt;");
  });

  test("a less-than in prose reads the same in the rendered text", async () => {
    const text = textOf(await renderPage("When a < b, an Array<number> is `Map<string>`."));
    expect(text).toContain("When a < b, an Array<number> is Map<string>.");
  });

  test("the structure tags real docs carry still shape the page", async () => {
    const html = await renderPage("<p>One.</p><p>Two <code>three</code>.</p>");
    expect(html).toContain("<p>One.</p>");
    expect(html).toContain("<code>three</code>");
  });

  test("a fenced example keeps its code readable", async () => {
    const html = await renderPage("```lua\nif a < b then end\n```");
    expect(textOf(html)).toContain("if a < b then end");
    expect(html).not.toContain("&amp;lt;");
  });

  test("a safe link survives and an unsafe one is reduced to its label", async () => {
    const html = await renderPage(`[good](https://example.com/a) and ${LINK}`);
    expect(html).toContain('href="https://example.com/a"');
    expect(html).not.toContain("javascript:");
    expect(textOf(html)).toContain("good and x");
  });

  test("a type or name whose backticks open a gap for a tag fails the load, naming the page", () => {
    for (const type of ["a` <img src=x onerror=alert(1)> `b", "a`", "a\n<script>"]) {
      const dirs = dataDirs();
      writeLibrary(dirs, "demo");
      writeFileSync(
        join(dirs.modelDir, "demo.json"),
        JSON.stringify({
          info: { namespace: "demo", brief: "", description: "" },
          elements: [
            {
              type: "FUNCTION",
              name: "demo.run",
              brief: "",
              description: "",
              parameters: [{ name: "first", doc: "", types: [type] }],
              returnvalues: [],
            },
          ],
        }),
      );
      expect(() => loadLibraryPageSources(dirs)).toThrow(/demo/);
    }
  });
});

describe("upstream listing text", () => {
  test("a payload in a summary's lead, steps and engine APIs stays inert", async () => {
    const dirs = dataDirs();
    writeListing(dirs, "https://github.com/defold/extension-x", PAYLOAD);
    const [listing] = defoldListingsFromManifest(dirs);
    if (!listing) throw new Error("no listing");
    const html = await renderMarkdown(listingPageMarkdown(listing));
    expectInert(html);
    expect(textOf(html)).toContain(SCRIPT);
  });

  test("a portal description holding a payload stays inert", async () => {
    const dirs = dataDirs();
    writePortalListing(dirs, "evil", PAYLOAD);
    const [listing] = portalListingsFromManifest(dirs);
    if (!listing) throw new Error("no listing");
    expectInert(await renderMarkdown(listingPageMarkdown(listing)));
  });

  test("a listing whose repo URL is not https makes the loader throw, naming the listing", () => {
    for (const url of ["javascript:alert(1)", "http://github.com/defold/x"]) {
      const dirs = dataDirs();
      writeFileSync(
        join(dirs.dataDir, "defold-extensions.json"),
        JSON.stringify({
          libraries: [
            { repo: url, ref: "1", refKind: "tag", license: "", description: "", docs: [] },
          ],
        }),
      );
      expect(() => defoldListingsFromManifest(dirs)).toThrow(url);
    }
  });

  test("a pin that would break out of a link destination makes the loader throw", () => {
    const dirs = dataDirs();
    writeFileSync(
      join(dirs.dataDir, "defold-extensions.json"),
      JSON.stringify({
        libraries: [
          {
            repo: "https://github.com/defold/x",
            ref: "1)<img src=x onerror=alert(1)>",
            refKind: "tag",
            license: "",
            description: "",
            docs: [],
          },
        ],
      }),
    );
    expect(() => defoldListingsFromManifest(dirs)).toThrow(/github\.com\/defold\/x/);
  });

  test("a library whose repo is not https makes the loader throw", () => {
    const dirs = dataDirs();
    writeLibrary(dirs, "demo");
    writeFileSync(
      join(dirs.dataDir, "demo", "library.json"),
      JSON.stringify({ repo: "javascript:alert(1)", license: "MIT" }),
    );
    expect(() => loadLibraryPageSources(dirs)).toThrow("javascript:alert(1)");
  });

  test("a page key that is not a plain name makes the loader throw", () => {
    const dirs = dataDirs();
    writeFileSync(
      join(dirs.dataDir, "defold-extensions.json"),
      JSON.stringify({
        libraries: [
          {
            repo: "https://github.com/defold/x",
            ref: "1",
            refKind: "tag",
            license: "",
            description: "",
            docs: [{ path: "a.script_api", namespace: "x", page: "../../secret" }],
          },
        ],
      }),
    );
    expect(() => loadLibraryPageSources(dirs)).toThrow(/\.\.\/\.\.\/secret/);
  });
});

describe("an Asset Portal ID", () => {
  const validLink = /Asset Portal: <a href="https:\/\/defold\.com\/assets\/good-id\/"/;

  test("a malformed ID on a script-API library rejects the page, naming the ID", async () => {
    await expect(renderPortalPage(BAD_PORTAL_ID)).rejects.toThrow(BAD_PORTAL_ID);
  });

  test("a valid ID on a script-API library links to its portal entry", async () => {
    const html = await renderPortalPage("good-id");
    expect(html).toMatch(validLink);
    expectInert(html);
  });

  test("a malformed ID on a listing makes the loader throw, naming the ID", () => {
    const dirs = dataDirs();
    writePortalListing(dirs, BAD_PORTAL_ID, "A demo.");
    expect(() => portalListingsFromManifest(dirs)).toThrow(BAD_PORTAL_ID);
  });

  test("a valid ID on a listing links to its portal entry", async () => {
    const dirs = dataDirs();
    writePortalListing(dirs, "good-id", "A demo.");
    const [listing] = portalListingsFromManifest(dirs);
    if (!listing) throw new Error("no listing");
    expect(await renderMarkdown(listingPageMarkdown(listing))).toMatch(validLink);
  });
});

describe("isSafeLink", () => {
  test("allows http, https, mailto and relative targets", () => {
    for (const url of ["https://a.b/c", "http://a.b", "mailto:a@b.c", "/api/x", "#top", "x/y.md"]) {
      expect(isSafeLink(url)).toBe(true);
    }
  });

  test("refuses every other scheme, however it is disguised", () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:x",
      "java\tscript:x",
      " data:text/html,x",
    ]) {
      expect(isSafeLink(url)).toBe(false);
    }
  });

  test("the renderer refuses an unsafe target the escape never saw", async () => {
    const html = await renderMarkdown("[a](ftp://x/y) [b][1]\n\n[1]: tel:123");
    expect(html).not.toContain('href="ftp:');
    expect(html).not.toContain('href="tel:');
  });
});
