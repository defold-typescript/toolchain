import type { TOCItemType } from "fumadocs-core/toc";
import type { Element, ElementContent, Nodes, Parents, Properties, Root } from "hast";
import type {
  Nodes as MdastNodes,
  Parent as MdastParent,
  Root as MdastRoot,
  RootContent,
} from "mdast";
import type { VFile } from "vfile";
import {
  API_TYPE_CLASS,
  OVERLOAD_COUNT_CLASS,
  SIGNATURE_CLASS,
  SIGNATURE_PREFIX_PROPERTY,
} from "./api-nodes";
import { hastOutlineText } from "./headings";
import { brandWordRegex, type SignatureSymbolTarget } from "./signature-brand-links";
import {
  getHighlighter,
  runStyle,
  type SignatureRun,
  signatureTokens,
  spliceRuns,
} from "./signature-tokens";
import { isSafeLink, restoreUpstreamText } from "./upstream-text";

function hasClass(node: ElementContent | undefined, name: string): node is Element {
  if (node?.type !== "element") return false;
  const value = node.properties.className;
  return Array.isArray(value)
    ? value.includes(name)
    : String(value ?? "")
        .split(/\s+/)
        .includes(name);
}

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

function eachElement(node: Nodes, visit: (element: Element, parent: Parents) => void): void {
  if (!("children" in node)) return;
  for (const child of [...node.children]) {
    if (child.type === "element") visit(child, node);
    eachElement(child, visit);
  }
}

function runSpan(run: SignatureRun): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { style: runStyle(run) },
    children: [{ type: "text", value: run.text }],
  };
}

// An overload block's count badge follows its signature's code in the same
// heading or link. It leaves that place for the `...` of the call list, and its
// `data-toc-text` keeps the outline reading `(...)`.
function takeOverloadCount(code: Element, parent: Parents): Element | undefined {
  const siblings = parent.children;
  const index = siblings.indexOf(code);
  const at = siblings.findIndex(
    (child, i) => i > index && hasClass(child as ElementContent, OVERLOAD_COUNT_CLASS),
  );
  const badge = siblings[at];
  if (badge?.type !== "element") return undefined;
  const before = siblings[at - 1];
  const space = at - 1 > index && before?.type === "text" && before.value.trim() === "";
  siblings.splice(space ? at - 1 : at, space ? 2 : 1);
  badge.properties = { ...badge.properties, dataTocText: "..." };
  return badge;
}

/**
 * Colors every signature `code` the API builder marked: its text becomes the
 * token spans `signatureTokens` gives it, with the names in bold, and an
 * overload count beside it moves into its `(...)`.
 */
export function rehypeApiSignatures() {
  return async (tree: Root): Promise<void> => {
    const found: { code: Element; parent: Parents }[] = [];
    eachElement(tree, (element, parent) => {
      if (element.tagName !== "code") return;
      if (typeof element.properties[SIGNATURE_PREFIX_PROPERTY] !== "string") return;
      found.push({ code: element, parent });
    });
    if (found.length === 0) return;
    const highlighter = await getHighlighter();
    for (const { code, parent } of found) {
      const content = textOf(code);
      const prefix = String(code.properties[SIGNATURE_PREFIX_PROPERTY]);
      const { [SIGNATURE_PREFIX_PROPERTY]: _prefix, ...properties } = code.properties;
      code.properties = { ...properties, className: [SIGNATURE_CLASS, "shiki"] };
      const runs = signatureTokens(highlighter, content, prefix);
      const dots = content.indexOf("(...)") + 1;
      const badge = dots > 0 ? takeOverloadCount(code, parent) : undefined;
      if (!badge) {
        code.children = runs.map(runSpan);
        continue;
      }
      const { before, after } = spliceRuns(runs, dots, dots + 3);
      code.children = [...before.map(runSpan), badge, ...after.map(runSpan)];
    }
  };
}

function element(
  tagName: string,
  properties: Properties,
  children: ElementContent[] = [],
): Element {
  return { type: "element", tagName, properties, children };
}

const isSignatureCode = (node: Element): boolean =>
  node.tagName === "code" && hasClass(node, SIGNATURE_CLASS);

