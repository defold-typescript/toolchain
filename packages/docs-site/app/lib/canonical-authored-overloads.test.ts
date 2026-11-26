import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { apiLinkify, renderApiPage } from "@defold-typescript/docs-render/api-page-render";
import {
  type ApiSymbol,
  apiModuleSections,
  apiModuleSymbols,
  splitCallForm,
} from "@defold-typescript/docs-render/api-surface";
import {
  type CombinedNamespace,
  combinedAuthoritativeSignatures,
  combinedNamespaceToApiPage,
} from "@defold-typescript/docs-render/combined-surface";
import { hastOutlineText } from "@defold-typescript/docs-render/headings";
import {
  loadCombinedSurface,
  loadSignaturesArtifact,
} from "@defold-typescript/docs-render/toolchain-surface-loader";
import { windowCombinedSurface } from "@defold-typescript/docs-render/version-window";
import {
  availabilityLabel,
  type SignatureStore,
  symbolIdentityKey,
} from "@defold-typescript/types";
import type { Element, Nodes, Root } from "hast";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// `symbolIdentityKey` joins its fields with NUL.
const IDENTITY_SEP = String.fromCharCode(0);

const combined = loadCombinedSurface(REAL_TYPES_DIR);
const pages = combined.namespaces.map(combinedNamespaceToApiPage);
const linkify = apiLinkify(pages);

const renderedOf = new Map<CombinedNamespace, Promise<Root>>();

function renderedFor(ns: CombinedNamespace): Promise<Root> {
  let tree = renderedOf.get(ns);
  if (tree === undefined) {
    tree = renderApiPage(combinedNamespaceToApiPage(ns), linkify).then((page) => page.hast);
    renderedOf.set(ns, tree);
  }
  return tree;
}

function classes(element: Element): string[] {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/);
}

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

function firstElement(node: Nodes, match: (element: Element) => boolean): Element | undefined {
  if (!("children" in node)) return undefined;
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (match(child)) return child;
    const found = firstElement(child, match);
    if (found) return found;
  }
  return undefined;
}

const isSignature = (element: Element): boolean =>
  element.tagName === "code" && classes(element).includes("api-signature");

const isSymbolHeading = (element: Element): boolean => /^h[34]$/.test(element.tagName);

// A live form of an overload block; a replaced or removed form's history line
// carries the `api-overload--revision` class as well.
const isForm = (element: Element): boolean =>
  element.tagName === "li" && classes(element).join(" ") === "api-overload";

// The signature a symbol heading names, reading its count badge as the `...` it
// stands over.
function headingSignature(heading: Element): string | undefined {
  const code = firstElement(heading, isSignature);
  return code && hastOutlineText(code);
}

// A form line's code: the signature code of the item's first paragraph.
function formCode(form: Element): string | undefined {
  const [line] = form.children.filter((child): child is Element => child.type === "element");
  const code = line && firstElement(line, isSignature);
  return code && textOf(code);
}

