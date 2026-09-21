import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SignatureStore } from "@defold-typescript/types";
import { apiLinkify, apiPageMarkdown } from "./api-page-render";
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

// Every `### \`<signature>\`` heading the page renders, in order. The trailing
// availability dots are not part of the signature.
function signatureHeadings(markdown: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = line.match(/^### `(.+?)`(?: .*)?$/);
    if (m?.[1]) out.push(m[1]);
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
      const headings = signatureHeadings(markdownFor(ns));
      const declared = new Set(ns.module.functions.map((fn) => fn.name));
      for (const [fqn, override] of Object.entries(store)) {
        if (!declared.has(fqn)) continue;
        for (const arm of override.signatures) {
          const count = headings.filter((h) => h === arm).length;
          if (count !== 1) missing.push(`${ns.namespace}: ${arm} rendered ${count}x`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("renders both render.render_target arities on /api/render", () => {
    const headings = signatureHeadings(markdownFor(namespaceByName("render")));
    expect(headings).toContain(
      'render.render_target(parameters: Record<string | number, unknown>): Opaque<"render_target">',
    );
    expect(headings).toContain(
      'render.render_target(name: string, parameters: Record<string | number, unknown>): Opaque<"render_target">',
    );
  });

  it("renders the authored vmath.euler_to_quat arms and not the generated union", () => {
    const headings = signatureHeadings(markdownFor(namespaceByName("vmath")));
    const authored = storeFor("vmath")?.["vmath.euler_to_quat"]?.signatures ?? [];
    expect(authored.length).toBeGreaterThan(1);
    for (const arm of authored) expect(headings).toContain(arm);
    expect(armsOf(headings, "vmath.euler_to_quat")).toEqual([...authored]);
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
    const msg = signatureHeadings(markdownFor(namespaceByName("msg")));
    const msgUrlArms = storeFor("msg")?.["msg.url"]?.signatures ?? [];
    expect(msgUrlArms.length).toBe(6);
    expect(armsOf(msg, "msg.url")).toEqual([...msgUrlArms]);

    const vmath = signatureHeadings(markdownFor(namespaceByName("vmath")));
    const lerpArms = storeFor("vmath")?.["vmath.lerp"]?.signatures ?? [];
    expect(lerpArms.length).toBe(3);
    expect(armsOf(vmath, "vmath.lerp")).toEqual([...lerpArms]);
  });

  it("leaves a generated symbol on the same page untouched", () => {
    const headings = signatureHeadings(markdownFor(namespaceByName("render")));
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
    const headings = signatureHeadings(markdownFor(ns));
    for (const arm of storeFor("render")?.["render.render_target"]?.signatures ?? []) {
      expect(headings).toContain(arm);
    }
  });
});
