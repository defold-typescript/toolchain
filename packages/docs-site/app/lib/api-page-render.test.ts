import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { apiBlock, apiElement } from "@defold-typescript/docs-render/api-nodes";
import {
  type ApiPageOptions,
  type ApiRenderOptions,
  apiLinkify,
  apiPageTree,
  apiReplacementResolver,
  apiSignatureSymbolLinks,
  defoldRefLine,
  renderApiPage,
} from "@defold-typescript/docs-render/api-page-render";
import {
  type ApiPage,
  type ApiSymbol,
  type AvailabilityLookup,
  apiModuleSymbols,
  availabilityItems,
  availabilityLabels,
  bareId,
  functionAnchorText,
  groupFunctionRevisions,
  groupOverloadForms,
  overloadHeading,
  splitCallForm,
} from "@defold-typescript/docs-render/api-surface";
import {
  buildCombinedSurface,
  combinedNamespaceToApiPage,
  namespaceBadgeCounts,
} from "@defold-typescript/docs-render/combined-surface";
import {
  parseMarkdownFragment,
  processApiTree,
} from "@defold-typescript/docs-render/docs-markdown";
import {
  hastHeadings,
  hastOutlineText,
  outlineHeadings,
} from "@defold-typescript/docs-render/headings";
import { buildSymbolIndex, memberAnchors } from "@defold-typescript/docs-render/symbol-index";
import type { SymbolLinker } from "@defold-typescript/docs-render/symbol-linkify";
import { namespaceCountBadges } from "@defold-typescript/docs-render/toolchain-page";
import {
  canonicalApiPages,
  windowedApiPages,
} from "@defold-typescript/docs-render/toolchain-surface";
import {
  loadApiSurface,
  loadApiSurfaceForVersion,
  loadCombinedSurface,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import type { VersionWindow } from "@defold-typescript/docs-render/version-window";
import {
  type ApiAvailability,
  type ApiFunction,
  hashExampleSource,
  normalizedFunctionSignature,
  proseLuaFences,
  signatureTransitionNames,
  symbolIdentityKey,
} from "@defold-typescript/types";
import type { Element, Nodes as HastNodes, Root as HastRoot } from "hast";
import { toHtml } from "hast-util-to-html";
import type { Nodes as MdastNodes, Root as MdastRoot, PhrasingContent } from "mdast";
import { MIDDLE, makeWindowedTypesDir, NEWEST, OLDEST } from "./__fixtures__/windowed-surface";
import { isKnownVersionId, versionedApiParams } from "./api-badges";

// The en space (U+2002) `nameTypeLabel` puts after the `:` of a name/type label.
const NAME_TYPE_GAP = " ";

// A linker that links nothing, so a page's prose renders as written.
const noLink: SymbolLinker = (text) => [{ type: "text", value: text }];

// Text as the serializer writes it inside an element: `<` and `&` escaped.
const escaped = (text: string): string => toHtml({ type: "text", value: text });

// The type half of a name/type label: the `code.api-type` the type-link pass
// finds it by, holding the escaped type text.
function typeCode(types: string): string {
  return `<code class="api-type">${escaped(types)}</code>`;
}

// The name half of a top-level parameter or return bullet: its code span set in
// bold. Nested field bullets keep the bare code span.
function nameCode(name: string): string {
  return `<strong class="api-name"><code>${escaped(name)}</code></strong>`;
}

const FIXTURE_DIR = join(import.meta.dir, "../../../docs-render/src/__fixtures__/api-surface");
const MISSING_VERSION_FIXTURE_DIR = join(
  import.meta.dir,
  "__fixtures__/api-surface-missing-version",
);
const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// A page run through the docs pipeline, as the hast the site renders.
async function renderHast(
  page: ApiPage,
  linkify: SymbolLinker = noLink,
  options: ApiPageOptions = {},
  renderOptions: ApiRenderOptions = {},
): Promise<HastRoot> {
  return (await renderApiPage(page, linkify, options, renderOptions)).hast;
}

function hastElements(
  node: HastNodes | undefined,
  match: (element: Element) => boolean,
): Element[] {
  const found: Element[] = [];
  const walk = (current: HastNodes): void => {
    if (current.type === "element" && match(current)) found.push(current);
    if ("children" in current) for (const child of current.children) walk(child);
  };
  if (node) walk(node);
  return found;
}

function hastClasses(node: Element | undefined): string[] {
  const value = node?.properties.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/);
}

const hastByClass = (node: HastNodes | undefined, name: string): Element[] =>
  hastElements(node, (element) => hastClasses(element).includes(name));

function hastText(node: HastNodes | undefined): string {
  if (node?.type === "text") return node.value;
  return node && "children" in node ? node.children.map(hastText).join("") : "";
}

const elementChildren = (node: HastNodes | undefined): Element[] => {
  const children: HastNodes[] = node && "children" in node ? node.children : [];
  return children.filter((child): child is Element => child.type === "element");
};

// Every element with the element siblings around it.
function withSiblings(root: HastNodes): { element: Element; prev?: Element; next?: Element }[] {
  const out: { element: Element; prev?: Element; next?: Element }[] = [];
  const walk = (node: HastNodes): void => {
    const children = elementChildren(node);
    children.forEach((element, index) => {
      const entry: { element: Element; prev?: Element; next?: Element } = { element };
      const prev = children[index - 1];
      const next = children[index + 1];
      if (prev) entry.prev = prev;
      if (next) entry.next = next;
      out.push(entry);
      walk(element);
    });
  };
  walk(root);
  return out;
}

const isSignatureHeading = (element: Element | undefined): boolean =>
  element !== undefined &&
  /^h[34]$/.test(element.tagName) &&
  hastByClass(element, "api-signature").length > 0;

// A heading's text as the outline reads it: a chip reads as nothing and an
// overload count as the `...` it stands in for, so a signature heading reads
// as its bare signature.
const headingText = (heading: Element): string => hastOutlineText(heading).trim();

// The text of every `code` element in `nodes`, in document order.
const codeTexts = (nodes: readonly HastNodes[]): string[] =>
  nodes
    .flatMap((node) => hastElements(node, (element) => element.tagName === "code"))
    .map(hastText);

const isSlotLabel = (element: Element, label: string): boolean =>
  element.tagName === "p" &&
  hastClasses(element).includes("api-slot-label") &&
  hastText(element) === label;

const slotLabels = (node: HastNodes | undefined, label: "Parameters" | "Returns"): Element[] =>
  hastElements(node, (element) => isSlotLabel(element, label));

// A parameter, return or field bullet: it opens with its name.
function isSlotBullet(element: Element): boolean {
  const [first] = element.children;
  return (
    element.tagName === "li" &&
    first?.type === "element" &&
    (hastClasses(first).includes("api-name") || first.tagName === "code")
  );
}

// A bullet's own line, its nested list left out.
function bulletLine(item: Element): string {
  return toHtml(
    item.children.filter((child) => child.type !== "element" || child.tagName !== "ul"),
  ).trimEnd();
}

// The text of `nodes` in document order up to the first element `stop` matches.
function textBefore(nodes: readonly HastNodes[], stop: (element: Element) => boolean): string {
  let out = "";
  let done = false;
  const walk = (node: HastNodes): void => {
    if (done) return;
    if (node.type === "element" && stop(node)) {
      done = true;
      return;
    }
    if (node.type === "text") out += node.value;
    if ("children" in node) for (const child of node.children) walk(child);
  };
  for (const node of nodes) walk(node);
  return out;
}

// A rendered symbol: its signature heading and the body that follows it.
interface SymbolBlock {
  heading: Element;
  body: Element | undefined;
  nodes: Element[];
}

const blocksByPage = new WeakMap<HastNodes, SymbolBlock[]>();

// Every symbol block on a page. Headings and bodies are the page's own children.
function symbolBlocks(root: HastNodes): SymbolBlock[] {
  const cached = blocksByPage.get(root);
  if (cached) return cached;
  const children = elementChildren(root);
  const blocks = children.flatMap((heading, index): SymbolBlock[] => {
    if (!isSignatureHeading(heading)) return [];
    const next = children[index + 1];
    const body = next && hastClasses(next).includes("api-symbol-body") ? next : undefined;
    return [{ heading, body, nodes: body ? [heading, body] : [heading] }];
  });
  blocksByPage.set(root, blocks);
  return blocks;
}

// One symbol block: the heading that reads exactly `heading`, and its body.
function blockOf(root: HastNodes, heading: string): SymbolBlock {
  const block = symbolBlocks(root).find((candidate) => headingText(candidate.heading) === heading);
  if (!block) throw new Error(`no block headed ${heading}`);
  return block;
}

// The first symbol block whose heading opens with `prefix`.
function blockStarting(root: HastNodes, prefix: string): SymbolBlock {
  const block = symbolBlocks(root).find((candidate) =>
    headingText(candidate.heading).startsWith(prefix),
  );
  if (!block) throw new Error(`no symbol block for ${prefix}`);
  return block;
}

const blockText = (block: SymbolBlock): string => block.nodes.map(hastText).join("");
const blockHtml = (block: SymbolBlock): string => block.nodes.map((node) => toHtml(node)).join("");

// The id of the signature heading that reads exactly `text`.
function headingId(root: HastNodes, text: string): string {
  const heading = symbolBlocks(root).find((block) => headingText(block.heading) === text)?.heading;
  if (!heading) throw new Error(`no heading reads ${text}`);
  return String(heading.properties.id);
}

// The id of the outline heading that reads exactly `text` on a rendered page.
function headingIdIn(root: HastNodes, text: string): string {
  const heading = outlineHeadings(hastHeadings(root)).find((candidate) => candidate.text === text);
  if (!heading) throw new Error(`no heading reads ${text}`);
  return heading.id;
}

// One rendered availability list item, split into the chip that leads it and
// the label text after it. An item with no leading chip keeps its whole text.
interface AvailabilityLine {
  item: Element;
  attrs: string;
  kind: string | undefined;
  glyph: string | undefined;
  text: string;
}

function parseAvailabilityItem(item: Element): AvailabilityLine {
  const [first, ...rest] = item.children;
  const mark =
    first?.type === "element" && hastClasses(first).includes("api-availability-mark")
      ? first
      : undefined;
  if (!mark) return { item, attrs: "", kind: undefined, glyph: undefined, text: hastText(item) };
  return {
    item,
    attrs: toHtml({ ...mark, children: [] }),
    kind: /api-availability-mark--(\w+)/.exec(hastClasses(mark).join(" "))?.[1],
    glyph: hastText(mark),
    text: rest.map(hastText).join("").replace(/^ /, ""),
  };
}

// Every item of every availability list in `nodes`, in document order.
const availabilityLines = (nodes: readonly HastNodes[]): AvailabilityLine[] =>
  nodes
    .flatMap((node) => hastByClass(node, "api-availability"))
    .flatMap((list) => hastElements(list, (element) => element.tagName === "li"))
    .map(parseAvailabilityItem);

// The availability list item carrying `label`, found by its text.
function availabilityItem(root: HastNodes, label: string): AvailabilityLine {
  const line = availabilityLines([root]).find((l) => l.text.includes(label));
  if (!line) throw new Error(`no availability item for ${label}`);
  return line;
}

// Each availability list in `nodes`, as its items' label texts.
const lists = (nodes: readonly HastNodes[]): string[][] =>
  nodes
    .flatMap((node) => hastByClass(node, "api-availability"))
    .map((list) => availabilityLines([list]).map((line) => line.text));

// The live forms an overload block lists, in list order.
const overloadForms = (block: SymbolBlock): Element[] =>
  elementChildren(block.body)
    .filter((element) => hastClasses(element).includes("api-overloads"))
    .flatMap((list) => elementChildren(list));

// The body of an overload block before and after its form list.
function aroundForms(block: SymbolBlock): { lead: Element[]; tail: Element[]; found: boolean } {
  const children = elementChildren(block.body);
  const at = children.findIndex((element) => hastClasses(element).includes("api-overloads"));
  return at < 0
    ? { lead: children, tail: [], found: false }
    : { lead: children.slice(0, at), tail: children.slice(at + 1), found: true };
}

// The code a form line shows: its own call form, without the function name.
const formCode = (form: Element): string =>
  hastText(hastByClass(elementChildren(form)[0], "api-signature")[0]);

// The code of each form line in one overload block, in list order.
const formLineCodes = (block: SymbolBlock): string[] => overloadForms(block).map(formCode);

// A fenced example as a page renders it: a lone block, or a pair as tabs.
const isExample = (element: Element): boolean =>
  element.tagName === "pre" || element.tagName === "CodeBlockTabs";

// One function-overview card: its link, the code the link holds, and the codes
// of the forms nested under it.
interface OverviewCard {
  item: Element;
  code: Element | undefined;
  href: string;
  forms: string[];
}

function overviewCards(root: HastNodes): OverviewCard[] {
  const items = (list: Element | undefined): Element[] =>
    elementChildren(list).filter((element) => element.tagName === "li");
  return hastByClass(root, "api-overview").flatMap((overview) =>
    items(elementChildren(overview).find((element) => element.tagName === "ul")).map((item) => {
      const link = elementChildren(item).find((element) => element.tagName === "a");
      const nested = elementChildren(item).find((element) => element.tagName === "ul");
      return {
        item,
        code: hastByClass(link, "api-signature")[0],
        href: String(link?.properties.href ?? ""),
        forms: items(nested).map((form) => hastText(hastByClass(form, "api-signature")[0])),
      };
    }),
  );
}

// The overload count a signature code holds in place of its `...`.
const overloadCountText = (code: Element | undefined): string =>
  hastByClass(code, "api-overload-count").map(hastText).join("|");

// The text a Markdown fragment reads as once the API pipeline renders it inside
// a block, the way a symbol body holds its prose and examples, so a count over
// a block's text finds it.
async function fragmentText(markdown: string): Promise<string> {
  const { hast } = await processApiTree({
    type: "root",
    children: [apiBlock("div", {}, parseMarkdownFragment(markdown))],
  });
  return hastText(elementChildren(hast)[0]);
}