// A signature's call form: its name through the `)` closing its call list, with
// the return type dropped. An overload block states a return type every form
// shares once for the block, so a rendered form and its arm compare on this.
function callForm(signature: string): string {
  const name = /^[^(<]+/.exec(signature)?.[0] ?? "";
  const symbol: ApiSymbol = {
    kind: "function",
    name,
    signature,
    docMarkdown: "",
    parameters: [],
    returnValues: [],
  };
  return name + splitCallForm(symbol).params;
}

// Every call form the page renders, in order: an `h3` signature heading's own
// (`h4` under a receiver heading), or, under an overload block's
// `<fqn>(...)<returns>` heading, each listed form's. The count badge and
// availability dots are not part of the signature.
function renderedCallForms(tree: Root): string[] {
  const out: string[] = [];
  let group: string | null = null;
  const walk = (node: Nodes): void => {
    if (node.type === "element" && isSymbolHeading(node)) {
      const heading = headingSignature(node);
      if (heading === undefined) return;
      const dots = heading.indexOf("(...)");
      group = dots < 0 ? null : heading.slice(0, dots);
      if (group === null) out.push(callForm(heading));
      return;
    }
    if (node.type === "element" && group !== null && isForm(node)) {
      const form = formCode(node);
      if (form !== undefined) out.push(callForm(`${group}${form}`));
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(tree);
  return out;
}

// The top-level nodes from the symbol heading whose signature starts with
// `start` up to the next heading `stop` accepts.
function blockOf(tree: Root, start: string, stop: (element: Element) => boolean): Nodes[] {
  const at = tree.children.findIndex(
    (child) =>
      child.type === "element" &&
      isSymbolHeading(child) &&
      headingSignature(child)?.startsWith(start) === true,
  );
  if (at < 0) return [];
  const next = tree.children.findIndex(
    (child, index) => index > at && child.type === "element" && stop(child),
  );
  return tree.children.slice(at, next < 0 ? undefined : next);
}

function storeFor(namespace: string): SignatureStore | null {
  const path = join(REAL_TYPES_DIR, "signatures", `${namespace}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as SignatureStore;
}

// The headings belonging to one FQN, in render order. An arm may open with a
// type-parameter list (`vmath.lerp<T …>(…)`) as readily as with its call paren.
function armsOf(headings: string[], fqn: string): string[] {
  return headings.filter((h) => {
    if (!h.startsWith(fqn)) return false;
    const after = h.slice(fqn.length);
    return after.startsWith("(") || after.startsWith("<");
  });
}

// Each live form of the overload block headed `<fqn>(...)`: the code its form
// line lists and the text under it.
function overloadForms(tree: Root, fqn: string): { code: string; body: string }[] {
  const forms: { code: string; body: string }[] = [];
  const collect = (node: Nodes): void => {
    if (node.type === "element" && isForm(node)) {
      const [, ...body] = node.children.filter((child) => child.type === "element");
      forms.push({ code: formCode(node) ?? "", body: body.map(textOf).join("\n").trim() });
      return;
    }
    if ("children" in node) for (const child of node.children) collect(child);
  };
  for (const node of blockOf(tree, `${fqn}(...)`, (e) => /^h[2-4]$/.test(e.tagName))) {
    collect(node);
  }
  return forms;
}

function namespaceByName(name: string): CombinedNamespace {
  const ns = combined.namespaces.find((n) => n.namespace === name);
  if (!ns) throw new Error(`no Combined namespace ${name}`);
  return ns;
}

describe("canonical pages render every authored overload arm", () => {
  it("renders each authored arm exactly once, for every store-covered FQN", async () => {
    const missing: string[] = [];
    for (const ns of combined.namespaces) {
      const store = storeFor(ns.namespace);
      if (!store) continue;
      const headings = renderedCallForms(await renderedFor(ns));
      const declared = new Set(ns.module.functions.map((fn) => fn.name));
      for (const [fqn, override] of Object.entries(store)) {
        if (!declared.has(fqn)) continue;
        for (const arm of override.signatures) {
          const count = headings.filter((h) => h === callForm(arm)).length;
          if (count !== 1) missing.push(`${ns.namespace}: ${arm} rendered ${count}x`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("renders both render.render_target arities on /api/render", async () => {
    const headings = renderedCallForms(await renderedFor(namespaceByName("render")));
    expect(headings).toContain(
      callForm(
        'render.render_target(parameters: render.RenderTargetParams): Opaque<"render_target">',
      ),
    );
    expect(headings).toContain(
      callForm(
        'render.render_target(name: string, parameters: render.RenderTargetParams): Opaque<"render_target">',
      ),
    );
  });

  it("renders the authored vmath.euler_to_quat arms and not the generated union", async () => {
    const headings = renderedCallForms(await renderedFor(namespaceByName("vmath")));
    const authored = storeFor("vmath")?.["vmath.euler_to_quat"]?.signatures ?? [];
    expect(authored.length).toBeGreaterThan(1);
    for (const arm of authored) expect(headings).toContain(callForm(arm));
    expect(armsOf(headings, "vmath.euler_to_quat")).toEqual(authored.map(callForm));
  });

  it("accepts every folded artifact value whose namespace is an engine page", () => {
    const artifact = loadSignaturesArtifact(REAL_TYPES_DIR);
    const engineNamespaces = new Map(combined.namespaces.map((ns) => [ns.namespace, ns]));
    const rejected: string[] = [];
    let folded = 0;
    for (const perVersion of Object.values(artifact.versions)) {
      for (const [key, declaration] of Object.entries(perVersion)) {
        const [namespace, kind] = key.split(IDENTITY_SEP);
        // A folded value is the multi-arm form `generate-api-signatures` writes
        // for an authored override. A single-line non-`function ` declaration is
        // the unrelated class-method shape (`socket`'s `getoption(…)`), which has
        // its own render path and no arm to recover.
        if (kind !== "FUNCTION" || !declaration.includes("\n")) continue;
        const ns = namespace ? engineNamespaces.get(namespace) : undefined;
        if (!ns) continue;
        folded++;
        if (!combinedAuthoritativeSignatures(ns).has(key)) rejected.push(`${namespace}: ${key}`);
      }
    }
    expect(folded).toBeGreaterThan(0);
    expect(rejected).toEqual([]);
  });

  it("collapses a multi-identity FQN to one arm set per page", async () => {
    const msg = renderedCallForms(await renderedFor(namespaceByName("msg")));
    const msgUrlArms = storeFor("msg")?.["msg.url"]?.signatures ?? [];
    expect(msgUrlArms.length).toBe(10);
    expect(armsOf(msg, "msg.url")).toEqual(msgUrlArms.map(callForm));

    const vmath = renderedCallForms(await renderedFor(namespaceByName("vmath")));
    const lerpArms = storeFor("vmath")?.["vmath.lerp"]?.signatures ?? [];
    expect(lerpArms.length).toBe(4);
    expect(armsOf(vmath, "vmath.lerp")).toEqual(lerpArms.map(callForm));
  });

  it("renders each Box2D backend form of a world query with its own return and prose", async () => {
    const tree = await renderedFor(namespaceByName("b2d.world"));
    const multi = (hit: string, info: string) => [
      `LuaMultiReturn<[b2d.${hit}[], b2d.TreeStats]>`,
      `LuaMultiReturn<[b2d.${info}[], b2d.TreeStats]>`,
    ];
    const queries: [string, string[]][] = [
      ["b2d.world.cast_ray", multi("FixtureCastHit", "ShapeCastHit")],
      [
        "b2d.world.cast_ray_closest",
        ["b2d.FixtureCastHit | undefined", "b2d.ShapeCastHit | undefined"],
      ],
      ["b2d.world.cast_shape", multi("FixtureCastHit", "ShapeCastHit")],
      ["b2d.world.overlap_aabb", multi("FixtureInfo", "ShapeInfo")],
      ["b2d.world.overlap_shape", multi("FixtureInfo", "ShapeInfo")],
    ];
    for (const [fqn, [v2Return, v3Return]] of queries) {
      const forms = overloadForms(tree, fqn);
      expect({ fqn, count: forms.length }).toEqual({ fqn, count: 2 });
      const [v2, v3] = forms;
      expect(v2?.code).toStartWith('<Backend extends "v2" = "v2">(');
      expect(v2?.code).toEndWith(`): ${v2Return}`);
      expect(v3?.code).toStartWith('<Backend extends "v3">(');
      expect(v3?.code).toEndWith(`): ${v3Return}`);
      expect(v2?.body).not.toBe("");
      expect(v3?.body).not.toBe("");
      expect(v3?.body).not.toContain("Same description as form");
      expect(v2?.body).not.toBe(v3?.body);
    }
    const [castV2, castV3] = overloadForms(tree, "b2d.world.cast_ray");
    expect(castV2?.body).toStartWith("Cast a ray.");
    expect(castV3?.body).toStartWith("The translation is the ray displacement");
  });

  it("dates each Box2D backend form of a world query by the versions declaring it", async () => {
    const ns = namespaceByName("b2d.world");
    const page = combinedNamespaceToApiPage(ns);
    const artifact = loadSignaturesArtifact(REAL_TYPES_DIR);
    const rows = apiModuleSymbols(page, page.translations, page.signatures);
    const tree = await renderedFor(ns);
    const sections = apiModuleSections(page).sections;
    const fqns = [
      "b2d.world.cast_ray",
      "b2d.world.cast_ray_closest",
      "b2d.world.cast_shape",
      "b2d.world.overlap_aabb",
      "b2d.world.overlap_shape",
    ];
    for (const fqn of fqns) {
      const entry = ns.entries.find((e) => e.identity.name === fqn && e.armElements !== undefined);
      if (entry === undefined) throw new Error(`no backend-arm entry for ${fqn}`);
      const key = symbolIdentityKey(entry.identity);
      const nodes = blockOf(tree, `${fqn}(...)`, (e) => e.tagName === "h3");
      const block = nodes.map(textOf).join("\n");
      expect({ fqn, block: nodes.length > 0 }).toEqual({ fqn, block: true });
      const lines = entry.authoritativeSignature.split("\n").filter((line) => line.trim() !== "");
      expect({ fqn, arms: lines.length }).toEqual({ fqn, arms: 2 });
      for (const line of lines) {
        const armVersions = combined.versions.filter((version) =>
          artifact.versions[version]?.[key]?.split("\n").includes(line),
        );
        expect(armVersions.length).toBeGreaterThan(0);
        expect(armVersions.length).toBeLessThan(entry.availableIn.length);
        const typeParams = /^function [\w.]+(<[^(]*>)\(/.exec(line)?.[1] ?? "";
        expect(typeParams).toStartWith("<Backend extends ");
        const head = `${fqn}${typeParams}(`;
        const row = rows.find((symbol) => symbol.signature.startsWith(head));
        expect({ head, availableIn: row?.availability?.availableIn }).toEqual({
          head,
          availableIn: armVersions,
        });
        const armLabel = availabilityLabel(armVersions, combined.versions).label;
        expect(block).toContain(armLabel);
        expect(block).not.toContain(entry.label.label);
        const section = sections.find(
          (s) => s.kind === "function" && s.markdown.includes(`### \`${head}`),
        );
        expect(section?.markdown).toContain(`${armLabel}.`);
        expect(section?.markdown).not.toContain(`${entry.label.label}.`);
      }
    }
  });

  it("leaves a generated symbol on the same page untouched", async () => {
    const headings = renderedCallForms(await renderedFor(namespaceByName("render")));
    expect(headings.some((h) => h.startsWith("render.get_render_target_width("))).toBe(true);
  });

  it("keeps the arms on a windowed page built from the same projection", async () => {
    const axis = combined.versions;
    const window = { from: axis[axis.length - 1] ?? "", to: axis[0] ?? "" };
    const windowed = windowCombinedSurface(
      combined,
      loadSignaturesArtifact(REAL_TYPES_DIR),
      window,
    );
    const ns = windowed.namespaces.find((n) => n.namespace === "render");
    if (!ns) throw new Error("no windowed render namespace");
    const headings = renderedCallForms(await renderedFor(ns));
    for (const arm of storeFor("render")?.["render.render_target"]?.signatures ?? []) {
      expect(headings).toContain(callForm(arm));
    }
  });

  it("dates exactly the arms a windowed page renders, for every window on the axis", () => {
    const axis = combined.versions;
    const artifact = loadSignaturesArtifact(REAL_TYPES_DIR);
    const mismatched: string[] = [];
    let droppedSomewhere = false;
    for (const [newestIndex, to] of axis.entries()) {
      for (const from of axis.slice(newestIndex)) {
        const slice = new Set(axis.slice(newestIndex, axis.indexOf(from) + 1));
        const windowed = windowCombinedSurface(combined, artifact, { from, to });
        for (const ns of windowed.namespaces) {
          for (const entry of ns.entries) {
            if (entry.authoredArms === undefined) continue;
            const fqn = entry.identity.name;
            const arms = entry.authoredArms.map((arm) => arm.signature);
            const stored = ns.signatureStore?.[fqn]?.signatures ?? [];
            if (JSON.stringify(arms) !== JSON.stringify(stored)) {
              mismatched.push(`${from}..${to} ${fqn}: arms ${arms.length}, store ${stored.length}`);
            }
            for (const arm of entry.authoredArms) {
              if (!arm.availableIn.some((version) => slice.has(version))) {
                mismatched.push(`${from}..${to} ${fqn}: arm outside window ${arm.signature}`);
              }
            }
            const full = combined.namespaces
              .find((n) => n.namespace === ns.namespace)
              ?.entries.find(
                (e) => symbolIdentityKey(e.identity) === symbolIdentityKey(entry.identity),
              );
            if ((full?.authoredArms?.length ?? 0) > arms.length) droppedSomewhere = true;
          }
        }
      }
    }
    expect(mismatched).toEqual([]);
    expect(droppedSomewhere).toBe(true);
  });
});
