import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  availabilityLabel,
  type SignatureStore,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { apiLinkify, apiPageMarkdown } from "./api-page-render";
import { type ApiSymbol, apiModuleSections, apiModuleSymbols, splitCallForm } from "./api-surface";
import { loadCombinedSurface, loadSignaturesArtifact } from "./api-surface-loader";
import {
  type CombinedNamespace,
  combinedAuthoritativeSignatures,
  combinedNamespaceToApiPage,
} from "./combined-surface";
import { windowCombinedSurface } from "./version-window";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// `symbolIdentityKey` joins its fields with NUL.
const IDENTITY_SEP = String.fromCharCode(0);

const combined = loadCombinedSurface(REAL_TYPES_DIR);
const pages = combined.namespaces.map(combinedNamespaceToApiPage);
const linkify = apiLinkify(pages);

function markdownFor(ns: CombinedNamespace): string {
  return apiPageMarkdown(combinedNamespaceToApiPage(ns), linkify);
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

// Every call form the page renders, in order: a `### \`<signature>\`` heading's
// own, or, under an overload block's `### \`<fqn>(...)<returns>\`` heading, each
// listed form's. The trailing count badge and availability dots are not part of
// the signature.
function renderedCallForms(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  let group: string | null = null;
  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^### `(.+?)`(?: .*)?$/)?.[1];
    if (heading !== undefined) {
      const dots = heading.indexOf("(...)");
      group = dots < 0 ? null : heading.slice(0, dots);
      if (group === null) out.push(callForm(heading));
      continue;
    }
    if (group === null || line !== '<li class="api-overload">') continue;
    const form = lines[index + 2]?.match(/^`(.+?)`(?: .*)?$/)?.[1];
    if (form !== undefined) out.push(callForm(`${group}${form}`));
  }
  return out;
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
function overloadForms(markdown: string, fqn: string): { code: string; body: string }[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`### \`${fqn}(...)`));
  if (start < 0) return [];
  const next = lines.findIndex((line, index) => index > start && line.startsWith("### "));
  const block = lines.slice(start + 1, next < 0 ? undefined : next);
  const forms: { code: string; body: string }[] = [];
  for (const [index, line] of block.entries()) {
    if (line !== '<li class="api-overload">') continue;
    const item = block.slice(index + 2, block.indexOf("</li>", index));
    const code = item[0]?.match(/^`(.+?)`(?: .*)?$/)?.[1] ?? "";
    forms.push({ code, body: item.slice(1).join("\n").trim() });
  }
  return forms;
}

function namespaceByName(name: string): CombinedNamespace {
  const ns = combined.namespaces.find((n) => n.namespace === name);
  if (!ns) throw new Error(`no Combined namespace ${name}`);
  return ns;
}

describe("canonical pages render every authored overload arm", () => {
  it("renders each authored arm exactly once, for every store-covered FQN", () => {
    const missing: string[] = [];
    for (const ns of combined.namespaces) {
      const store = storeFor(ns.namespace);
      if (!store) continue;
      const headings = renderedCallForms(markdownFor(ns));
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

  it("renders both render.render_target arities on /api/render", () => {
    const headings = renderedCallForms(markdownFor(namespaceByName("render")));
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

  it("renders the authored vmath.euler_to_quat arms and not the generated union", () => {
    const headings = renderedCallForms(markdownFor(namespaceByName("vmath")));
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

  it("collapses a multi-identity FQN to one arm set per page", () => {
    const msg = renderedCallForms(markdownFor(namespaceByName("msg")));
    const msgUrlArms = storeFor("msg")?.["msg.url"]?.signatures ?? [];
    expect(msgUrlArms.length).toBe(6);
    expect(armsOf(msg, "msg.url")).toEqual(msgUrlArms.map(callForm));

    const vmath = renderedCallForms(markdownFor(namespaceByName("vmath")));
    const lerpArms = storeFor("vmath")?.["vmath.lerp"]?.signatures ?? [];
    expect(lerpArms.length).toBe(3);
    expect(armsOf(vmath, "vmath.lerp")).toEqual(lerpArms.map(callForm));
  });

  it("renders each Box2D backend form of a world query with its own return and prose", () => {
    const markdown = markdownFor(namespaceByName("b2d.world"));
    const multi = (hit: string, info: string) => [
      `LuaMultiReturn<[b2d.${hit}[], b2d.tree_stats]>`,
      `LuaMultiReturn<[b2d.${info}[], b2d.tree_stats]>`,
    ];
    const queries: [string, string[]][] = [
      ["b2d.world.cast_ray", multi("fixture_cast_hit", "shape_cast_hit")],
      [
        "b2d.world.cast_ray_closest",
        ["b2d.fixture_cast_hit | undefined", "b2d.shape_cast_hit | undefined"],
      ],
      ["b2d.world.cast_shape", multi("fixture_cast_hit", "shape_cast_hit")],
      ["b2d.world.overlap_aabb", multi("fixture_info", "shape_info")],
      ["b2d.world.overlap_shape", multi("fixture_info", "shape_info")],
    ];
    for (const [fqn, [v2Return, v3Return]] of queries) {
      const forms = overloadForms(markdown, fqn);
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
    const [castV2, castV3] = overloadForms(markdown, "b2d.world.cast_ray");
    expect(castV2?.body).toStartWith("Cast a ray.");
    expect(castV3?.body).toStartWith("The translation is the ray displacement");
  });

  it("dates each Box2D backend form of a world query by the versions declaring it", () => {
    const ns = namespaceByName("b2d.world");
    const page = combinedNamespaceToApiPage(ns);
    const artifact = loadSignaturesArtifact(REAL_TYPES_DIR);
    const rows = apiModuleSymbols(page, page.translations, page.signatures);
    const markdown = markdownFor(ns).split("\n");
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
      const start = markdown.findIndex((line) => line.startsWith(`### \`${fqn}(...)`));
      const next = markdown.findIndex((line, index) => index > start && line.startsWith("### "));
      const block = markdown.slice(start, next < 0 ? undefined : next).join("\n");
      expect({ fqn, block: start >= 0 }).toEqual({ fqn, block: true });
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

  it("leaves a generated symbol on the same page untouched", () => {
    const headings = renderedCallForms(markdownFor(namespaceByName("render")));
    expect(headings.some((h) => h.startsWith("render.get_render_target_width("))).toBe(true);
  });

  it("keeps the arms on a windowed page built from the same projection", () => {
    const axis = combined.versions;
    const window = { from: axis[axis.length - 1] ?? "", to: axis[0] ?? "" };
    const windowed = windowCombinedSurface(
      combined,
      loadSignaturesArtifact(REAL_TYPES_DIR),
      window,
    );
    const ns = windowed.namespaces.find((n) => n.namespace === "render");
    if (!ns) throw new Error("no windowed render namespace");
    const headings = renderedCallForms(markdownFor(ns));
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