// A non-default surface page: its route already carries the version prefix, so
// any link derived from it must stay version-scoped.
function versionedWmathPage(): ApiPage {
  return {
    namespace: "wmath",
    route: "/api/old/wmath",
    brief: "Old math",
    module: {
      namespace: "wmath",
      brief: "Old math",
      description: "Old-version math helpers.",
      functions: [
        {
          name: "wmath.dot",
          brief: "",
          description: "Dot product.",
          parameters: [],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
  };
}

// A library page whose one function has a parameter typed as an inline object
// literal with a nested member, so the render must emit an indented field tree.
function fieldsPage(): ApiPage {
  return {
    namespace: "fld",
    route: "/api/fld",
    brief: "Fields",
    module: {
      namespace: "fld",
      brief: "Fields",
      description: "Field demo.",
      functions: [
        {
          name: "fld.follow",
          brief: "",
          description: "Follow.",
          parameters: [
            {
              name: "options",
              doc: "the options",
              types: ["{ lerp?: number; nested?: { deep?: boolean; }; }"],
              isOptional: true,
              fields: [
                { name: "lerp", doc: "Lerp factor.", types: ["number"], isOptional: true },
                {
                  name: "nested",
                  doc: "Nested config.",
                  types: ["{ deep?: boolean; }"],
                  isOptional: true,
                  fields: [
                    { name: "deep", doc: "Deep flag.", types: ["boolean"], isOptional: true },
                  ],
                },
              ],
            },
          ],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "global-type",
  };
}

// An engine page whose one function has no authored override and carries a Lua
// sample in its ref-doc description, in the upstream `codehilite` markup.
function proseSamplePage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Demo module.",
      functions: [
        {
          name: "demo.check",
          brief: "",
          description:
            'Checks support:\n<div class="codehilite"><pre><span></span><code><span class="kr">if</span> demo.supported() == nil <span class="kr">then</span>\n    demo.fallback()\n<span class="kr">end</span>\n</code></pre></div>',
          parameters: [],
          returnValues: [],
        },
      ],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
  };
}

function typedefPage(): ApiPage {
  return {
    namespace: "demo",
    route: "/api/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Type demo.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [
        {
          name: "LoggerInstance",
          functions: [
            {
              name: "info",
              brief: "",
              description: "Writes an info message.",
              parameters: [
                { name: "message", doc: "message text", types: ["string"], isOptional: false },
              ],
              returnValues: [],
            },
          ],
          properties: [
            { name: "level", brief: "", description: "Current log level.", types: ["number"] },
          ],
        },
      ],
    },
    translations: {},
    signatures: {},
    category: "global-type",
  };
}

// Where each heading of a rendered page sits in its outline, by level and text.
function headingIndex(root: HastRoot): (level: number, text: string) => number {
  const headings = hastHeadings(root);
  return (level, text) =>
    headings.findIndex((heading) => heading.level === level && heading.text === text);
}

describe("versionedApiParams", () => {
  test("yields one {version, namespace} per page of every materialized version's window", () => {
    // A version's family is the window ending at it, not its own surface, so
    // `old` — which sorts newest on this fixture's axis — spans both versions.
    // `alpha` and `wmath` carry no symbols at all, and window membership is by
    // symbol, so neither is routed under any version.
    expect(versionedApiParams(FIXTURE_DIR)).toEqual([
      { version: "cur", namespace: "camera" },
      { version: "cur", namespace: "globals" },
      { version: "old", namespace: "camera" },
      { version: "old", namespace: "globals" },
    ]);
  });

  test("an unmaterialized non-default version contributes nothing; the default still materializes", () => {
    expect(versionedApiParams(MISSING_VERSION_FIXTURE_DIR)).toEqual([
      { version: "cur", namespace: "camera" },
    ]);
  });
});

describe("renderApiPage", () => {
  test("renders the camera fixture page unchanged by the lift (snapshot)", async () => {
    const pages = loadApiSurface(FIXTURE_DIR);
    const camera = pages.find((p) => p.namespace === "camera");
    expect(camera).toBeDefined();
    if (!camera) return;
    expect(toHtml(await renderHast(camera, apiLinkify(pages)))).toMatchSnapshot();
  });

  test("renders the authored io.open signature from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const io = pages.find((p) => p.namespace === "io");
    expect(io).toBeDefined();
    if (!io) return;
    const thin = apiModuleSymbols(io, io.translations).find((s) => s.name === "io.open")?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(io, apiLinkify(pages));
    expect(hastText(root)).toContain(
      "io.open(filename: string, mode?: string): LuaFile | undefined",
    );
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders the authored string.byte overload from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const str = pages.find((p) => p.namespace === "string");
    expect(str).toBeDefined();
    if (!str) return;
    const thin = apiModuleSymbols(str, str.translations).find(
      (s) => s.name === "string.byte",
    )?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(str, apiLinkify(pages));
    const byte = blockOf(root, overloadHeading(groupFor(str, "string.byte")));
    expect(codeTexts(byte.nodes).some((code) => code.startsWith("(s: string, i?: number)"))).toBe(
      true,
    );
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders the authored os.date overload from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const os = pages.find((p) => p.namespace === "os");
    expect(os).toBeDefined();
    if (!os) return;
    const thin = apiModuleSymbols(os, os.translations).find((s) => s.name === "os.date")?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(os, apiLinkify(pages));
    const date = codeTexts(blockOf(root, overloadHeading(groupFor(os, "os.date"))).nodes);
    expect(date.some((code) => code.startsWith("(format?: string, time?: number)"))).toBe(true);
    expect(date.some((code) => code.startsWith('(format: "*t", time?: number)'))).toBe(true);
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders a function description's prose Lua sample as its pinned TypeScript", async () => {
    const page = proseSamplePage();
    const [fence] = proseLuaFences(page.module).filter((f) => f.key === "demo.check");
    expect(fence?.lua).toContain("demo.supported() == nil");
    if (!fence) return;
    const ts = "if (demo.supported() === undefined) {\n  demo.fallback();\n}";
    page.translations = { "demo.check": [{ sourceHash: hashExampleSource(fence.lua), ts }] };
    const root = await renderHast(page, apiLinkify([page]));
    const block = blockOf(root, groupFor(page, "demo.check")[0]?.signature ?? "");
    // The translation leads and the original Lua is its paired tab.
    const tabs = block.nodes.flatMap((node) =>
      hastElements(node, (element) => element.tagName === "CodeBlockTabs"),
    );
    expect(tabs).toHaveLength(1);
    const triggers = hastElements(tabs[0], (element) => element.tagName === "CodeBlockTabsTrigger");
    expect(triggers.map(hastText)).toEqual(["TypeScript", "Lua"]);
    expect(codeTexts(tabs)).toEqual([ts, fence.lua]);
    // No Lua block stands on its own outside the pair.
    const blocks = block.nodes.flatMap((node) =>
      hastElements(node, (element) => element.tagName === "pre"),
    );
    expect(blocks).toEqual(hastElements(tabs[0], (element) => element.tagName === "pre"));
  });

  test("renders the authored math.random signature from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const math = pages.find((p) => p.namespace === "math");
    expect(math).toBeDefined();
    if (!math) return;
    const thin = apiModuleSymbols(math, math.translations).find(
      (s) => s.name === "math.random",
    )?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(math, apiLinkify(pages));
    expect(hastText(root)).toContain("math.random(m?: number, n?: number): number");
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders the authored bit.tohex signature from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const bit = pages.find((p) => p.namespace === "bit");
    expect(bit).toBeDefined();
    if (!bit) return;
    const thin = apiModuleSymbols(bit, bit.translations).find(
      (s) => s.name === "bit.tohex",
    )?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(bit, apiLinkify(pages));
    expect(hastText(root)).toContain("bit.tohex(x: number, n?: number): string");
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders the authored bare base.select signature from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const base = pages.find((p) => p.namespace === "base");
    expect(base).toBeDefined();
    if (!base) return;
    const thin = apiModuleSymbols(base, base.translations).find(
      (s) => s.name === "select",
    )?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(base, apiLinkify(pages));
    const select = codeTexts(blockOf(root, overloadHeading(groupFor(base, "select"))).nodes);
    expect(select.some((code) => code.startsWith("<T>(index: number, ...args: T[])"))).toBe(true);
    expect(select.some((code) => code.startsWith('<T>(index: "#", ...args: T[])'))).toBe(true);
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("renders the authored socket client:receive receiver signature from the store, not the thin ref-doc one", async () => {
    const pages = loadApiSurface(REAL_TYPES_DIR);
    const socket = pages.find((p) => p.namespace === "socket");
    expect(socket).toBeDefined();
    if (!socket) return;
    const thin = apiModuleSymbols(socket, socket.translations).find(
      (s) => s.name === "client:receive",
    )?.signature;
    expect(thin).toBeDefined();
    const root = await renderHast(socket, apiLinkify(pages));
    expect(hastText(root)).toContain(
      "client:receive(pattern?: string | number, prefix?: string): LuaMultiReturn<[string | undefined, string | undefined, string | undefined]>",
    );
    expect(codeTexts([root])).not.toContain(thin);
  });

  test("nests a member-bearing typedef's heading in Types, over its member rows", async () => {
    const root = await renderHast(typedefPage());
    const at = headingIndex(root);
    const typesAt = at(2, "Types");
    const shapeAt = at(3, "LoggerInstance");
    expect(typesAt).toBeGreaterThan(-1);
    expect(shapeAt).toBeGreaterThan(typesAt);
    expect(at(2, "LoggerInstance")).toBe(-1);
    expect(at(4, "LoggerInstance.info(message: string)")).toBeGreaterThan(shapeAt);
    expect(at(4, "LoggerInstance.level: number")).toBeGreaterThan(shapeAt);
    expect(hastText(root)).toContain("Writes an info message.");
    expect(hastElements(root, isSlotBullet).map(bulletLine)).toContain(
      `${nameCode("message")}:${NAME_TYPE_GAP}${typeCode("string")} — message text`,
    );
    expect(
      hastHeadings(root).some((h) => h.level >= 3 && h.text === "LoggerInstance.level: number"),
    ).toBe(true);
    expect(hastText(root)).toContain("Current log level.");
  });

  test("gives each shape on a page its own heading, in surface order", async () => {
    const page = typedefPage();
    page.module.typedefs = [
      ...(page.module.typedefs ?? []),
      {
        name: "LoggerConfig",
        properties: [{ name: "level", brief: "", description: "Threshold.", types: ["number"] }],
      },
    ];
    const at = headingIndex(await renderHast(page));
    expect(at(3, "LoggerInstance")).toBeGreaterThan(-1);
    expect(at(3, "LoggerConfig")).toBeGreaterThan(at(3, "LoggerInstance"));
    expect(at(4, "LoggerConfig.level: number")).toBeGreaterThan(-1);
  });

  test("lists member-less types under one Types heading", async () => {
    const page = typedefPage();
    page.module.typedefs = [
      { name: "LogLevel", types: ["string", "number"] },
      { name: "LogSink", types: ["function", "string"] },
    ];
    const headings = hastHeadings(await renderHast(page));
    expect(headings.filter((h) => h.level === 2 && h.text === "Types")).toHaveLength(1);
    const typesAt = headings.findIndex((h) => h.level === 2 && h.text === "Types");
    const rowsAt = ["LogLevel", "LogSink"].map((name) =>
      headings.findIndex((h) => h.level === 3 && h.text.startsWith(`type ${name} =`)),
    );
    for (const at of rowsAt) expect(at).toBeGreaterThan(typesAt);
    expect(headings.some((h) => h.level === 2 && h.text === "LogLevel")).toBe(false);
    expect(headings.some((h) => h.level === 2 && h.text === "LogSink")).toBe(false);
  });

  test("keeps a member-bearing shape's heading after the Types list", async () => {
    const page = typedefPage();
    page.module.typedefs = [
      ...(page.module.typedefs ?? []),
      { name: "LogLevel", types: ["string", "number"] },
    ];
    const headings = hastHeadings(await renderHast(page));
    const typesAt = headings.findIndex((h) => h.level === 2 && h.text === "Types");
    const rowAt = headings.findIndex((h) => h.level === 3 && h.text.startsWith("type LogLevel ="));
    const shapeAt = headings.findIndex((h) => h.level === 3 && h.text === "LoggerInstance");
    const memberAt = headings.findIndex(
      (h) => h.level === 4 && h.text.startsWith("LoggerInstance.info("),
    );
    expect(typesAt).toBeGreaterThan(-1);
    expect(rowAt).toBeGreaterThan(typesAt);
    expect(shapeAt).toBeGreaterThan(rowAt);
    expect(memberAt).toBeGreaterThan(shapeAt);
  });

  test("qualifies an engine page's shape heading and keeps a library page's bare", async () => {
    const engine = typedefPage();
    engine.category = "engine";
    const [logger] = engine.module.typedefs ?? [];
    if (logger) logger.name = "Logger";
    const engineAt = headingIndex(await renderHast(engine));
    expect(engineAt(3, "demo.Logger")).toBeGreaterThan(-1);
    expect(engineAt(3, "Logger")).toBe(-1);
    expect(headingIndex(await renderHast(typedefPage()))(3, "LoggerInstance")).toBeGreaterThan(-1);
  });
});

describe("renderApiPage field tree", () => {
  // The en space (U+2002) is the wider gap `nameTypeLabel` puts after the `:`.
  const G = NAME_TYPE_GAP;
  // Each bullet of a slot list with its nesting depth.
  const bulletTree = (list: Element | undefined, depth = 0): { depth: number; line: string }[] =>
    elementChildren(list).flatMap((item) => [
      { depth, line: bulletLine(item) },
      ...elementChildren(item)
        .filter((element) => element.tagName === "ul")
        .flatMap((nested) => bulletTree(nested, depth + 1)),
    ]);

  test("renders a parameter's fields as an indented nested list, one indent per depth", async () => {
    const block = blockOf(
      await renderHast(fieldsPage()),
      "fld.follow(options?: { lerp?: number; nested?: { deep?: boolean; }; })",
    );
    const children = elementChildren(block.body);
    const label = children.findIndex((element) => isSlotLabel(element, "Parameters"));
    const tree = bulletTree(children[label + 1]);
    expect(tree).toContainEqual({
      depth: 0,
      line: `${nameCode("options")}?:${G}${typeCode("{ lerp?: number; nested?: { deep?: boolean; }; }")} — the options`,
    });
    expect(tree).toContainEqual({
      depth: 1,
      line: `<code>lerp</code>?:${G}${typeCode("number")} — Lerp factor.`,
    });
    expect(tree).toContainEqual({
      depth: 1,
      line: `<code>nested</code>?:${G}${typeCode("{ deep?: boolean; }")} — Nested config.`,
    });
    expect(tree).toContainEqual({
      depth: 2,
      line: `<code>deep</code>?:${G}${typeCode("boolean")} — Deep flag.`,
    });
  });

  test("a parameter without fields renders no sub-list", async () => {
    const root = await renderHast(versionedWmathPage());
    const nested = hastElements(root, (element) => element.tagName === "li").flatMap((item) =>
      elementChildren(item)
        .filter((element) => element.tagName === "ul")
        .flatMap((list) => elementChildren(list)),
    );
    expect(nested.filter((item) => elementChildren(item)[0]?.tagName === "code")).toEqual([]);
  });

  test("linkify recurses into nested field docs", async () => {
    const seen: string[] = [];
    await renderApiPage(fieldsPage(), (t) => {
      seen.push(t);
      return [{ type: "text", value: t }];
    });
    expect(seen).toContain("Lerp factor.");
    expect(seen).toContain("Deep flag.");
  });
});

describe("renderApiPage heading", () => {
  test("a page renders `# <namespace>` unchanged", async () => {
    const [first] = elementChildren(await renderHast(versionedWmathPage()));
    expect(first?.tagName).toBe("h1");
    expect(hastText(first).startsWith("wmath")).toBe(true);
  });
});

describe("apiLinkify", () => {
  const hrefs = (nodes: PhrasingContent[]): string[] =>
    nodes.flatMap((node) => (node.type === "link" ? [node.url] : []));

  test("links a bare member mention to the page's version-scoped route", () => {
    const linkify = apiLinkify([versionedWmathPage()]);
    const out = hrefs(linkify("see wmath.dot for the product"));
    expect(out.some((href) => href.startsWith("/api/old/wmath#"))).toBe(true);
    expect(out.some((href) => href.startsWith("/api/wmath"))).toBe(false);
  });

  test("leaves text untouched when the surface has no linkable members", () => {
    const linkify = apiLinkify([]);
    expect(linkify("plain wmath.dot text")).toEqual([
      { type: "text", value: "plain wmath.dot text" },
    ]);
  });

  test("links members of an exact-version surface to that version's prefixed route", () => {
    const linkify = apiLinkify(loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4"));
    const out = hrefs(linkify("call go.get_position each frame"));
    expect(out.some((href) => href.startsWith("/api/defold-1.12.4/go#"))).toBe(true);
    expect(out.some((href) => href.startsWith("/api/go#"))).toBe(false);
  });
});

describe("isKnownVersionId", () => {
  const versions = [
    { id: "cur", isDefault: true },
    { id: "old", isDefault: false },
  ];

  test("is true for a non-default version id", () => {
    expect(isKnownVersionId("old", versions)).toBe(true);
  });

  test("is false for a real namespace param", () => {
    expect(isKnownVersionId("camera", versions)).toBe(false);
  });

  test("is true for the default version id (it now owns an explicit /api/<default> index)", () => {
    expect(isKnownVersionId("cur", versions)).toBe(true);
  });
});

describe("availability badges", () => {
  const setTexture: ApiFunction = {
    name: "model.set_texture",
    brief: "",
    description: "New texture accessor.",
    parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
    returnValues: [],
  };

  const VERSIONS = ["1.13.0", "1.12.4"];

  function lookup(records: ApiAvailability[]): AvailabilityLookup {
    return {
      versions: VERSIONS,
      records: new Map(records.map((r) => [symbolIdentityKey(r.identity), r])),
      transitions: signatureTransitionNames(records, VERSIONS),
    };
  }

  function modelPage(
    fn: ApiFunction,
    record: Omit<ApiAvailability, "identity">,
    route = "/api/model",
    siblings: ApiAvailability[] = [],
  ): ApiPage {
    const identity = {
      namespace: "model",
      kind: "FUNCTION",
      name: fn.name,
      signature: normalizedFunctionSignature(fn),
    };
    return {
      namespace: "model",
      route,
      brief: "",
      module: {
        namespace: "model",
        brief: "",
        description: "Model component.",
        functions: [fn],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      availability: lookup([{ identity, ...record }, ...siblings]),
    };
  }

  const material: ApiFunction = {
    name: "model.material",
    brief: "",
    description: "Old material accessor.",
    parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
    returnValues: [],
  };
  const replacement = {
    namespace: "model",
    kind: "FUNCTION",
    name: "model.set_texture",
    signature: normalizedFunctionSignature(setTexture),
  };

  test("renders a since-newest span badge with accessible text", async () => {
    const root = await renderHast(modelPage(setTexture, { availableIn: ["1.13.0"] }));
    expect(hastText(root)).toContain("Since Defold 1.13.0");
    expect(toHtml(root)).toContain('aria-label="Availability"');
  });

  // Slice one symbol's rendered block out of the page so a position comparison
  // cannot be satisfied by another symbol's markup.
  const blockOf = (root: HastRoot, headingPrefix: string): SymbolBlock =>
    blockStarting(root, headingPrefix);
  // Where in a symbol body the availability note and the description sit.
  const bodyOrder = (block: SymbolBlock, description: string) => {
    const children = elementChildren(block.body);
    return {
      note: children.findIndex((element) => hastClasses(element).includes("api-availability")),
      description: children.findIndex((element) => hastText(element).includes(description)),
    };
  };

  test("opens a symbol body with the availability note, ahead of its description", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
    );
    const { note, description } = bodyOrder(
      blockOf(root, "model.material"),
      "Old material accessor.",
    );
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("a symbol carrying no note still opens its body with the description", async () => {
    const root = await renderHast(modelPage(material, { availableIn: VERSIONS }));
    const block = blockOf(root, "model.material");
    expect(hastByClass(block.body, "api-availability")).toEqual([]);
    const [first] = elementChildren(block.body);
    expect(first?.tagName).toBe("p");
    expect(hastText(block.body).startsWith("Old material accessor.")).toBe(true);
  });

  // The newer arm of the same logical name, differing only by an added optional
  // parameter, so `signatureTransitionNames` groups the two overloads and the
  // old arm's note must say the signature changed, not that the name is gone.
  const materialWithOptions: ApiFunction = {
    ...material,
    parameters: [
      ...material.parameters,
      { name: "options", doc: "", types: ["table"], isOptional: true },
    ],
  };
  const newMaterialArm: ApiAvailability = {
    identity: {
      namespace: "model",
      kind: "FUNCTION",
      name: "model.material",
      signature: normalizedFunctionSignature(materialWithOptions),
    },
    availableIn: ["1.13.0"],
  };

  test("renders the old arm of a signature transition as changed, not removed", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"] }, "/api/model", [newMaterialArm]),
    );
    expect(hastText(root)).toContain("Signature changed in Defold 1.13.0");
    expect(hastText(root)).not.toContain("Removed in Defold");
    const { note, description } = bodyOrder(
      blockOf(root, "model.material"),
      "Old material accessor.",
    );
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("renders deprecated-since and removed-in span badges", async () => {
    const text = hastText(
      await renderHast(modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" })),
    );
    expect(text).toContain("Deprecated since 1.12.0");
    expect(text).toContain("Removed in Defold 1.13.0");
  });

  // The version-keyed engine wording stays authoritative: a symbol carrying both
  // facts renders one deprecation line, not two.
  test("an availability-deprecated symbol keeps the version-keyed line and gains no second one", async () => {
    const html = toHtml(
      await renderHast(
        modelPage(
          { ...material, deprecated: "Use `model.set_texture`." },
          {
            availableIn: ["1.12.4"],
            deprecatedSince: "1.12.0",
          },
        ),
      ),
    );
    expect(html).toContain("Deprecated since 1.12.0");
    expect(html).not.toContain("Deprecated —");
    expect(html.match(/Deprecated/g)).toHaveLength(1);
  });

  test("renders Box2D backend applicability with no span badge for an all-versions symbol", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: VERSIONS, box2d: ["v2", "v3"] }),
    );
    expect(hastText(root)).toContain("Box2D: v2, v3");
  });

  test("links a replacement that resolves within the surface", async () => {
    const html = toHtml(
      await renderHast(modelPage(material, { availableIn: ["1.12.4"], replacement }), noLink, {
        resolveReplacement: (id) =>
          id.name === "model.set_texture" ? "/api/model#model-set-texture" : undefined,
      }),
    );
    expect(html).toContain('<a href="/api/model#model-set-texture">model.set_texture</a>');
  });

  test("falls back to the default surface API index when a replacement is unresolved", async () => {
    const html = toHtml(
      await renderHast(modelPage(material, { availableIn: VERSIONS, replacement }), noLink, {
        resolveReplacement: () => undefined,
      }),
    );
    expect(html).toContain('<a href="/api">model.set_texture</a>');
  });

  test("an unresolved replacement on a versioned page never crosses versions", async () => {
    const html = toHtml(
      await renderHast(
        modelPage(material, { availableIn: ["1.12.4"], replacement }, "/api/1.12.4/model"),
        noLink,
        { resolveReplacement: () => undefined },
      ),
    );
    expect(html).toContain('<a href="/api/1.12.4">model.set_texture</a>');
    expect(html).not.toContain('href="/api/model');
  });

  test("a symbol with no availability record renders no badge block", async () => {
    const page = modelPage(material, { availableIn: VERSIONS });
    page.availability = { versions: VERSIONS, records: new Map(), transitions: new Set() };
    expect(toHtml(await renderHast(page))).not.toContain('aria-label="Availability"');
  });

  test("leads a since span's item with the New chip", async () => {
    const root = await renderHast(modelPage(setTexture, { availableIn: ["1.13.0"] }));
    const item = availabilityItem(root, "Since Defold 1.13.0");
    expect({ kind: item.kind, glyph: item.glyph, text: item.text }).toEqual({
      kind: "new",
      glyph: "N",
      text: "Since Defold 1.13.0",
    });
  });

  test("leads a removal and a signature change with the Changed chip", async () => {
    const removed = await renderHast(modelPage(material, { availableIn: ["1.12.4"] }));
    const transition = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"] }, "/api/model", [newMaterialArm]),
    );
    for (const item of [
      availabilityItem(removed, "Removed in Defold 1.13.0"),
      availabilityItem(transition, "Signature changed in Defold 1.13.0"),
    ]) {
      expect({ kind: item.kind, glyph: item.glyph }).toEqual({ kind: "changed", glyph: "C" });
    }
  });

  test("leads a deprecated-since line with the Deprecated chip", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
    );
    const item = availabilityItem(root, "Deprecated since 1.12.0");
    expect({ kind: item.kind, glyph: item.glyph }).toEqual({ kind: "deprecated", glyph: "D" });
  });

  test("leads Replaced by and Box2D items with an empty neutral chip", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: VERSIONS, box2d: ["v2", "v3"], replacement }),
      noLink,
      { resolveReplacement: () => undefined },
    );
    for (const label of ["Replaced by", "Box2D: v2, v3"]) {
      const item = availabilityItem(root, label);
      expect({ label, kind: item.kind, glyph: item.glyph }).toEqual({
        label,
        kind: "none",
        glyph: "",
      });
    }
  });

  test("every chip is decorative and never carries the heading-dot class", async () => {
    const root = await renderHast(
      modelPage(material, {
        availableIn: ["1.12.4"],
        deprecatedSince: "1.12.0",
        box2d: ["v2"],
        replacement,
      }),
      noLink,
      { resolveReplacement: () => undefined },
    );
    const [block] = hastByClass(root, "api-availability");
    const items = availabilityLines([block ?? root]);
    expect(items.map((i) => i.kind)).toEqual(["changed", "deprecated", "none", "none"]);
    for (const item of items) {
      expect(item.attrs).toContain('aria-hidden="true"');
      expect(item.attrs).not.toContain("api-badge-dot");
    }
  });

  // Both arms of `model.material` on one page, so they render as one overload
  // block; each arm's span is the only thing the two cases vary.
  function overloadPage(
    oldSpan: string[],
    newSpan: string[],
    oldFacts: Partial<ApiAvailability> = {},
  ): ApiPage {
    const page = modelPage(material, { ...oldFacts, availableIn: oldSpan }, "/api/model", [
      { ...newMaterialArm, availableIn: newSpan },
    ]);
    page.module.functions.push(materialWithOptions);
    return page;
  }

  test("a note every overload form shares sits once above the forms", async () => {
    const block = blockOf(await renderHast(overloadPage(["1.13.0"], ["1.13.0"])), "model.material");
    const children = elementChildren(block.body);
    const note = children.findIndex((element) => hastClasses(element).includes("api-availability"));
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(
      children.findIndex((element) => hastClasses(element).includes("api-overloads")),
    );
    expect(block.nodes.flatMap((node) => hastByClass(node, "api-availability"))).toHaveLength(1);
  });

  test("a note one form carries alone sits right under that form's signature", async () => {
    const block = blockOf(
      await renderHast(
        overloadPage(["1.13.0", "1.12.4"], ["1.13.0"], { deprecatedSince: "1.13.0" }),
      ),
      "model.material",
    );
    // Only the block's overload summary may precede the forms; no form's own
    // note is hoisted ahead of them.
    const leadItems = availabilityLines(aroundForms(block).lead).map((line) => line.text);
    expect(leadItems.length).toBeGreaterThan(0);
    for (const item of leadItems)
      expect(item).toMatch(/^\d+ overloads? (?:added|removed) in Defold /);
    const forms = overloadForms(block);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      const [line, note] = elementChildren(form);
      expect(line?.tagName).toBe("p");
      expect(hastClasses(elementChildren(line)[0])).toContain("api-signature");
      expect(hastClasses(note)).toContain("api-availability");
    }
  });

  const headingLineOf = (root: HastRoot, prefix: string): string | undefined => {
    const heading = symbolBlocks(root).find(
      (block) => block.heading.tagName === "h3" && headingText(block.heading).startsWith(prefix),
    )?.heading;
    return heading ? toHtml(heading) : undefined;
  };

  test("marks a since symbol with a New glyph chip on its signature heading (Combined only)", async () => {
    const root = await renderHast(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink, {
      combinedMarkers: true,
    });
    const heading = headingLineOf(root, "model.set_texture");
    expect(heading).toContain(
      '<span class="api-badge-dot api-badge-dot--new" aria-label="New" title="New">N</span>',
    );
  });

  test("marks a deprecated symbol with a Deprecated glyph chip and no other marker", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: VERSIONS, deprecatedSince: "1.12.0" }),
      noLink,
      { combinedMarkers: true },
    );
    const heading = headingLineOf(root, "model.material");
    expect(heading).toContain(
      'api-badge-dot--deprecated" aria-label="Deprecated" title="Deprecated">D</span>',
    );
    expect(heading).not.toContain("api-badge-dot--new");
    expect(heading).not.toContain("api-badge-dot--changed");
  });

  test("a universal symbol carrying no lifecycle fact emits no marker", async () => {
    const root = await renderHast(modelPage(material, { availableIn: VERSIONS }), noLink, {
      combinedMarkers: true,
    });
    expect(toHtml(root)).not.toContain("api-badge-dot");
  });

  test("two co-occurring categories emit two glyph chips, changed before deprecated", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
      noLink,
      { combinedMarkers: true },
    );
    const heading = headingLineOf(root, "model.material");
    expect(heading).toBeDefined();
    if (!heading) return;
    expect(heading).toContain("api-badge-dot--changed");
    expect(heading).toContain("api-badge-dot--deprecated");
    expect(heading).not.toContain("api-badge-dot--new");
    expect(heading.indexOf("--changed")).toBeLessThan(heading.indexOf("--deprecated"));
  });

  test("an exact-version page (no combinedMarkers) keeps availability prose but emits no markers", async () => {
    const root = await renderHast(
      modelPage(material, { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" }),
    );
    expect(toHtml(root)).toContain('aria-label="Availability"');
    expect(hastText(root)).toContain("Deprecated since 1.12.0");
    expect(toHtml(root)).not.toContain("api-badge-dot");
  });

  test("Combined: a newest-only symbol deprecated as of the newest version renders Deprecated, not New", async () => {
    const resetConstant: ApiFunction = {
      name: "model.reset_constant",
      brief: "",
      description: "Reset a shader constant.",
      parameters: [{ name: "url", doc: "", types: ["url"], isOptional: false }],
      returnValues: [],
    };
    const identity = {
      namespace: "model",
      kind: "FUNCTION",
      name: resetConstant.name,
      signature: normalizedFunctionSignature(resetConstant),
    };
    const emptyModel = {
      namespace: "model",
      brief: "",
      description: "Model.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    };
    const combined = buildCombinedSurface({
      surfaces: [
        { version: "1.13.0", modules: [{ ...emptyModel, functions: [resetConstant] }] },
        { version: "1.12.4", modules: [emptyModel] },
      ],
      signatures: {
        versions: {
          "1.13.0": { [symbolIdentityKey(identity)]: "function reset_constant(url: url): void;" },
        },
      },
      overlay: {
        versions: ["1.13.0", "1.12.4"],
        records: new Map([
          [
            symbolIdentityKey(identity),
            { identity, availableIn: ["1.13.0"], deprecatedSince: "1.13.0" },
          ],
        ]),
        transitions: new Set(),
      },
    });
    const ns = combined.namespaces.find((n) => n.namespace === "model");
    if (!ns) throw new Error("model namespace missing from combined surface");
    const root = await renderHast(combinedNamespaceToApiPage(ns), noLink, {
      combinedMarkers: true,
    });
    const heading = headingLineOf(root, "model.reset_constant");
    expect(heading).toBeDefined();
    expect(heading).toContain("api-badge-dot--deprecated");
    expect(heading).not.toContain("api-badge-dot--new");
    expect(hastText(root)).toContain("Deprecated since 1.13.0");
    expect(hastText(root)).not.toContain("Since Defold");
  });

  const overviewRegion = (root: HastRoot): string =>
    hastByClass(root, "api-overview")
      .map((overview) => toHtml(overview))
      .join("");

  test("a Combined page appends the category dot after the function-overview signature link", async () => {
    const root = await renderHast(modelPage(setTexture, { availableIn: ["1.13.0"] }), noLink, {
      combinedMarkers: true,
    });
    const overview = overviewRegion(root);
    expect(overview).toContain('api-badge-dot api-badge-dot--new" aria-label="New"');
    // The dot follows the signature link, not before it, inside the same item.
    expect(overview.indexOf('<a href="#')).toBeLessThan(overview.indexOf("api-badge-dot"));
  });

  test("the same page without combinedMarkers renders the overview list with no dots", async () => {
    const root = await renderHast(modelPage(setTexture, { availableIn: ["1.13.0"] }));
    expect(overviewRegion(root)).not.toContain("api-badge-dot");
  });
});

describe("renderApiPage authoritative member signatures", () => {
  const CONST_SIG =
    'b2d.body.B2_DYNAMIC_BODY: number & { readonly __brand: "b2d.body.B2_DYNAMIC_BODY" }';
  const constKey = symbolIdentityKey({
    namespace: "b2d.body",
    kind: "CONSTANT",
    name: "b2d.body.B2_DYNAMIC_BODY",
    signature: "",
  });

  function combinedConstPage(): ApiPage {
    return {
      namespace: "b2d.body",
      route: "/api/combined/b2d.body",
      brief: "",
      module: {
        namespace: "b2d.body",
        brief: "",
        description: "Box2D body.",
        functions: [],
        variables: [],
        constants: [
          { name: "b2d.body.B2_DYNAMIC_BODY", brief: "", description: "A dynamic body." },
        ],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      authoritativeSignatures: new Map([[constKey, CONST_SIG]]),
    };
  }

  test("a Combined constant heading and its symbol-index anchor slugify the authoritative identity-name form and agree", async () => {
    const page = combinedConstPage();
    const root = await renderHast(page, noLink, { combinedMarkers: true });
    const id = headingId(root, CONST_SIG);
    const index = buildSymbolIndex([page]);
    expect(index["b2d.body.B2_DYNAMIC_BODY"]?.route).toBe(`/api/combined/b2d.body#${id}`);
  });

  test("an exact-version member page (no authoritative map) renders the token signature byte-for-byte", async () => {
    const withMap = combinedConstPage();
    const page: ApiPage = {
      namespace: withMap.namespace,
      route: "/api/1.12.4/b2d.body",
      brief: withMap.brief,
      module: withMap.module,
      translations: {},
      signatures: {},
      category: "engine",
    };
    const root = await renderHast(page);
    expect(symbolBlocks(root).map((block) => headingText(block.heading))).toContain(
      "b2d.body.B2_DYNAMIC_BODY",
    );
    expect(hastText(root)).not.toContain(CONST_SIG);
  });

  test("on the committed surface a Combined json.null variable heading never emits the _null alias", async () => {
    const json = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find((n) => n.namespace === "json");
    if (!json) throw new Error("json namespace missing from combined surface");
    const root = await renderHast(combinedNamespaceToApiPage(json), noLink, {
      combinedMarkers: true,
    });
    expect(symbolBlocks(root).map((block) => headingText(block.heading))).toContain(
      "json.null: unknown",
    );
    // The `_null` emitter alias must not reach the rendered member form.
    expect(hastText(root)).not.toContain("_null: unknown");
  });
});

describe("renderApiPage title badges", () => {
  const h1Of = (root: HastRoot): Element | undefined =>
    elementChildren(root).find((element) => element.tagName === "h1");

  test("appends titleBadges inline on the H1 line, not as a standalone block after it", async () => {
    const root = await renderHast(versionedWmathPage(), noLink, {
      titleBadges: apiElement("span", { className: ["api-badge-counts"] }, [
        { type: "text", value: "PILLS" },
      ]),
    });
    const h1 = h1Of(root);
    // the pill rides the H1 line so it renders on the heading baseline, not below
    expect(h1 ? toHtml(h1) : "").toBe(
      '<h1 id="wmath">wmath<span class="api-badge-counts">PILLS</span></h1>',
    );
    // never emitted as its own block line after the heading
    expect(hastByClass(root, "api-badge-counts")).toEqual(hastByClass(h1, "api-badge-counts"));
    // still ahead of the intro prose
    const html = toHtml(root);
    expect(html.indexOf("PILLS")).toBeLessThan(html.indexOf("Old-version math helpers."));
  });

  test("omitting titleBadges leaves the heading unchanged", async () => {
    const root = await renderHast(versionedWmathPage());
    expect(toHtml(root)).not.toContain("api-badge-counts");
    expect(elementChildren(root)[0]).toBe(h1Of(root));
    const h1 = h1Of(root);
    expect(h1 ? toHtml(h1) : "").toBe('<h1 id="wmath">wmath</h1>');
  });
});

describe("namespaceCountBadges visible text", () => {
  // The pills as a page renders them on its title.
  const pills = async (counts: Parameters<typeof namespaceCountBadges>[0]): Promise<string> => {
    const root = await renderHast(versionedWmathPage(), noLink, {
      titleBadges: namespaceCountBadges(counts),
    });
    return hastByClass(root, "api-badge-counts")
      .map((element) => toHtml(element))
      .join("");
  };

  test("each pill shows its tally and category noun as visible text", async () => {
    const html = await pills({ new: 12, changed: 3, deprecated: 1 });
    expect(html).toContain(">12 new</span>");
    expect(html).toContain(">3 changed</span>");
    expect(html).toContain(">1 deprecated</span>");
  });

  test("a zero category is omitted; an all-zero namespace shows nothing", async () => {
    expect(await pills({ new: 2, changed: 0, deprecated: 0 })).not.toContain("changed");
    expect(namespaceCountBadges({ new: 0, changed: 0, deprecated: 0 })).toBeUndefined();
    expect(await pills({ new: 0, changed: 0, deprecated: 0 })).toBe("");
  });

  test("wraps the pills in an inline span so they can ride a heading baseline", async () => {
    const html = await pills({ new: 3, changed: 0, deprecated: 0 });
    expect(html).toContain('<span class="api-badge-counts"');
    expect(html).not.toContain("<div");
  });
});

describe("windowed page dots follow the selected range", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const axis = surface.versions;
  const full: VersionWindow = {
    from: axis[axis.length - 1] as string,
    to: axis[0] as string,
  };
  const nsOf = (namespace: string) => {
    const found = surface.namespaces.find((n) => n.namespace === namespace);
    if (!found) throw new Error(`namespace ${namespace} missing from combined surface`);
    return found;
  };
  // Only the symbol headings are tallied: the function-overview cards repeat the
  // same markers, so counting the whole page would double every function. And
  // only the *visible* dots count — the server emits every category any window
  // reaches and hides the inactive ones, so a hidden span is markup the reader
  // never sees.
  const headingDots = (root: HastRoot, kind: string): number =>
    symbolBlocks(root).reduce(
      (total, { heading }) =>
        total +
        hastByClass(heading, `api-badge-dot--${kind}`).filter(
          (dot) => !String(dot.properties.style ?? "").includes("display:none"),
        ).length,
      0,
    );
  // The same tally over a page's tree, which a test rendering one page per
  // window reads without running each through the pipeline.
  const treeHeadingDots = (tree: MdastRoot, kind: string): number =>
    tree.children.reduce((total, node) => {
      if (node.type !== "heading" || node.depth < 3 || node.children[0]?.type !== "inlineCode") {
        return total;
      }
      return (
        total +
        node.children.filter((child) => {
          if (child.type !== "apiChip") return false;
          const { className, style } = child.data.hProperties;
          return (
            Array.isArray(className) &&
            className.includes(`api-badge-dot--${kind}`) &&
            style !== "display:none"
          );
        }).length
      );
    }, 0);
  const fullRange = new Map<string, Promise<HastRoot>>();
  const render = (namespace: string): Promise<HastRoot> => {
    let root = fullRange.get(namespace);
    if (root === undefined) {
      root = renderHast(combinedNamespaceToApiPage(nsOf(namespace)), noLink, {
        combinedMarkers: true,
        window: full,
      });
      fullRange.set(namespace, root);
    }
    return root;
  };

  const NAMESPACES = [
    "graphics",
    "compute",
    "liveupdate",
    "model",
    "vmath",
    "go",
    "gui",
    "json",
    "socket",
    "b2d.body",
  ];

  test("the committed axis tracks more than one version", () => {
    expect(axis.length).toBeGreaterThan(1);
  });

  for (const namespace of NAMESPACES) {
    test(`${namespace}: the full-range page's dots equal its full-range counts`, async () => {
      const root = await render(namespace);
      const counts = namespaceBadgeCounts(nsOf(namespace), full);
      expect({
        new: headingDots(root, "new"),
        changed: headingDots(root, "changed"),
        deprecated: headingDots(root, "deprecated"),
      }).toEqual(counts);
    });

    test(`${namespace}: a single-version window marks no symbol new or changed`, () => {
      for (const version of axis) {
        const tree = apiPageTree(combinedNamespaceToApiPage(nsOf(namespace)), noLink, {
          combinedMarkers: true,
          window: { from: version, to: version },
        });
        expect({
          version,
          new: treeHeadingDots(tree, "new"),
          changed: treeHeadingDots(tree, "changed"),
        }).toEqual({ version, new: 0, changed: 0 });
      }
    });
  }

  test("the full-range graphics page does mark symbols new", async () => {
    const dots = headingDots(await render("graphics"), "new");
    expect(dots).toBeGreaterThan(0);
    // The tree tally the single-version windows rely on reads the same dots.
    const tree = apiPageTree(combinedNamespaceToApiPage(nsOf("graphics")), noLink, {
      combinedMarkers: true,
      window: full,
    });
    expect(treeHeadingDots(tree, "new")).toBe(dots);
  });

  test("omitting the window renders the same dots as passing the full range", async () => {
    for (const namespace of NAMESPACES) {
      const withWindow = toHtml(await render(namespace));
      const without = toHtml(
        await renderHast(combinedNamespaceToApiPage(nsOf(namespace)), noLink, {
          combinedMarkers: true,
        }),
      );
      expect({ namespace, html: without }).toEqual({ namespace, html: withWindow });
    }
  }, 60_000);
});

describe("Combined page authoritative render + markers", () => {
  const surface = loadCombinedSurface(REAL_TYPES_DIR);
  const combinedPage = (namespace: string): ApiPage => {
    const ns = surface.namespaces.find((n) => n.namespace === namespace);
    if (!ns) throw new Error(`namespace ${namespace} missing from combined surface`);
    return combinedNamespaceToApiPage(ns);
  };

  test("compute page heading and its function-overview anchor slugify the authoritative signature", async () => {
    const root = await renderHast(combinedPage("compute"), noLink, { combinedMarkers: true });
    const authoritative = "compute.get_constants(path: Hash | string): material.ConstantInfo[]";
    const heading = symbolBlocks(root).find(
      (block) =>
        block.heading.tagName === "h3" &&
        headingText(block.heading).includes("compute.get_constants("),
    )?.heading;
    expect(heading).toBeDefined();
    if (!heading) return;
    expect(headingText(heading)).toBe(authoritative);
    // The rendered signature never falls back to the ref-doc token form; the
    // Returns detail table (a separate ref-doc projection) is out of scope.
    expect(headingText(heading)).not.toContain("Record<string | number, unknown>");
    // The function-overview card links the same authoritative signature by its slug.
    expect(overviewCards(root).map((card) => card.href)).toContain(`#${heading.properties.id}`);
  });

  test("liveupdate.add_mount renders its current arm and the replaced arm as history", async () => {
    const page = combinedPage("liveupdate");
    const root = await renderHast(page, noLink, { combinedMarkers: true });
    const [current] = groupFor(page, "liveupdate.add_mount");
    expect(current?.signature).toContain("result: liveupdate.LiveUpdate");
    const history = historyLines(blockOf(root, current?.signature ?? "")).filter((l) =>
      l.text.startsWith("Signature changed in Defold "),
    );
    expect(history).toHaveLength(1);
    expect(history[0]?.text).toContain("(...args: unknown[]) => unknown");
  });

  test("the authoritative-signature heading id drops the marker glyph and matches the overview anchor", async () => {
    const page = combinedPage("compute");
    const html = toHtml(await renderHast(page, noLink, { combinedMarkers: true }));
    const slug = memberAnchors(page).get("function:compute.get_constants") ?? "";
    expect(slug).not.toBe("");
    expect(html).toContain(`id="${slug}"`);
    expect(html).toContain(`href="#${slug}"`);
    // The glyph chip must not leak into the slug.
    expect(html).not.toContain(`id="${slug}n"`);
    expect(html).not.toContain(`id="${slug}-n"`);
  });

  test("an exact-version page renders no markers even with availability records present", async () => {
    const defaultPages = loadApiSurface(REAL_TYPES_DIR);
    const enginePage = defaultPages.find((p) => p.category === "engine" && p.availability);
    expect(enginePage).toBeDefined();
    expect(toHtml(await renderHast(enginePage as ApiPage))).not.toContain("api-badge-dot");
  });
});

describe("signature brand deep-links", () => {
  // Track `<a`/`</a>` depth over the rendered HTML; any depth above 1 means an
  // anchor is nested inside another anchor — invalid, and the shipped-feature
  // regression this slice's guard exists to catch.
  function hasNestedAnchor(html: string): boolean {
    const re = /<a\b|<\/a>/g;
    let depth = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
    while ((m = re.exec(html)) !== null) {
      if (m[0] === "</a>") depth--;
      else if (++depth > 1) return true;
    }
    return false;
  }

  // Both real render sites in one document: an H3 signature heading (wrapped by
  // the pipeline in a `heading-anchor`) and its function-overview jump link —
  // each carrying an `Opaque<"node">` brand.
  const CREATE: ApiFunction = {
    name: "factory.create",
    brief: "",
    description: "",
    parameters: [],
    returnValues: [],
  };
  const bothSitesPage = (): ApiPage => ({
    namespace: "factory",
    route: "/api/factory",
    brief: "",
    module: {
      namespace: "factory",
      brief: "",
      description: "",
      functions: [CREATE],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
    authoritativeSignatures: new Map([
      [
        symbolIdentityKey({
          namespace: "factory",
          kind: "FUNCTION",
          name: "factory.create",
          signature: normalizedFunctionSignature(CREATE),
        }),
        'factory.create(url: string): Opaque<"node">',
      ],
    ]),
  });
  const bothSites = async (renderOptions: ApiRenderOptions = {}) => {
    const root = await renderHast(bothSitesPage(), noLink, {}, renderOptions);
    return {
      root,
      html: toHtml(root),
      id: headingId(root, 'factory.create(url: string): Opaque<"node">'),
    };
  };

  test("links the Opaque brand at both render sites with no nested anchors", async () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR);
    const { html } = await bothSites({ signatureSymbolLinks: apiSignatureSymbolLinks(pages) });
    // One brand link per render site.
    expect((html.match(/class="signature-symbol-link"/g) ?? []).length).toBe(2);
    expect((html.match(/href="\/api\/Opaque"/g) ?? []).length).toBe(2);
    expect(hasNestedAnchor(html)).toBe(false);
  });

  test("the outer permalink/jump anchor still covers the non-brand signature text", async () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR);
    const { root, html, id } = await bothSites({
      signatureSymbolLinks: apiSignatureSymbolLinks(pages),
    });
    // The heading permalink still wraps the PRE fragment (the code up to Opaque).
    // Its `aria-label` quotes the signature, `>` included, so the anchor is read
    // from the tree rather than matched in the markup.
    expect(html).toContain('<a class="heading-anchor"');
    const opening = hastByClass(root, "heading-anchor").map((anchor) => anchor.children[0]);
    expect(
      opening.some(
        (first) =>
          first?.type === "element" &&
          first.tagName === "code" &&
          hastClasses(first).join(" ") === "api-signature shiki",
      ),
    ).toBe(true);
    // The overview jump anchor still wraps its PRE fragment.
    expect(html).toContain(`<a href="#${id}"><code class="api-signature shiki">`);
  });

  test("omitting signatureSymbolLinks produces no brand link and no nesting", async () => {
    const { html } = await bothSites();
    expect(html).not.toContain("signature-symbol-link");
    expect(hasNestedAnchor(html)).toBe(false);
  });
});

