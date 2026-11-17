import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { apiVersions } from "@defold-typescript/docs-render/toolchain-surface";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import { versionNamespaceAtom } from "../../app/lib/api-content";
import { CANONICAL_SURFACE } from "../../app/lib/api-surface-pref";
import { listGuidePages } from "../../app/lib/guide-loader";
import { surfaceTrees } from "./site";

const TYPES_DIR = join(import.meta.dir, "../../../types");
const GUIDE_DIR = join(import.meta.dir, "../../../docs/guide");

// Newest first, so a version's window is itself and every id after it.
const VERSION_IDS = apiVersions(TYPES_DIR).map((version) => version.id);
const ENGINE = new Set(VERSION_IDS.flatMap((id) => versionNamespaceAtom(id, TYPES_DIR)));
const trees = surfaceTrees(TYPES_DIR, listGuidePages(GUIDE_DIR));

function windowNamespaces(versionId: string): Set<string> {
  return new Set(
    VERSION_IDS.slice(VERSION_IDS.indexOf(versionId)).flatMap((id) =>
      versionNamespaceAtom(id, TYPES_DIR),
    ),
  );
}

function rootFolders(tree: Root): Folder[] {
  return tree.children.filter((node): node is Folder => node.type === "folder");
}

function apiFolder(tree: Root): Folder {
  const folder = rootFolders(tree).find((node) => node.name === "API");
  if (!folder) throw new Error("the tree has no API root folder");
  return folder;
}

function leaves(nodes: Node[]): Item[] {
  return nodes.flatMap((node) => {
    if (node.type === "page") return [node];
    if (node.type === "folder")
      return [...(node.index ? [node.index] : []), ...leaves(node.children)];
    return [];
  });
}

function namespaceOf(url: string): string {
  return url.split("/").pop() ?? "";
}

function engineLeaves(tree: Root): Item[] {
  return leaves(apiFolder(tree).children).filter((item) => ENGINE.has(namespaceOf(item.url)));
}

function otherApiLeaves(tree: Root): string[] {
  return leaves(apiFolder(tree).children)
    .filter((item) => !ENGINE.has(namespaceOf(item.url)))
    .map((item) => item.url);
}

function guideFolders(tree: Root): Folder[] {
  return rootFolders(tree).filter((node) => node.name !== "API");
}

describe("surfaceTrees", () => {
  test("holds a canonical tree and one tree per tracked version", () => {
    expect(Object.keys(trees).sort()).toEqual([CANONICAL_SURFACE, ...VERSION_IDS].sort());
  });

  test("the canonical tree links every engine namespace un-prefixed", () => {
    const canonical = trees[CANONICAL_SURFACE] as Root;
    const items = engineLeaves(canonical);
    expect(new Set(items.map((item) => namespaceOf(item.url)))).toEqual(ENGINE);
    for (const item of items) expect(item.url).toBe(`/api/${namespaceOf(item.url)}`);
  });

  test("a version's tree links its window's engine namespaces under that version and drops the rest", () => {
    const oldest = VERSION_IDS[VERSION_IDS.length - 1] as string;
    const owned = windowNamespaces(oldest);
    // The committed corpus gained namespaces after its oldest version, so the
    // oldest tree has something to drop.
    expect(owned.size).toBeLessThan(ENGINE.size);

    for (const versionId of VERSION_IDS) {
      const tree = trees[versionId] as Root;
      const items = engineLeaves(tree);
      expect(new Set(items.map((item) => namespaceOf(item.url)))).toEqual(
        windowNamespaces(versionId),
      );
      for (const item of items) {
        expect(item.url).toBe(`/api/${versionId}/${namespaceOf(item.url)}`);
      }
      expect(apiFolder(tree).index?.url).toBe(`/api/${versionId}`);
    }
  });

  test("guide pages and version-independent API pages are the same in every tree", () => {
    const canonical = trees[CANONICAL_SURFACE] as Root;
    for (const versionId of VERSION_IDS) {
      const tree = trees[versionId] as Root;
      expect(guideFolders(tree)).toEqual(guideFolders(canonical));
      expect(otherApiLeaves(tree)).toEqual(otherApiLeaves(canonical));
    }
    expect(otherApiLeaves(canonical).length).toBeGreaterThan(0);
  });
});