function containsSignature(node: Element): boolean {
  return node.children.some(
    (child) => child.type === "element" && (isSignatureCode(child) || containsSignature(child)),
  );
}

// The permalink icon carries no text, so the outline and the label stay the signature.
function anchorIcon(): Element {
  const stroke: Properties = {
    ariaHidden: "true",
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  return element("span", { className: ["heading-anchor-icon"] }, [
    element("svg", stroke, [
      element("path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }),
      element("path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }),
    ]),
  ]);
}

// A signature heading wraps its whole content in its own permalink, so a brand
// link can split it into sibling links; Fumadocs' heading would wrap the brand
// link in a second anchor. `data-anchored` tells the heading component the
// permalink is already there.
function addPermalinks(tree: Root): void {
  eachElement(tree, (heading) => {
    if (!/^h[1-6]$/.test(heading.tagName) || !containsSignature(heading)) return;
    const { id } = heading.properties;
    if (typeof id !== "string") return;
    const label = hastOutlineText(heading).trim();
    heading.children = [
      element(
        "a",
        { className: ["heading-anchor"], href: `#${id}`, ariaLabel: `Permalink to ${label}` },
        [...heading.children, anchorIcon()],
      ),
    ];
    heading.properties = { ...heading.properties, dataAnchored: "" };
  });
}

// A heading target names a heading the page renders, whose id is only known
// once the run has minted it; the last heading with that text is the target's
// own, since a shape heading follows every section heading that could share its
// text. A target naming no heading leaves its token as text.
function resolveTargets(
  links: ReadonlyMap<string, SignatureSymbolTarget>,
  toc: readonly TOCItemType[],
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const [name, target] of links) {
    if (typeof target === "string") {
      resolved.set(name, target);
      continue;
    }
    const item = toc.findLast((entry) => entry.title === target.heading);
    if (item) resolved.set(name, `${target.route}${item.url}`);
  }
  return resolved;
}

// A token span of a colored signature: its theme style and its one text.
function tokenOf(node: ElementContent): { style: string; text: string } | undefined {
  if (node.type !== "element" || node.tagName !== "span") return undefined;
  const { style, ...rest } = node.properties;
  if (typeof style !== "string" || Object.keys(rest).length > 0) return undefined;
  if (!node.children.every((child) => child.type === "text")) return undefined;
  return { style, text: textOf(node) };
}

// An anchor whose first child is a signature code, split around each linked
// token into sibling anchors: the anchor's own properties around every other
// fragment, the token in its own `signature-symbol-link`, and the anchor's
// trailing content (chips, the permalink icon) after the last fragment.
function splitAnchor(
  anchor: Element,
  code: Element,
  links: ReadonlyMap<string, string>,
  tokenRe: RegExp,
): Element | undefined {
  const tail = anchor.children.slice(1);
  const codeOf = (children: ElementContent[]): Element =>
    element("code", { ...code.properties }, children);
  const fragment = (children: ElementContent[], trailing: ElementContent[]): Element =>
    element("a", { ...anchor.properties }, [codeOf(children), ...trailing]);
  const span = (style: string, text: string): Element =>
    element("span", { style }, [{ type: "text", value: text }]);
  const out: Element[] = [];
  let pending: ElementContent[] = [];
  let found = false;
  for (const child of code.children) {
    const token = tokenOf(child);
    if (!token) {
      pending.push(child);
      continue;
    }
    let last = 0;
    for (const match of token.text.matchAll(tokenRe)) {
      found = true;
      const name = match[0];
      const before = token.text.slice(last, match.index);
      if (before) pending.push(span(token.style, before));
      if (pending.length > 0) out.push(fragment(pending, []));
      pending = [];
      out.push(
        element("a", { className: ["signature-symbol-link"], href: links.get(name) ?? "" }, [
          codeOf([span(token.style, name)]),
        ]),
      );
      last = match.index + name.length;
    }
    const rest = token.text.slice(last);
    if (rest) pending.push(span(token.style, rest));
  }
  if (!found) return undefined;
  if (pending.length > 0 || tail.length > 0) out.push(fragment(pending, tail));
  return element("span", { className: ["signature-split"] }, out);
}

function splitSignatureAnchors(tree: Root, links: ReadonlyMap<string, string>): void {
  const tokenRe = brandWordRegex([...links.keys()]);
  eachElement(tree, (anchor, parent) => {
    const [first] = anchor.children;
    if (anchor.tagName !== "a" || first?.type !== "element" || !isSignatureCode(first)) return;
    const split = splitAnchor(anchor, first, links, tokenRe);
    if (split) parent.children[parent.children.indexOf(anchor)] = split;
  });
}

function linkTokensIn(parent: Element, links: ReadonlyMap<string, string>, tokenRe: RegExp): void {
  parent.children = parent.children.flatMap((child): ElementContent[] => {
    if (child.type === "element") linkTokensIn(child, links, tokenRe);
    if (child.type !== "text") return [child];
    const out: ElementContent[] = [];
    let last = 0;
    for (const match of child.value.matchAll(tokenRe)) {
      const name = match[0];
      if (match.index > last)
        out.push({ type: "text", value: child.value.slice(last, match.index) });
      out.push(
        element("a", { className: ["api-type-link"], href: links.get(name) ?? "" }, [
          { type: "text", value: name },
        ]),
      );
      last = match.index + name.length;
    }
    if (last === 0) return [child];
    if (last < child.value.length) out.push({ type: "text", value: child.value.slice(last) });
    return out;
  });
}

function eachMdast(node: MdastNodes, visit: (node: MdastNodes) => void): void {
  visit(node);
  if ("children" in node) for (const child of node.children) eachMdast(child, visit);
}

/**
 * A link whose target `isSafeLink` rejects renders as its label, whether its
 * target is inline or a reference's definition, and such a definition goes.
 * Third-party library text reaches the page through the pipeline, so a
 * `javascript:` target in it must not become a link.
 */
export function remarkSafeLinks() {
  return (tree: MdastRoot): void => {
    const unsafe = new Set<string>();
    eachMdast(tree, (node) => {
      if (node.type === "definition" && !isSafeLink(node.url)) unsafe.add(node.identifier);
    });
    const strip = (node: MdastNodes): void => {
      if (!("children" in node)) return;
      const parent: MdastParent = node;
      parent.children = parent.children.flatMap((child): RootContent[] => {
        strip(child);
        if (child.type === "link" && !isSafeLink(child.url)) return child.children;
        if (child.type === "linkReference" && unsafe.has(child.identifier)) return child.children;
        if (child.type === "definition" && !isSafeLink(child.url)) return [];
        return [child];
      });
    };
    strip(tree);
  };
}

/**
 * Puts back each `<` that `escapeUpstreamText` replaced, as text: the pipeline
 * has parsed every element by now, so the character cannot open one.
 */
export function rehypeUpstreamMarkers() {
  const restore = (node: Nodes): void => {
    if (node.type === "text") node.value = restoreUpstreamText(node.value);
    if ("children" in node) for (const child of node.children) restore(child);
  };
  return (tree: Root): void => restore(tree);
}

/**
 * Gives each signature heading its permalink, then links the tokens
 * `signatureSymbolLinks` names: in a signature, by splitting its permalink or
 * overview link into sibling links, since anchors cannot nest; in a parameter,
 * return or field type, inside its `code.api-type`, by qualified (dotted) keys
 * only, since a bare key such as `node` would link inside the string literal of
 * `Opaque<"node">`. Hrefs stay root-absolute; the link component adds the base.
 */
export function rehypeApiLinks(
  options: { signatureSymbolLinks?: ReadonlyMap<string, SignatureSymbolTarget> | undefined } = {},
) {
  return (tree: Root, file: VFile): void => {
    addPermalinks(tree);
    const links = resolveTargets(options.signatureSymbolLinks ?? new Map(), file.data.toc ?? []);
    if (links.size === 0) return;
    splitSignatureAnchors(tree, links);
    const qualified = new Map([...links].filter(([name]) => name.includes(".")));
    if (qualified.size === 0) return;
    const tokenRe = brandWordRegex([...qualified.keys()]);
    eachElement(tree, (code) => {
      if (code.tagName === "code" && hasClass(code, API_TYPE_CLASS)) {
        linkTokensIn(code, qualified, tokenRe);
      }
    });
  };
}