describe("apiReplacementResolver", () => {
  test("resolves a known member to its page route with anchor and returns undefined otherwise", () => {
    const pages = canonicalApiPages(REAL_TYPES_DIR);
    const resolve = apiReplacementResolver(pages);
    const go = pages.find((p) => p.namespace === "go");
    expect(go).toBeDefined();
    const route = resolve({
      namespace: "go",
      kind: "FUNCTION",
      name: "go.get_position",
      signature: "",
    });
    expect(route).toBeDefined();
    expect(route?.startsWith("/api/go")).toBe(true);
    expect(
      resolve({ namespace: "go", kind: "FUNCTION", name: "go.nonexistent_symbol", signature: "" }),
    ).toBeUndefined();
  });

  test("resolves against an exact-version surface to that version's prefixed route", () => {
    const pages = loadApiSurfaceForVersion(REAL_TYPES_DIR, "defold-1.12.4");
    const resolve = apiReplacementResolver(pages);
    expect(pages.find((p) => p.namespace === "go")).toBeDefined();
    const route = resolve({
      namespace: "go",
      kind: "FUNCTION",
      name: "go.get_position",
      signature: "",
    });
    expect(route?.startsWith("/api/defold-1.12.4/go")).toBe(true);
  });
});

// The `@deprecated` carried from an api-doc renders as text in the same
// availability block that holds the engine lifecycle facts, so a page with no
// availability record still shows the fact.
describe("renderApiPage deprecation from the api-doc tag", () => {
  function taggedPage(fn: Partial<ApiFunction> & { name: string }): ApiPage {
    return {
      namespace: "demo",
      route: "/api/demo",
      brief: "Demo",
      module: {
        namespace: "demo",
        brief: "Demo",
        description: "Demo bindings.",
        functions: [
          { brief: "", description: "", parameters: [], returnValues: [], ...fn } as ApiFunction,
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
    };
  }

  test("renders the label and the tag text as an availability list item", async () => {
    const root = await renderHast(
      taggedPage({ name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." }),
    );
    expect(toHtml(root)).toContain('aria-label="Availability"');
    const item = availabilityItem(root, "Deprecated —");
    expect(item.text).toBe("Deprecated — Use player_get_unique_id instead.");
    expect(codeTexts([item.item])).toEqual(["player_get_unique_id"]);
  });

  test("renders a bare tag as the label alone, with no dash", async () => {
    const root = await renderHast(taggedPage({ name: "old_thing", deprecated: "" }));
    expect(toHtml(root)).toContain('aria-label="Availability"');
    expect(availabilityItem(root, "Deprecated").text).toBe("Deprecated");
    expect(toHtml(root)).not.toContain("Deprecated —");
  });

  test("leads a source deprecation tag with the Deprecated chip", async () => {
    for (const deprecated of ["Use `player_get_unique_id` instead.", ""]) {
      const root = await renderHast(taggedPage({ name: "player_get_id", deprecated }));
      const item = availabilityItem(root, "Deprecated");
      expect({ deprecated, kind: item.kind, glyph: item.glyph }).toEqual({
        deprecated,
        kind: "deprecated",
        glyph: "D",
      });
    }
  });

  test("folds a wrapped tag onto one list item so a continuation cannot break the list", async () => {
    const root = await renderHast(
      taggedPage({
        name: "leaderboards_init",
        deprecated: "The leaderboards subsystem no longer needs initializing;\n- the others work.",
      }),
    );
    expect(availabilityItem(root, "Deprecated —").text).toBe(
      "Deprecated — The leaderboards subsystem no longer needs initializing; - the others work.",
    );
  });

  test("opens the symbol body with a source-tag-only note, ahead of the description", async () => {
    const root = await renderHast(
      taggedPage({
        name: "player_get_id",
        description: "Library function.",
        deprecated: "Use `player_get_unique_id` instead.",
      }),
    );
    const children = elementChildren(blockStarting(root, "player_get_id").body);
    const note = children.findIndex((element) => hastClasses(element).includes("api-availability"));
    const description = children.findIndex((element) =>
      hastText(element).includes("Library function."),
    );
    expect(note).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(-1);
    expect(note).toBeLessThan(description);
  });

  test("renders no availability block when the symbol carries neither fact", async () => {
    const html = toHtml(await renderHast(taggedPage({ name: "current_thing" })));
    expect(html).not.toContain('aria-label="Availability"');
    expect(html).not.toContain("Deprecated");
  });

  // The same page, but with a curated availability record joined onto the symbol —
  // the state where both an engine fact and a source tag exist at once.
  function pageWithAvailability(
    fn: Partial<ApiFunction> & { name: string },
    record: Omit<ApiAvailability, "identity">,
  ): ApiPage {
    const page = taggedPage(fn);
    const built = page.module.functions[0] as ApiFunction;
    const identity = {
      namespace: "demo",
      kind: "FUNCTION",
      name: built.name,
      signature: normalizedFunctionSignature(built),
    };
    const availability: AvailabilityLookup = {
      versions: ["1.13.0", "1.12.4"],
      records: new Map([[symbolIdentityKey(identity), { identity, ...record }]]),
      transitions: new Set(),
    };
    return { ...page, availability };
  }

  test("a span-bearing record with no deprecatedSince still shows the source tag, listed first", async () => {
    const root = await renderHast(
      pageWithAvailability(
        { name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." },
        { availableIn: ["1.13.0"] },
      ),
    );

    expect(toHtml(root).match(/aria-label="Availability"/g)).toHaveLength(1);
    const items = availabilityLines([root]).map((line) => line.text);
    const tagAt = items.indexOf("Deprecated — Use player_get_unique_id instead.");
    const spanAt = items.indexOf("Since Defold 1.13.0");
    expect(tagAt).toBeGreaterThanOrEqual(0);
    expect(spanAt).toBeGreaterThanOrEqual(0);
    expect(tagAt).toBeLessThan(spanAt);
  });

  test("a record carrying deprecatedSince keeps the version-keyed line and gains no second one", async () => {
    const root = await renderHast(
      pageWithAvailability(
        { name: "player_get_id", deprecated: "Use `player_get_unique_id` instead." },
        { availableIn: ["1.12.4"], deprecatedSince: "1.12.0" },
      ),
    );

    expect(hastText(root)).toContain("Deprecated since 1.12.0");
    expect(hastText(root)).not.toContain("Deprecated — Use player_get_unique_id instead.");
    const deprecationItems = availabilityLines([root]).filter((line) =>
      line.text.startsWith("Deprecated"),
    );
    expect(deprecationItems).toHaveLength(1);
  });
});

// What a reader actually sees on `/api/<version>/<ns>` once it renders the window
// ending at that version. The exact surface already carries the *curated*
// availability overlay, so the property that distinguishes the windowed page is
// the presence-derived provenance the Combined projection computes — a symbol
// that first appeared at the routed version says so, and one present in every
// tracked version stays unmarked.
describe("renderApiPage — provenance on a non-default version's windowed page", () => {
  let dir = "";
  let pages: ApiPage[];
  let demo: HastRoot;

  beforeAll(async () => {
    dir = makeWindowedTypesDir();
    pages = windowedApiPages({ from: OLDEST, to: MIDDLE }, dir);
    demo = await renderHast(
      pages.find((p) => p.namespace === "demo") as ApiPage,
      apiLinkify(pages),
    );
  });
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("a symbol introduced at the routed version renders its availability marker", () => {
    expect(toHtml(demo)).toContain('<div class="api-availability"');
    expect(hastText(demo)).toContain(`Since Defold ${MIDDLE}`);
  });

  test("a symbol present in every tracked version renders no availability marker", () => {
    // `demo.always` spans the whole axis, so its block would read "All tracked
    // versions" — which `availabilityLabels` deliberately drops. Slice the
    // rendered section for that symbol so a marker on a *neighbouring* symbol
    // cannot mask a regression here.
    const section = blockStarting(demo, "demo.always()");
    expect(section.nodes.flatMap((node) => hastByClass(node, "api-availability"))).toEqual([]);
  });

  test("the rendered signature is the routed version's declaration, not the newest", async () => {
    // `demo.evolving` gains an optional parameter at the newest version; a window
    // capped at MIDDLE must render the declaration MIDDLE actually shipped.
    expect(hastText(demo)).toContain("demo.evolving(a: string): void");
    expect(hastText(demo)).not.toContain("b?: number");

    const canonicalPages = windowedApiPages({ from: OLDEST, to: NEWEST }, dir);
    const canonical = await renderHast(
      canonicalPages.find((p) => p.namespace === "demo") as ApiPage,
      apiLinkify(canonicalPages),
    );
    expect(hastText(canonical)).toContain("demo.evolving(a: string, b?: number): void");
  });
});

describe("constant union alias entries", () => {
  const EASING_SIG =
    "type Easing = typeof gui.EASING_LINEAR | typeof gui.EASING_INOUTQUAD | typeof gui.EASING_OUTSINE";
  const STATE_SIG = "type State = typeof graphics.STATE_BLEND | typeof graphics.STATE_DEPTH_TEST";
  // The ledger declares each alias inside its namespace; an engine page names its path.
  const EASING_ROW =
    "type gui.Easing = typeof gui.EASING_LINEAR | typeof gui.EASING_INOUTQUAD | typeof gui.EASING_OUTSINE";
  const STATE_ROW =
    "type graphics.State = typeof graphics.STATE_BLEND | typeof graphics.STATE_DEPTH_TEST";

  function aliasKey(namespace: string, name: string): string {
    return symbolIdentityKey({ namespace, kind: "TYPEDEF", name, signature: "" });
  }

  function guiPage(): ApiPage {
    return {
      namespace: "gui",
      route: "/api/gui",
      brief: "",
      module: {
        namespace: "gui",
        brief: "",
        description: "GUI API.",
        functions: [
          {
            name: "gui.animate",
            brief: "",
            description: "Animates a node.",
            parameters: [{ name: "easing", doc: "", types: ["constant"], isOptional: false }],
            returnValues: [],
          },
        ],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      authoritativeSignatures: new Map([
        [aliasKey("gui", "Easing"), `${EASING_SIG};`],
        [
          symbolIdentityKey({
            namespace: "gui",
            kind: "FUNCTION",
            name: "gui.animate",
            signature: normalizedFunctionSignature({
              name: "gui.animate",
              brief: "",
              description: "",
              parameters: [{ name: "easing", doc: "", types: ["constant"], isOptional: false }],
              returnValues: [],
            }),
          }),
          "gui.animate(easing: gui.Easing): void",
        ],
      ]),
    };
  }

  function graphicsPage(): ApiPage {
    return {
      namespace: "graphics",
      route: "/api/graphics",
      brief: "",
      module: {
        namespace: "graphics",
        brief: "",
        description: "Graphics API.",
        functions: [],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      authoritativeSignatures: new Map([[aliasKey("graphics", "State"), `${STATE_SIG};`]]),
    };
  }

  test("an alias typedef with no ref-doc entry still becomes a page type symbol", () => {
    const symbols = apiModuleSymbols(guiPage());
    const easing = symbols.find((s) => s.kind === "type" && s.name === "Easing");
    expect(easing?.signature).toBe(EASING_ROW);
  });

  test("the alias renders a symbol entry whose body lists its members", async () => {
    const root = await renderHast(guiPage());
    expect(symbolBlocks(root).map((block) => headingText(block.heading))).toContain(EASING_ROW);
    for (const member of ["gui.EASING_LINEAR", "gui.EASING_INOUTQUAD", "gui.EASING_OUTSINE"]) {
      expect(hastText(root)).toContain(member);
    }
  });

  test("a signature naming the alias links to that entry's own anchor", async () => {
    const page = guiPage();
    const links = apiSignatureSymbolLinks([page, graphicsPage()], page);
    const target = links.get("gui.Easing");
    const root = await renderHast(page);
    expect(target).toBe(`/api/gui#${headingId(root, EASING_ROW)}`);
  });

  test("a cross-namespace alias links to its home page, not the referencing one", async () => {
    const page = guiPage();
    const links = apiSignatureSymbolLinks([page, graphicsPage()], page);
    const home = await renderHast(graphicsPage());
    expect(links.get("graphics.State")).toBe(`/api/graphics#${headingId(home, STATE_ROW)}`);
  });

  test("a type sharing its qualified name with a function links to the type's own anchor", async () => {
    const page: ApiPage = {
      ...guiPage(),
      module: {
        ...guiPage().module,
        functions: [
          ...guiPage().module.functions,
          { name: "gui.node", brief: "", description: "", parameters: [], returnValues: [] },
        ],
        typedefs: [{ name: "node", types: ["userdata"] }],
      },
    };
    const type = apiModuleSymbols(page).find((s) => s.kind === "type" && s.name === "node");
    expect(type).toBeDefined();
    const links = apiSignatureSymbolLinks([page], page);
    const root = await renderHast(page);
    expect(links.get("gui.node")).toBe(`/api/gui#${headingId(root, type?.signature ?? "")}`);
  });

  test("a member-less type's bare and qualified names link to the same row", () => {
    const page: ApiPage = {
      ...guiPage(),
      module: {
        ...guiPage().module,
        typedefs: [{ name: "node", types: ["userdata"] }],
      },
    };
    const links = apiSignatureSymbolLinks([page], page);
    expect(typeof links.get("node")).toBe("string");
    expect(links.get("node")).toBe(links.get("gui.node"));
  });
});

// Alias-link fixtures shared by the canonical and versioned groups below. The
// two groups differ only in the routes their pages carry, so the surface is
// built once and re-routed rather than restated.
const ALIAS_EASING_SIG = "type Easing = typeof gui.EASING_LINEAR | typeof gui.EASING_OUTSINE";
const ALIAS_STATE_SIG =
  "type State = typeof graphics.STATE_BLEND | typeof graphics.STATE_DEPTH_TEST";
const ALIAS_EASING_ROW = "type gui.Easing = typeof gui.EASING_LINEAR | typeof gui.EASING_OUTSINE";
const ALIAS_STATE_ROW =
  "type graphics.State = typeof graphics.STATE_BLEND | typeof graphics.STATE_DEPTH_TEST";

function aliasTypedefKey(namespace: string, name: string): string {
  return symbolIdentityKey({ namespace, kind: "TYPEDEF", name, signature: "" });
}

const ALIAS_ANIMATE: ApiFunction = {
  name: "gui.animate",
  brief: "",
  description: "Animates a node.",
  parameters: [
    { name: "node", doc: "", types: ['Opaque<"node">'], isOptional: false },
    { name: "easing", doc: "", types: ["gui.Easing", "Vector"], isOptional: false },
    { name: "unknown", doc: "", types: ["gui.Nowhere"], isOptional: true },
    {
      name: "opts",
      doc: "",
      types: ["table"],
      isOptional: true,
      fields: [{ name: "inner", doc: "", types: ["gui.Easing"], isOptional: true }],
    },
  ],
  returnValues: [{ name: "state", doc: "", types: ["graphics.State"], isOptional: false }],
};

function guiAliasPage(route: string): ApiPage {
  return {
    namespace: "gui",
    route,
    brief: "",
    module: {
      namespace: "gui",
      brief: "",
      description: "GUI API.",
      functions: [ALIAS_ANIMATE],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [{ name: "node", types: ["userdata"] }],
    },
    translations: {},
    signatures: {},
    category: "engine",
    authoritativeSignatures: new Map([
      [aliasTypedefKey("gui", "Easing"), `${ALIAS_EASING_SIG};`],
      [
        symbolIdentityKey({
          namespace: "gui",
          kind: "FUNCTION",
          name: "gui.animate",
          signature: normalizedFunctionSignature(ALIAS_ANIMATE),
        }),
        'gui.animate(node: Opaque<"node">, easing: gui.Easing): graphics.State',
      ],
    ]),
  };
}

function graphicsAliasPage(route: string): ApiPage {
  return {
    namespace: "graphics",
    route,
    brief: "",
    module: {
      namespace: "graphics",
      brief: "",
      description: "Graphics API.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
    authoritativeSignatures: new Map([
      [aliasTypedefKey("graphics", "State"), `${ALIAS_STATE_SIG};`],
    ]),
  };
}

function opaqueBrandPage(): ApiPage {
  return {
    namespace: "Opaque",
    route: "/api/Opaque",
    brief: "",
    module: {
      namespace: "Opaque",
      brief: "",
      description: "Engine handle brand.",
      functions: [],
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
    authoritativeSignatures: new Map(),
  };
}

async function renderAliasHast(
  pages: ApiPage[],
  page: ApiPage,
  aliasPages: ApiPage[] = pages,
): Promise<HastRoot> {
  return renderHast(
    page,
    noLink,
    {},
    { signatureSymbolLinks: apiSignatureSymbolLinks(pages, page, aliasPages) },
  );
}

async function renderAliasSurface(
  pages: ApiPage[],
  page: ApiPage,
  aliasPages: ApiPage[] = pages,
): Promise<string> {
  return toHtml(await renderAliasHast(pages, page, aliasPages));
}

// The `<li>` whose name half is `name`, so an assertion names one slot rather
// than the whole document.
function slotBullet(html: string, name: string): string {
  const at = html.indexOf(`<code>${name}</code>`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<li>", at), html.indexOf("</li>", at));
}

function mintedAnchorIds(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] as string));
}

function nestedAnchor(html: string): boolean {
  let depth = 0;
  for (const m of html.matchAll(/<a\b[^>]*>|<\/a>/g)) {
    if (m[0] === "</a>") depth--;
    else if (++depth > 1) return true;
  }
  return false;
}

function typeLinkHrefs(html: string): string[] {
  return [...html.matchAll(/<a class="api-type-link" href="([^"]+)"/g)].map((m) => m[1] as string);
}

describe("constant union alias links in parameter, return and field types", () => {
  const surface = () => [
    guiAliasPage("/api/gui"),
    graphicsAliasPage("/api/graphics"),
    opaqueBrandPage(),
  ];

  test("a parameter type links its alias to an anchor the same page minted", async () => {
    const pages = surface();
    const tree = await renderAliasHast(pages, pages[0] as ApiPage);
    const html = toHtml(tree);
    const href = slotBullet(html, "easing").match(
      /<a class="api-type-link" href="([^"]+)">gui\.Easing<\/a>/,
    )?.[1];
    expect(href).toBeString();
    const [route, anchor] = (href as string).split("#");
    expect(route).toBe("/api/gui");
    expect(anchor).toBe(headingIdIn(tree, ALIAS_EASING_ROW));
    expect(mintedAnchorIds(html).has(anchor as string)).toBe(true);
  });

  test("the other union arm, the separator and the name/type gap survive", async () => {
    const pages = surface();
    const html = await renderAliasSurface(pages, pages[0] as ApiPage);
    const easing = slotBullet(html, "easing");
    expect(easing).toContain(`${nameCode("easing")}:${NAME_TYPE_GAP}`);
    expect(easing).toContain(" | Vector");
    expect(easing).not.toContain(">Vector</a>");
    expect(nestedAnchor(html)).toBe(false);
  });

  test("a return value and a nested object-literal field link the same way", async () => {
    const pages = surface();
    const tree = await renderAliasHast(pages, pages[0] as ApiPage);
    const html = toHtml(tree);
    const stateId = headingIdIn(await renderAliasHast(pages, pages[1] as ApiPage), ALIAS_STATE_ROW);
    expect(slotBullet(html, "state")).toContain(
      `<a class="api-type-link" href="/api/graphics#${stateId}">graphics.State</a>`,
    );
    expect(slotBullet(html, "inner")).toContain(
      `<a class="api-type-link" href="/api/gui#${headingIdIn(tree, ALIAS_EASING_ROW)}">gui.Easing</a>`,
    );
  });

  test('a parameter typed Opaque<"node"> links neither the brand nor the shape name', async () => {
    const pages = surface();
    const html = await renderAliasSurface(pages, pages[0] as ApiPage);
    const node = slotBullet(html, "node");
    expect(node).not.toContain("api-type-link");
    expect(node).not.toContain("/api/Opaque");
  });

  test("a type carrying angle brackets and quotes renders escaped and unbroken", async () => {
    const pages = surface();
    const root = await renderHast(
      pages[0] as ApiPage,
      noLink,
      {},
      { signatureSymbolLinks: apiSignatureSymbolLinks(pages, pages[0]) },
    );
    const node = slotBullet(toHtml(root), "node");
    expect(node).toContain("Opaque&#x3C;");
    expect(node).not.toContain('Opaque<"node">');
    expect((node.match(/<code class="api-type">/g) ?? []).length).toBe(1);
    // The type is one text run, never parsed into elements.
    const [type] = hastElements(root, isSlotBullet)
      .filter((item) => hastText(item).startsWith("node:"))
      .flatMap((item) => hastByClass(item, "api-type"));
    expect(type?.children).toEqual([{ type: "text", value: 'Opaque<"node">' }]);
  });

  test("an alias the surface does not render stays plain code", async () => {
    const pages = surface();
    const html = await renderAliasSurface(pages, pages[0] as ApiPage);
    const unknown = slotBullet(html, "unknown");
    expect(unknown).toContain("gui.Nowhere");
    expect(unknown).not.toContain("api-type-link");
  });
});

describe("versioned alias link targets", () => {
  const PREFIX = "/api/defold-1.12.4";
  const versionedSurface = () => [
    guiAliasPage(`${PREFIX}/gui`),
    graphicsAliasPage(`${PREFIX}/graphics`),
  ];

  test("every alias link on a versioned page stays inside that version", async () => {
    const pages = versionedSurface();
    const html = await renderAliasSurface([opaqueBrandPage()], pages[0] as ApiPage, pages);
    const hrefs = typeLinkHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href.startsWith(`${PREFIX}/`)).toBe(true);
    const ids = mintedAnchorIds(html);
    for (const href of hrefs) {
      const [route, anchor] = href.split("#");
      if (route === `${PREFIX}/gui`) expect(ids.has(anchor as string)).toBe(true);
    }
  });

  test("a signature heading on a versioned page links its alias to that version too", async () => {
    const pages = versionedSurface();
    const html = await renderAliasSurface([opaqueBrandPage()], pages[0] as ApiPage, pages);
    const signature = [...html.matchAll(/<a class="signature-symbol-link" href="([^"]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(signature.length).toBeGreaterThan(0);
    for (const href of signature) {
      if (href === "/api/Opaque") continue;
      expect(href.startsWith(`${PREFIX}/`)).toBe(true);
    }
  });

  test("a cross-namespace alias resolves to that version's owning namespace", async () => {
    const pages = versionedSurface();
    const html = await renderAliasSurface([opaqueBrandPage()], pages[0] as ApiPage, pages);
    const stateId = headingIdIn(
      await renderAliasHast([opaqueBrandPage()], pages[1] as ApiPage, pages),
      ALIAS_STATE_ROW,
    );
    expect(slotBullet(html, "state")).toContain(`href="${PREFIX}/graphics#${stateId}"`);
  });

  test("the version-independent Opaque brand keeps its canonical route", async () => {
    const pages = versionedSurface();
    const html = await renderAliasSurface([opaqueBrandPage()], pages[0] as ApiPage, pages);
    expect(html).toContain('href="/api/Opaque"');
    expect(html).not.toContain(`${PREFIX}/Opaque`);
  });

  test("the canonical surface renders alias hrefs identical to the default call", async () => {
    const pages = [guiAliasPage("/api/gui"), graphicsAliasPage("/api/graphics"), opaqueBrandPage()];
    const explicit = await renderAliasSurface(pages, pages[0] as ApiPage, pages);
    const defaulted = await renderAliasSurface(pages, pages[0] as ApiPage);
    expect(typeLinkHrefs(explicit)).toEqual(typeLinkHrefs(defaulted));
    expect(explicit).toBe(defaulted);
  });
});

// Each history line in a block, as its markup and its text after the `changed`
// chip it must lead with.
function historyLines(block: SymbolBlock): { html: string; text: string }[] {
  return block.nodes
    .flatMap((node) => hastByClass(node, "api-revisions"))
    .flatMap((list) => elementChildren(list))
    .map((item) => {
      const [chip, ...rest] = elementChildren(item)[0]?.children ?? [];
      const mark = chip?.type === "element" ? chip : undefined;
      expect([
        /api-availability-mark--(\w+)/.exec(hastClasses(mark).join(" "))?.[1],
        hastText(mark),
      ]).toEqual(["changed", "C"]);
      return {
        html: toHtml(rest).replace(/^ /, ""),
        text: rest.map(hastText).join("").replace(/^ /, ""),
      };
    });
}

// The overload group `apiPageTree` heads under `name`, gathered the way the
// renderer gathers it.
function groupFor(page: ApiPage, name: string): ApiSymbol[] {
  const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
    (s) => s.kind === "function",
  );
  const group = groupOverloadForms(rows, page.availability?.versions ?? []).find(
    (g) => g[0]?.name === name,
  );
  if (!group) throw new Error(`no function ${name} on ${page.namespace}`);
  return group;
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("grouped overload blocks (committed artifacts)", () => {
  const pages = loadCombinedSurface(REAL_TYPES_DIR).namespaces.map(combinedNamespaceToApiPage);
  const pageFor = (namespace: string): ApiPage => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`namespace ${namespace} missing from the Combined surface`);
    return page;
  };
  const rendered = new Map<ApiPage, HastRoot>();
  beforeAll(async () => {
    for (const page of pages) {
      rendered.set(page, await renderHast(page, noLink, { combinedMarkers: true }));
    }
  }, 120_000);
  const render = (page: ApiPage): HastRoot => {
    const root = rendered.get(page);
    if (root === undefined) throw new Error(`no render of ${page.namespace}`);
    return root;
  };
  const functionRows = (page: ApiPage) =>
    apiModuleSymbols(page, page.translations, page.signatures).filter((s) => s.kind === "function");

  test("b2d.shape.get_shape renders one heading, both forms, and its return type in the heading alone", () => {
    const page = pageFor("b2d.shape");
    const root = render(page);
    const name = "b2d.shape.get_shape";
    const group = groupFor(page, name);
    const headings = symbolBlocks(root).filter(
      (block) => block.heading.tagName === "h3" && headingText(block.heading).startsWith(name),
    );
    expect(headings).toHaveLength(1);
    expect(headings[0] && headingText(headings[0].heading)).toBe(overloadHeading(group));
    const block = blockOf(root, overloadHeading(group));
    const forms = group.map(splitCallForm);
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(formLineCodes(block).filter((code) => code === form.params)).toHaveLength(1);
    }
    const returnType = (forms[0]?.returns ?? "").replace(/^:\s*/, "");
    expect(returnType).not.toBe("");
    expect(overloadHeading(group).endsWith(returnType)).toBe(true);
    // Once above the shared Returns table: in the heading, never on a form line.
    expect(slotLabels(block.body, "Returns").length).toBeGreaterThan(0);
    const beforeReturns = textBefore(block.nodes, (element) => isSlotLabel(element, "Returns"));
    expect(occurrences(beforeReturns, returnType)).toBe(1);
  });

  test("forms whose parameters differ each list their own full Parameters table", () => {
    const page = pageFor("b2d.shape");
    const block = blockOf(render(page), overloadHeading(groupFor(page, "b2d.shape.set_shape")));
    expect(
      block.nodes.flatMap((node) =>
        hastElements(node, (element) => element.tagName === "em" && hastText(element) === "one of"),
      ),
    ).toEqual([]);
    const tables = overloadForms(block).map((form) => {
      const order = hastElements(form, () => true);
      const label = order.findIndex((element) => isSlotLabel(element, "Parameters"));
      return label < 0
        ? []
        : order
            .slice(label)
            .filter(
              (element) =>
                element.tagName === "li" &&
                hastClasses(elementChildren(element)[0]).includes("api-name"),
            )
            .map((element) => hastText(elementChildren(element)[0]));
    });
    expect(tables).toEqual([
      ["shape_id", "definition", "update_mass"],
      ["body", "shape_index", "definition", "update_mass"],
    ]);
    expect(aroundForms(block).tail.flatMap((node) => slotLabels(node, "Parameters"))).toEqual([]);
  });

  test("msg.url keeps each form's own description exactly once", async () => {
    const page = pageFor("msg");
    const rows = functionRows(page).filter((s) => s.name === "msg.url");
    expect(rows.length).toBeGreaterThan(1);
    const docs = [...new Set(rows.map((r) => r.docMarkdown).filter((d) => d !== ""))];
    expect(docs.length).toBeGreaterThan(1);
    const block = blockText(blockOf(render(page), overloadHeading(groupFor(page, "msg.url"))));
    for (const doc of docs) expect(occurrences(block, await fragmentText(doc))).toBe(1);
  });

  test("a function whose signature changed states its current form's example once", async () => {
    let checked = 0;
    let addMount = false;
    for (const page of pages) {
      const root = render(page);
      const axis = page.availability?.versions ?? [];
      for (const group of groupFunctionRevisions(functionRows(page), axis)) {
        const [only] = group.forms;
        if (group.forms.length !== 1 || only === undefined) continue;
        const current = only.symbol.exampleMarkdown;
        const replaced = only.predecessors.flatMap((p) =>
          p.symbol.exampleMarkdown === undefined || p.symbol.exampleMarkdown === current
            ? []
            : [p.symbol.exampleMarkdown],
        );
        if (current === undefined || replaced.length === 0) continue;
        const name = only.symbol.name;
        const block = blockText(blockOf(root, only.symbol.signature));
        const currentText = await fragmentText(current);
        const replacedTexts = await Promise.all(replaced.map(fragmentText));
        // A replaced example that the current one extends shows only inside it.
        expect({
          name,
          current: occurrences(block, currentText),
          replaced: replacedTexts.map((example) => occurrences(block, example)),
        }).toEqual({
          name,
          current: 1,
          replaced: replacedTexts.map((example) => occurrences(currentText, example)),
        });
        if (name === "liveupdate.add_mount") addMount = true;
        checked += 1;
      }
    }
    expect(addMount).toBe(true);
    expect(checked).toBeGreaterThan(0);
  });

  test("a table only one form carries lands under each form whose parameters it names", () => {
    const placement = (namespace: string, name: string) => {
      const page = pageFor(namespace);
      const block = blockOf(render(page), overloadHeading(groupFor(page, name)));
      return {
        forms: overloadForms(block).map((form) => slotLabels(form, "Parameters").length > 0),
        block: aroundForms(block).tail.some((node) => slotLabels(node, "Parameters").length > 0),
      };
    };
    // The table names the options argument, so it sits under the forms that take it.
    expect(placement("go", "go.get")).toEqual({
      forms: [false, false, true],
      block: false,
    });
    expect(placement("go", "go.set")).toEqual({
      forms: [false, false, true],
      block: false,
    });
    // The table names delay and complete_function, which only the last form takes.
    expect(placement("go", "go.animate")).toEqual({
      forms: [false, false, true],
      block: false,
    });
    // 1.13.2 documents render_target(table) alone, so the table sits under both
    // hand-authored forms.
    expect(placement("render", "render.render_target")).toEqual({
      forms: [true, true],
      block: false,
    });
    expect(placement("vmath", "vmath.euler_to_quat")).toEqual({
      forms: [false, true],
      block: false,
    });
  });

  test("a moved table takes each slot's type from the form it lands under", () => {
    const G = NAME_TYPE_GAP;
    const page = pageFor("vmath");
    const block = blockOf(render(page), overloadHeading(groupFor(page, "vmath.euler_to_quat")));
    const xyz = elementChildren(overloadForms(block)[1]);
    const from = xyz.findIndex((element) => isSlotLabel(element, "Parameters"));
    const to = xyz.findIndex((element) => isSlotLabel(element, "Returns"));
    const params = xyz.slice(from, to < 0 ? undefined : to);
    const lines = params.flatMap((node) => hastElements(node, isSlotBullet)).map(bulletLine);
    for (const name of ["x", "y", "z"]) {
      expect(
        lines.some((line) => line.startsWith(`${nameCode(name)}:${G}${typeCode("number")}`)),
      ).toBe(true);
    }
    expect(toHtml(params)).not.toContain("Vector3</code>");
    const go = pageFor("go");
    const get = blockOf(render(go), overloadHeading(groupFor(go, "go.get")));
    const typed = toHtml(overloadForms(get)[2] ?? { type: "root", children: [] });
    expect(typed).toContain(`<li>${nameCode("options")}:${G}${typeCode("GoPropertyOptions")}`);
    expect(typed).toContain(`${G}${typeCode('PropertyRead<AddressCatalog<R>["catalog"], K>')}`);
  });

  test("overloads that coexist keep each form's own example under that form", async () => {
    const page = pageFor("vmath");
    const group = groupFor(page, "vmath.vector3");
    const items = overloadForms(blockOf(render(page), overloadHeading(group)));
    expect(items).toHaveLength(group.length);
    for (const [index, form] of group.entries()) {
      expect(form.exampleMarkdown).toBeDefined();
      expect(
        occurrences(hastText(items[index]), await fragmentText(form.exampleMarkdown ?? "-")),
      ).toBe(1);
    }
  });

  test("a group whose forms differ in availability keeps every form's badge text", () => {
    let checked = 0;
    for (const page of pages) {
      const root = render(page);
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        if (group.length < 2) continue;
        const spans = group.map((s) => JSON.stringify(s.availability ?? null));
        if (new Set(spans).size < 2) continue;
        const items = availabilityLines(blockOf(root, overloadHeading(group)).nodes);
        for (const form of group) {
          if (!form.availability) continue;
          for (const label of availabilityLabels(form.availability, page.availability)) {
            const found = items.some((line) => line.text === label);
            expect({ name: form.name, label, found }).toEqual({
              name: form.name,
              label,
              found: true,
            });
          }
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("single-form functions keep their signature heading and every grouped form is listed", () => {
    let grouped = 0;
    for (const page of pages) {
      const root = render(page);
      const headings = symbolBlocks(root).map((block) => headingText(block.heading));
      const codes = codeTexts([root]);
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        const [only] = group;
        if (group.length === 1 && only) {
          expect(headings).toContain(only.signature);
          continue;
        }
        grouped += 1;
        for (const form of group) {
          const { params } = splitCallForm(form);
          expect({ params, listed: codes.some((code) => code.startsWith(params)) }).toEqual({
            params,
            listed: true,
          });
        }
      }
    }
    expect(grouped).toBeGreaterThan(10);
  });

  test("each form states its own return type unless every form shares it", () => {
    const counts = { differing: 0, shared: 0 };
    let lerpReturns = 0;
    for (const page of pages) {
      const root = render(page);
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        const [head] = group;
        if (group.length < 2 || head === undefined) continue;
        const block = blockOf(root, overloadHeading(group));
        const splits = group.map(splitCallForm);
        const returns = splits.map((s) => s.returns);
        const sameReturns = new Set(returns).size === 1;
        const expected = splits.map((s) =>
          sameReturns ? s.params : `${s.params}${s.returns ?? ""}`,
        );
        expect({ name: head.name, forms: formLineCodes(block) }).toEqual({
          name: head.name,
          forms: expected,
        });
        expect({
          name: head.name,
          arrows: block.nodes
            .flatMap((node) =>
              hastElements(node, (element) => element.tagName === "p" || element.tagName === "li"),
            )
            .map(hastText)
            .filter((text) => text.startsWith("→ ")),
        }).toEqual({
          name: head.name,
          arrows: [],
        });
        if (!sameReturns) counts.differing += 1;
        else if (returns[0]) counts.shared += 1;
        if (head.name === "vmath.lerp") lerpReturns = sameReturns ? 1 : new Set(returns).size;
      }
    }
    expect(lerpReturns).toBe(4);
    expect(counts.differing).toBeGreaterThan(0);
    expect(counts.shared).toBeGreaterThan(0);
  });

  test("an overload block heads with its count badge and puts only shared prose ahead of its forms", () => {
    let checked = 0;
    for (const page of pages) {
      const root = render(page);
      expect({
        namespace: page.namespace,
        labels: hastElements(
          root,
          (element) => element.tagName === "strong" && /^\d+ overloads$/.test(hastText(element)),
        ).map(hastText),
      }).toEqual({
        namespace: page.namespace,
        labels: [],
      });
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        const [head] = group;
        if (group.length < 2 || head === undefined) continue;
        const block = blockOf(root, overloadHeading(group));
        const code = hastByClass(block.heading, "api-signature")[0];
        expect({
          name: head.name,
          heading:
            block.heading.tagName === "h3" &&
            code !== undefined &&
            hastOutlineText(code) === overloadHeading(group) &&
            overloadCountText(code) === `${group.length} overloads`,
        }).toEqual({ name: head.name, heading: true });
        // Ahead of the forms: the shared availability note, description and
        // authored note. Tables and examples belong to the forms they follow.
        const { lead, tail, found } = aroundForms(block);
        expect({
          name: head.name,
          list: found,
          tables: lead.some(
            (node) =>
              slotLabels(node, "Parameters").length > 0 || slotLabels(node, "Returns").length > 0,
          ),
          // A fence quoted inside the authored note is the note's own sample.
          example: lead.some(isExample),
        }).toEqual({ name: head.name, list: true, tables: false, example: false });
        // After the forms, shared tables precede the shared example.
        const example = tail.findIndex(isExample);
        const lastTable = tail.findLastIndex(
          (element) => isSlotLabel(element, "Parameters") || isSlotLabel(element, "Returns"),
        );
        if (example > -1) {
          expect({ name: head.name, tableAfterExample: lastTable > example }).toEqual({
            name: head.name,
            tableAfterExample: false,
          });
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  test("the overview nests the same form codes the block lists", () => {
    let checked = 0;
    for (const page of pages) {
      const root = render(page);
      const cards = overviewCards(root);
      for (const group of groupOverloadForms(
        functionRows(page),
        page.availability?.versions ?? [],
      )) {
        const [head] = group;
        if (group.length < 2 || head === undefined) continue;
        const card = cards.find(
          (candidate) =>
            candidate.code !== undefined &&
            hastOutlineText(candidate.code) === overloadHeading(group) &&
            overloadCountText(candidate.code) === `${group.length} overloads`,
        );
        expect({ name: head.name, card: card !== undefined }).toEqual({
          name: head.name,
          card: true,
        });
        expect({ name: head.name, children: card?.forms }).toEqual({
          name: head.name,
          children: formLineCodes(blockOf(root, overloadHeading(group))),
        });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("a slot doc carrying a list stays under its bullet", () => {
  test("render.enable_state's state values nest under the state bullet", async () => {
    const ns = loadCombinedSurface(REAL_TYPES_DIR).namespaces.find(
      (candidate) => candidate.namespace === "render",
    );
    if (!ns) throw new Error("render namespace missing from the combined surface");
    const html = toHtml(await renderHast(combinedNamespaceToApiPage(ns)));
    const start = html.indexOf("state to enable");
    const end = html.indexOf("graphics.STATE_DEPTH_TEST", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const between = html.slice(start, end);
    expect(between).toContain("<ul>");
    expect(between).not.toContain("</li>");
  });
});

describe("per-form availability on an authored override", () => {
  test("go.property's string form carries its own availability line and span", async () => {
    const page = canonicalApiPages(REAL_TYPES_DIR).find((p) => p.namespace === "go");
    if (!page) throw new Error("no canonical go page");
    const record = apiModuleSymbols(page, page.translations, page.signatures).find(
      (s) =>
        s.name === "go.property" && s.signature.endsWith("value: string): ScriptProperty<string>"),
    )?.availability;
    if (!record) throw new Error("go.property's string form carries no availability");
    const labels = availabilityItems(record, page.availability).map((item) => item.label);
    expect(labels.length).toBeGreaterThan(0);

    const root = await renderHast(page, apiLinkify([page]), { combinedMarkers: true });
    const items = hastElements(
      root,
      (element) => element.tagName === "li" && hastClasses(element).join(" ") === "api-overload",
    );
    const stringItem = items.find((item) =>
      hastText(item).includes("(name: string, value: string)"),
    );
    const numberItem = items.find((item) =>
      hastText(item).includes("(name: string, value: number)"),
    );
    expect(stringItem).toBeDefined();
    expect(numberItem).toBeDefined();

    const [list] = hastByClass(stringItem, "api-availability");
    expect(list).toBeDefined();
    expect(availabilityLines(list ? [list] : []).map((line) => line.text)).toEqual(labels);
    expect(stringItem && toHtml(stringItem)).toContain(
      `data-span-oldest="${record.availableIn.at(-1)}"`,
    );
    expect(numberItem && toHtml(numberItem)).not.toContain('class="api-availability"');
  });
});

describe("function-level markers on the canonical go page", () => {
  const page = canonicalApiPages(REAL_TYPES_DIR).find((p) => p.namespace === "go");
  if (!page) throw new Error("no canonical go page");
  const heading = overloadHeading(groupFor(page, "go.property"));
  let root: HastRoot;
  let headingLine = "";
  beforeAll(async () => {
    root = await renderHast(page, apiLinkify([page]), { combinedMarkers: true });
    const found = symbolBlocks(root).find(
      (block) => block.heading.tagName === "h3" && headingText(block.heading) === heading,
    );
    headingLine = found ? toHtml(found.heading) : "";
  }, 60_000);
  const categoryDots = (line: string): string[] =>
    [
      ...line.matchAll(
        /<span class="api-badge-dot api-badge-dot--(?:new|changed|deprecated)"[^>]*>[^<]*<\/span>/g,
      ),
    ].map((m) => m[0]);
  const visible = (line: string, kind: string): boolean =>
    categoryDots(line).some((dot) => dot.includes(`--${kind}"`) && !dot.includes("display:none"));

  test("the go.property heading reads Changed and never New", () => {
    expect(headingLine).not.toBe("");
    expect(visible(headingLine, "changed")).toBe(true);
    expect(headingLine).not.toContain("api-badge-dot--new");
    const cats = headingLine.match(/class="api-symbol-span"[^>]*data-span-cats="([^"]*)"/)?.[1];
    expect(cats).toBeDefined();
    expect(cats).not.toContain("N");
  });

  test("the string form keeps its own New dot", () => {
    const stringLine = overloadForms(blockOf(root, heading))
      .map((form) => elementChildren(form)[0])
      .find((line) => hastText(line).includes("(name: string, value: string)"));
    expect(stringLine).toBeDefined();
    expect(visible(stringLine ? toHtml(stringLine) : "", "new")).toBe(true);
  });

  test("the go.property overview card carries the heading's dots", () => {
    const card = overviewCards(root).find(
      (candidate) => candidate.code !== undefined && hastOutlineText(candidate.code) === heading,
    );
    const cardLine = card ? bulletLine(card.item) : "";
    expect(cardLine).not.toBe("");
    expect(categoryDots(cardLine)).toEqual(categoryDots(headingLine));
    expect(categoryDots(cardLine).length).toBeGreaterThan(0);
  });
});

describe("overload added/removed summary", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const pageOf = (namespace: string): ApiPage => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`no canonical ${namespace} page`);
    return page;
  };
  const renders = new Map<ApiPage, Promise<HastRoot>>();
  const render = (page: ApiPage): Promise<HastRoot> => {
    let root = renders.get(page);
    if (root === undefined) {
      root = renderHast(page, apiLinkify([page]), { combinedMarkers: true });
      renders.set(page, root);
    }
    return root;
  };
  // The block body ahead of its form list, where a block-level summary sits.
  const lead = async (page: ApiPage, name: string): Promise<Element[]> => {
    const block = blockOf(await render(page), overloadHeading(groupFor(page, name)));
    const forms = aroundForms(block);
    expect(forms.found).toBe(true);
    return forms.lead;
  };
  const SUMMARY = /\boverloads? (?:added|removed) in Defold\b/;

  test("go.property opens with one line naming the overload its string form added", async () => {
    const page = pageOf("go");
    const stringForm = groupFor(page, "go.property").find((s) =>
      s.signature.includes("(name: string, value: string)"),
    );
    const added = stringForm?.availability?.availableIn.at(-1);
    expect(added).toBeDefined();
    expect(lists(await lead(page, "go.property"))).toEqual([
      [`1 overload added in Defold ${added}`],
    ]);
  });

  test("the go.property count pill counts its live forms", async () => {
    const page = pageOf("go");
    const forms = groupFor(page, "go.property");
    expect(forms.length).toBeGreaterThan(1);
    const heading = symbolBlocks(await render(page)).find(
      (block) =>
        block.heading.tagName === "h3" && headingText(block.heading) === overloadHeading(forms),
    )?.heading;
    expect(heading ? toHtml(heading) : "").toContain(
      `<span class="api-overload-count" data-toc-text="...">${forms.length} overloads</span>`,
    );
  });

  // The one-signature block a function whose signature changed renders under,
  // the `Signature changed` lines in it, and the release the current form
  // arrived in, which is the release those lines name.
  const revised = async (page: ApiPage, name: string) => {
    const newest = page.availability?.versions[0] ?? "";
    const current = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.name === name && s.availability?.availableIn.includes(newest),
    );
    expect(current).toHaveLength(1);
    const signature = current[0]?.signature ?? "";
    const root = await render(page);
    const headings = symbolBlocks(root)
      .filter(
        (block) => block.heading.tagName === "h3" && headingText(block.heading).startsWith(name),
      )
      .map((block) => block.heading);
    const block = blockOf(root, signature);
    return {
      headings,
      block,
      changed: historyLines(block).filter((l) => l.text.startsWith("Signature changed in Defold ")),
      arrived: bareId(current[0]?.availability?.availableIn.at(-1) ?? ""),
    };
  };

  test("b2d.get_world renders one signature with one Signature changed line", async () => {
    const page = pageOf("b2d");
    const { headings, block, changed, arrived } = await revised(page, "b2d.get_world");
    expect(headings).toHaveLength(1);
    const headingLine = headings[0] ? toHtml(headings[0]) : "";
    expect(headingLine).not.toContain("api-overload-count");
    expect(headingLine).not.toContain("api-badge-dot--new");
    expect(block.nodes.flatMap((node) => hastByClass(node, "api-overloads"))).toEqual([]);
    expect(blockText(block)).not.toMatch(SUMMARY);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.text).toStartWith(
      `Signature changed in Defold ${arrived} — before: (): Opaque<"b2World">`,
    );
    expect(changed[0]?.html).toStartWith(
      `Signature changed in Defold ${arrived} — before: <code>${escaped('(): Opaque<"b2World">')}</code>`,
    );
  });

  test("b2d.get_world reads its whole revision chain's availability", async () => {
    const page = pageOf("b2d");
    const axis = (page.availability?.versions ?? []).map(bareId);
    const newest = page.availability?.versions[0] ?? "";
    const rows = apiModuleSymbols(page, page.translations, page.signatures).filter(
      (s) => s.name === "b2d.get_world",
    );
    const current = rows.find((s) => s.availability?.availableIn.includes(newest));
    expect(current?.availability).toBeDefined();
    const newestOnly = current?.availability
      ? availabilityItems(current.availability, page.availability).map((i) => i.label)
      : [];
    expect(newestOnly.length).toBeGreaterThan(0);
    const { headings, block } = await revised(page, "b2d.get_world");
    const listed = lists(block.nodes).flat();
    for (const label of newestOnly) expect(listed).not.toContain(label);

    const axisIndex = (version: string): number => axis.indexOf(bareId(version));
    const oldestOf = (versions: readonly string[]): string =>
      [...versions].sort((a, b) => axisIndex(b) - axisIndex(a))[0] ?? "";
    const chainOldest = oldestOf(rows.flatMap((s) => s.availability?.availableIn ?? []));
    const ownOldest = oldestOf(current?.availability?.availableIn ?? []);
    expect(axisIndex(chainOldest)).toBeGreaterThan(axisIndex(ownOldest));
    const [span] = hastByClass(headings[0], "api-symbol-span");
    expect(span?.properties.dataSpanOldest).toBe(chainOldest);
    expect(span?.properties.dataSpanNewest).toBe(newest);
  });

  test("json.decode renders one signature with one Signature changed line and no summary", async () => {
    const page = pageOf("json");
    const { headings, block, changed, arrived } = await revised(page, "json.decode");
    expect(headings).toHaveLength(1);
    expect(headings[0] ? toHtml(headings[0]) : "").not.toContain("api-overload-count");
    expect(blockText(block)).not.toMatch(SUMMARY);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.text).toStartWith(`Signature changed in Defold ${arrived} — before: `);
  });

  test("an overload removed before the newest version is uncounted history", async () => {
    const AXIS = ["1.13.2", "1.13.1", "1.13.0", "1.12.4"];
    const param = (name: string) => ({ name, doc: "", types: ["number"], isOptional: false });
    const fn = (params: string[]): ApiFunction => ({
      name: "demo.shift",
      brief: "",
      description: "Shifts.",
      parameters: params.map(param),
      returnValues: [],
    });
    const always = fn(["a"]);
    const gone = fn(["a", "b"]);
    const records: ApiAvailability[] = [
      [always, AXIS],
      [gone, ["1.13.0", "1.12.4"]],
    ].map(([f, availableIn]) => ({
      identity: {
        namespace: "demo",
        kind: "FUNCTION",
        name: "demo.shift",
        signature: normalizedFunctionSignature(f as ApiFunction),
      },
      availableIn: availableIn as string[],
    }));
    const page: ApiPage = {
      namespace: "demo",
      route: "/api/demo",
      brief: "",
      module: {
        namespace: "demo",
        brief: "",
        description: "",
        functions: [always, gone],
        variables: [],
        constants: [],
        properties: [],
        typedefs: [],
      },
      translations: {},
      signatures: {},
      category: "engine",
      availability: {
        versions: AXIS,
        records: new Map(records.map((r) => [symbolIdentityKey(r.identity), r])),
        transitions: signatureTransitionNames(records, AXIS),
      },
    };
    const root = await renderHast(page, noLink, { combinedMarkers: true });
    const block = blockOf(root, "demo.shift(a: number)");
    expect(toHtml(root)).not.toContain("api-overload-count");
    expect(block.nodes.flatMap((node) => hastByClass(node, "api-overloads"))).toEqual([]);
    expect(lists(block.nodes)[0]).toEqual(["1 overload removed in Defold 1.13.1"]);
    expect(
      historyLines(block)
        .filter((l) => l.text.startsWith("Removed in Defold 1.13.1: "))
        .map((l) => l.html),
    ).toEqual([
      expect.stringMatching(
        /^Removed in Defold 1\.13\.1: <code>\(a: number, b: number\)<\/code> <span class="api-symbol-span" data-span-oldest="1\.12\.4" data-span-newest="1\.13\.0"/,
      ),
    ]);
  });

  for (const [namespace, name] of [
    ["go", "go.get"],
    ["msg", "msg.url"],
    ["vmath", "vmath.lerp"],
  ] as const) {
    test(`${name}, whose forms share one span, carries no summary`, async () => {
      expect((await lead(pageOf(namespace), name)).map(hastText).join("")).not.toMatch(SUMMARY);
    });
  }

  test("the go.property heading id and text stay the anchor the overview links", async () => {
    const page = pageOf("go");
    const group = groupFor(page, "go.property");
    const root = await render(page);
    const card = overviewCards(root).find(
      (candidate) =>
        candidate.code !== undefined &&
        hastOutlineText(candidate.code) === functionAnchorText(group),
    );
    expect(card?.href.startsWith("#")).toBe(true);
    const heading = hastHeadings(root).find((h) => `#${h.id}` === card?.href);
    expect(heading).toBeDefined();
    expect(heading?.text.startsWith(overloadHeading(group))).toBe(true);
    expect(heading?.text ?? "").not.toMatch(SUMMARY);
  });
});

describe("slot name emphasis", () => {
  const NEWTRY =
    "socket.newtry(finalizer?: () => void): <T>(value: T | undefined, ...rest: T extends { readonly __tstlMultiReturn: unknown } ? [boxedMultiReturn: never] : unknown[]) => T";
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const renders = new Map<string, Promise<HastRoot>>();
  const render = (namespace: string): Promise<HastRoot> => {
    const page = pages.find((p) => p.namespace === namespace);
    if (!page) throw new Error(`namespace ${namespace} missing from the canonical surface`);
    let root = renders.get(namespace);
    if (root === undefined) {
      root = renderHast(page, noLink, { combinedMarkers: true });
      renders.set(namespace, root);
    }
    return root;
  };
  const names = (type: Element | undefined) => hastByClass(type, "api-name").map(hastText);

  test("a parameter bullet bolds its name", async () => {
    expect(blockHtml(blockOf(await render("socket"), NEWTRY))).toContain(
      `<li>${nameCode("finalizer")}?:`,
    );
  });

  test("a function-typed return bolds its name and its type's parameter names, nothing else", async () => {
    const block = blockOf(await render("socket"), NEWTRY);
    const bullet = block.nodes
      .flatMap((node) => hastElements(node, isSlotBullet))
      .find((item) => bulletLine(item).startsWith(`${nameCode("try")}:`));
    const [type] = hastByClass(bullet, "api-type");
    expect(type).toBeDefined();
    expect(names(type)).toEqual(["value", "...rest"]);
    expect(
      (type ? toHtml(type) : "")
        .replaceAll('<strong class="api-name">', "")
        .replaceAll("</strong>", ""),
    ).toBe(typeCode(NEWTRY.slice(NEWTRY.indexOf("): ") + "): ".length)));
  });

  test("a nested field bullet carries no name emphasis", async () => {
    const root = await render("liveupdate");
    const nested = hastElements(root, isSlotBullet)
      .flatMap((item) =>
        elementChildren(item)
          .filter((element) => element.tagName === "ul")
          .flatMap((list) => elementChildren(list)),
      )
      .filter((item) => elementChildren(item)[0]?.tagName === "code")
      .map(bulletLine);
    expect(nested.length).toBeGreaterThan(0);
    expect(nested.filter((line) => line.includes('<strong class="api-name">'))).toEqual([]);
    expect(
      hastElements(root, isSlotBullet).some((item) =>
        bulletLine(item).startsWith(nameCode("callback")),
      ),
    ).toBe(true);
  });

  test("Parameters and Returns are slot labels, never bold text", async () => {
    const root = await render("socket");
    expect(slotLabels(root, "Parameters").length).toBeGreaterThan(0);
    expect(slotLabels(root, "Returns").length).toBeGreaterThan(0);
    const bold = hastElements(root, (element) => element.tagName === "strong").map(hastText);
    expect(bold).not.toContain("Parameters");
    expect(bold).not.toContain("Returns");
  });
});

describe("a renamed engine type shows its Defold name", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const linkify = apiLinkify(pages);
  const renders = new Map<string, Promise<HastRoot>>();
  const pageFor = (namespace: string): Promise<HastRoot> => {
    const page = pages.find((candidate) => candidate.namespace === namespace);
    if (page === undefined) throw new Error(`no canonical ${namespace} page`);
    let root = renders.get(namespace);
    if (root === undefined) {
      root = renderHast(page, linkify);
      renders.set(namespace, root);
    }
    return root;
  };
  const isLuaBadge = (node: Element["children"][number]): boolean =>
    node.type === "element" &&
    hastClasses(node).includes("platform-badge") &&
    hastElements(node, (element) => element.properties.ariaLabel === "Lua").length > 0;
  // A rendered Defold reference line read back as the Markdown `defoldRefLine`
  // writes, when it is exactly the Lua badge, a space and the link around the
  // reference's own name; any other line reads as its HTML.
  const refLine = (line: Element | undefined): string => {
    const [badge, space, link] = line?.children ?? [];
    const [code, ...rest] = link?.type === "element" ? link.children : [];
    if (
      line?.children.length === 3 &&
      badge !== undefined &&
      isLuaBadge(badge) &&
      space?.type === "text" &&
      space.value === " " &&
      link?.type === "element" &&
      link.tagName === "a" &&
      code?.type === "element" &&
      code.tagName === "code" &&
      rest.length === 0
    ) {
      return `[icon:lua] [\`${hastText(code)}\`](${String(link.properties.href)})`;
    }
    return line ? toHtml(line) : "";
  };
  // The body of the type row whose heading opens with `opening`, at either row
  // depth, up to the next heading.
  const rowBody = (root: HastRoot, opening: string): Element[] =>
    elementChildren(blockStarting(root, opening).body);

  test("a renamed union's row opens its body with a Lua badge and the reference's own name linked to its entry", async () => {
    const gui = await pageFor("gui");
    expect(refLine(rowBody(gui, "type gui.Easing =")[0])).toBe(
      "[icon:lua] [`gui.EASING`](https://defold.com/ref/gui-lua#gui.EASING)",
    );
    expect(refLine(rowBody(gui, "type gui.PieBounds =")[0])).toBe(
      "[icon:lua] [`gui.PIEBOUNDS`](https://defold.com/ref/gui-lua#gui.PIEBOUNDS)",
    );
    expect(refLine(rowBody(await pageFor("b2d.shape"), "type b2d.shape.ShapeType =")[0])).toBe(
      "[icon:lua] [`b2d.shape.SHAPE_TYPE`](https://defold.com/ref/b2d.shape-lua#b2d.shape.SHAPE_TYPE)",
    );
  });

  test("a renamed shape's row opens its body with the reference's own name, a nested one anchored by its element name", async () => {
    expect(refLine(rowBody(await pageFor("sys"), "interface sys.SysInfo {")[0])).toBe(
      "[icon:lua] [`sys.sys_info`](https://defold.com/ref/sys-lua#sys.sys_info)",
    );
    expect(refLine(rowBody(await pageFor("go"), "interface go.on_input.Action {")[0])).toBe(
      "[icon:lua] [`go.on_input.action`](https://defold.com/ref/go-lua#on_input.action)",
    );
  });

  // The type row headings on a page that open with `opening`.
  const rowHeadings = (root: HastRoot, opening: string): string[] =>
    symbolBlocks(root)
      .map((block) => headingText(block.heading))
      .filter((text) => text.startsWith(opening));

  test("a renamed handle renders one row, with its methods, under the reference's own name anchored by its element name", async () => {
    const socket = await pageFor("socket");
    const client = rowHeadings(socket, "interface socket.SocketClient {");
    expect(client.length).toBe(1);
    expect(client[0]).toContain("send(data: string");
    expect(rowHeadings(socket, "interface socket.socket_client")).toEqual([]);
    expect(refLine(rowBody(socket, "interface socket.SocketClient {")[0])).toBe(
      "[icon:lua] [`socket.socket_client`](https://defold.com/ref/socket-lua#socket_client)",
    );
    const gui = await pageFor("gui");
    expect(rowHeadings(gui, "type gui.Node =").length).toBe(1);
    expect(rowHeadings(gui, "type gui.node")).toEqual([]);
    expect(refLine(rowBody(gui, "type gui.Node =")[0])).toBe(
      "[icon:lua] [`gui.node`](https://defold.com/ref/gui-lua#node)",
    );
  });

  test("an alias of a core global renders no row", async () => {
    const vmath = await pageFor("vmath");
    const resource = await pageFor("resource");
    expect([
      ...rowHeadings(vmath, "type vmath.vector ="),
      ...rowHeadings(vmath, "type vmath.Vector ="),
      ...rowHeadings(resource, "type resource.resource_data ="),
      ...rowHeadings(resource, "type resource.ResourceData ="),
    ]).toEqual([]);
  });

  test("a type the reference does not name, or names the same, carries no Defold name", async () => {
    const lua = (body: Element[]) =>
      body.flatMap((element) => hastElements(element, (child) => isLuaBadge(child)));
    expect(lua(rowBody(await pageFor("render"), "type render.ClearBufferKey ="))).toEqual([]);
    expect(lua(rowBody(await pageFor("b2d.body"), "type b2d.body.B2 ="))).toEqual([]);
  });

  test("every engine page gives each type carrying a Defold name exactly one linked line", async () => {
    const engine = pages.filter((page) => page.category === "engine");
    let total = 0;
    for (const page of engine) {
      const expected = apiModuleSymbols(page)
        .flatMap((symbol) =>
          symbol.kind === "type" && symbol.defoldRef ? [defoldRefLine(symbol.defoldRef)] : [],
        )
        .sort();
      const rendered = hastElements(
        await pageFor(page.namespace),
        (element) =>
          (element.tagName === "p" || element.tagName === "li") &&
          element.children.some(isLuaBadge),
      )
        .map(refLine)
        .sort();
      expect({ page: page.namespace, lines: rendered }).toEqual({
        page: page.namespace,
        lines: expected,
      });
      total += expected.length;
    }
    expect(total).toBeGreaterThan(0);
  }, 120_000);

  test("the line renders as the Lua badge followed by an external link around the reference name", async () => {
    const gui = pages.find((page) => page.namespace === "gui");
    if (gui === undefined) throw new Error("no canonical gui page");
    const ref = apiModuleSymbols(gui).find((symbol) => symbol.name === "Easing")?.defoldRef;
    if (ref === undefined) throw new Error("gui.Easing carries no Defold name");
    const [line] = hastElements(
      await pageFor("gui"),
      (element) =>
        element.tagName === "p" &&
        hastElements(element, (child) => child.tagName === "a" && child.properties.href === ref.url)
          .length > 0,
    );
    const html = line ? toHtml(line) : "";
    const badge = html.indexOf('aria-label="Lua"');
    const anchor = html.indexOf('<a href="https://defold.com/ref/gui-lua#gui.EASING"');
    expect(badge).toBeGreaterThanOrEqual(0);
    expect(anchor).toBeGreaterThan(badge);
    const link = html.slice(anchor, html.indexOf("</a>", anchor));
    // An absolute href is what Fumadocs' link renders as an external link.
    expect(ref.url).toMatch(/^\w+:/);
    expect(link.slice(link.indexOf(">") + 1)).toStartWith("<code>gui.EASING</code>");
  });
});

describe("apiPageTree", () => {
  const pages = canonicalApiPages(REAL_TYPES_DIR);
  const image = pages.find((p) => p.namespace === "image");
  if (!image) throw new Error("no canonical image page");
  // The image page carries overload blocks and re-signatured forms, but no
  // availability list: each of its revision chains spans the whole axis. A
  // deprecated callback-taking function, whose tag renders one, and a shape with
  // members complete the fixture.
  const page: ApiPage = {
    ...image,
    module: {
      ...image.module,
      functions: [
        ...image.module.functions,
        {
          name: "image.on_load",
          brief: "",
          description: "Calls back once loaded.",
          deprecated: "Use `image.load`.",
          parameters: [
            {
              name: "callback",
              doc: "called once loaded",
              types: ["(self: object, ok: boolean) => void"],
              isOptional: false,
            },
          ],
          returnValues: [],
        },
      ],
      typedefs: [
        ...image.module.typedefs,
        {
          name: "Loader",
          functions: [
            {
              name: "load",
              brief: "",
              description: "Loads a path.",
              parameters: [{ name: "path", doc: "the path", types: ["string"], isOptional: false }],
              returnValues: [],
            },
          ],
          properties: [{ name: "ready", brief: "", description: "Done.", types: ["boolean"] }],
        },
      ],
    },
  };
  const linkify = apiLinkify(pages);

  test("the tree writes no raw HTML", () => {
    const html: string[] = [];
    const walk = (node: MdastNodes): void => {
      if (node.type === "html") html.push(node.value);
      if ("children" in node) for (const child of node.children) walk(child);
    };
    walk(apiPageTree(page, linkify, { combinedMarkers: true }));
    expect(html).toEqual([]);
  });

  test("the rendered page keeps the DOM shape the filter, the tooltips and the stylesheet read", async () => {
    const { hast } = await renderApiPage(page, linkify, { combinedMarkers: true });

    const siblings = withSiblings(hast);
    const bodies = siblings.filter(({ element }) =>
      hastClasses(element).includes("api-symbol-body"),
    );
    expect(bodies.length).toBeGreaterThan(0);
    for (const { element, prev } of bodies) {
      expect(element.tagName).toBe("div");
      expect(isSignatureHeading(prev)).toBe(true);
    }
    // A receiver group heading is colored like a signature and heads its own
    // overview, not a symbol body.
    for (const { next } of siblings.filter(({ element }) => isSignatureHeading(element))) {
      if (next && !/^h[1-6]$/.test(next.tagName) && !hastClasses(next).includes("api-overview")) {
        expect(hastClasses(next)).toContain("api-symbol-body");
      }
    }

    const labels = hastByClass(hast, "api-slot-label");
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.tagName).toBe("p");
      expect(["Parameters", "Returns"]).toContain(hastText(label));
    }

    const overloads = hastByClass(hast, "api-overloads");
    expect(overloads.length).toBeGreaterThan(0);
    for (const list of overloads) {
      expect(list.tagName).toBe("ol");
      for (const item of elementChildren(list)) {
        expect(item.tagName).toBe("li");
        expect(hastClasses(item)).toEqual(["api-overload"]);
      }
    }

    const revisions = hastByClass(hast, "api-revisions");
    expect(revisions.length).toBeGreaterThan(0);
    for (const list of revisions) {
      expect(list.tagName).toBe("ul");
      for (const item of elementChildren(list)) {
        expect(item.tagName).toBe("li");
        expect(hastClasses(item)).toEqual(["api-overload", "api-overload--revision"]);
      }
    }

    const availability = hastByClass(hast, "api-availability");
    expect(availability.length).toBeGreaterThan(0);
    for (const block of availability) {
      expect(block.tagName).toBe("div");
      expect(block.properties.ariaLabel).toBe("Availability");
      const items = hastElements(block, (element) => element.tagName === "li");
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const [first] = item.children;
        const lead = first?.type === "element" ? first : undefined;
        expect(lead?.tagName).toBe("span");
        expect(hastClasses(lead)[0]).toBe("api-availability-mark");
        expect(hastClasses(lead)[1]).toMatch(
          /^api-availability-mark--(new|changed|deprecated|none)$/,
        );
      }
    }

    const types = hastByClass(hast, "api-type");
    expect(types.length).toBeGreaterThan(0);
    for (const code of types) expect(code.tagName).toBe("code");
    const callback = types.find((code) => hastText(code).startsWith("(self: object"));
    expect(hastByClass(callback, "api-name").map((name) => [name.tagName, hastText(name)])).toEqual(
      [
        ["strong", "self"],
        ["strong", "ok"],
      ],
    );

    const shape = hastElements(
      hast,
      (element) => element.tagName === "h3" && hastText(element) === "image.Loader",
    );
    expect(shape).toHaveLength(1);
  });
});
