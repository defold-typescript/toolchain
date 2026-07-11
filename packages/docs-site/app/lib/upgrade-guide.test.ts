import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupGuidePages } from "./guide-groups";
import { listGuidePages } from "./guide-loader";
import { slugify } from "./headings";

const SLUG = "upgrading-to-defold-1-13-0";
const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const TYPES_DIR = join(import.meta.dir, "../../../../packages/types");
const PUBLIC_DIR = join(import.meta.dir, "../../public");

const guideBody = readFileSync(join(GUIDE_DIR, `${SLUG}.md`), "utf8");

interface AvailabilityRecord {
  identity: { namespace: string; kind: string; name: string; signature: string };
  since?: string;
  deprecatedSince?: string;
  removedIn?: string;
  replacement?: { namespace: string; kind: string; name: string; signature: string };
}

function availabilityRecords(): AvailabilityRecord[] {
  const doc = JSON.parse(readFileSync(join(TYPES_DIR, "api-availability.json"), "utf8"));
  return doc.records as AvailabilityRecord[];
}

// A record's fully-qualified symbol id: functions already carry the namespace in
// `name` (`liveupdate.add_mount`); other kinds carry a bare `name` (`material`).
function qualifiedName(record: AvailabilityRecord): string {
  const { namespace, name } = record.identity;
  return name.includes(".") ? name : `${namespace}.${name}`;
}

// Mirror the reference-audit / renderer heading-id rule: h2/h3 headings gain a
// slugified id; `-2`/`-3` disambiguate duplicates; fenced code is skipped.
function headingAnchors(markdown: string): Set<string> {
  const out = new Set<string>();
  const counts = new Map<string, number>();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^\s*(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const base = slugify(match[2] ?? "");
    if (!base) continue;
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

function apiRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const file of ["search-index.json", "search-index-defold-1.12.4.json"]) {
    const items = JSON.parse(readFileSync(join(PUBLIC_DIR, file), "utf8")) as { route: string }[];
    for (const item of items) routes.add(item.route);
  }
  return routes;
}

// Every markdown link target in the guide that points at an API route.
function apiLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)]
    .map((m) => m[1] ?? "")
    .filter((href) => href.startsWith("/api/") || href === "/api");
}

describe("upgrading-to-defold-1-13-0 guide", () => {
  test("is registered in the Guides navigation under Project configuration", () => {
    const groups = groupGuidePages(listGuidePages(GUIDE_DIR));
    const projectConfig = groups.find((g) => g.id === "project-configuration");
    expect(projectConfig?.pages.map((p) => p.slug)).toContain(SLUG);
  });

  test("covers every PRD-listed engine breaking change", () => {
    const body = guideBody.toLowerCase();
    // Stable content tokens, not prose bytes: additive editorial edits keep them.
    const changes: { name: string; tokens: string[] }[] = [
      { name: "asm.js removal", tokens: ["asm.js"] },
      { name: "Collada removal", tokens: ["collada"] },
      { name: "old Live Update / auto-mount removal", tokens: ["auto-mount"] },
      { name: "hashed mount names", tokens: ["hashed mount"] },
      { name: "counter-clockwise component winding", tokens: ["counter-clockwise"] },
      { name: "glTF transform / re-centering", tokens: ["gltf"] },
      { name: "Android Vulkan default", tokens: ["vulkan"] },
      { name: "HTML5 splash containment", tokens: ["splash"] },
      { name: "particle-effect culling", tokens: ["culling"] },
      { name: "Spine extension 4.6.0 minimum", tokens: ["spine", "4.6.0"] },
    ];
    const missing = changes.filter((c) => !c.tokens.every((t) => body.includes(t)));
    expect(missing.map((c) => c.name)).toEqual([]);
  });

  test("every removed/deprecated catalog symbol has a stable guide anchor or a no-action entry", () => {
    const anchors = headingAnchors(guideBody);
    // An explicit no-action list: `<!-- no-action: <qualified> -->` classifies a
    // removed/deprecated symbol that needs no migration, without minting a heading.
    const noAction = new Set(
      [...guideBody.matchAll(/<!--\s*no-action:\s*([^\s]+)\s*-->/g)].map((m) => m[1] ?? ""),
    );
    const catalog = availabilityRecords().filter((r) => r.removedIn || r.deprecatedSince);
    expect(catalog.length).toBeGreaterThan(0);
    const uncovered = catalog.filter((r) => {
      const qualified = qualifiedName(r);
      return !anchors.has(slugify(qualified)) && !noAction.has(qualified);
    });
    expect(uncovered.map(qualifiedName)).toEqual([]);
  });

  test("uses exact 1.12.4 and 1.13.0 target commands", () => {
    expect(guideBody).toContain("--defold-target 1.12.4");
    expect(guideBody).toContain("--defold-target 1.13.0");
  });

  test("links every removed symbol to its historical 1.12.4 API page", () => {
    const namespaces = new Set(
      availabilityRecords()
        .filter((r) => r.removedIn)
        .map((r) => r.identity.namespace),
    );
    expect(namespaces.size).toBeGreaterThan(0);
    for (const namespace of namespaces) {
      expect(guideBody).toContain(`/api/defold-1.12.4/${namespace}`);
    }
  });

  test("points at current canonical namespace pages for where the surface lives now", () => {
    // Canonical (current-surface) links carry no version prefix, so a reader
    // lands on the 1.13.0 page, not the frozen historical one.
    expect(guideBody).toContain("/api/liveupdate");
    expect(guideBody).toContain("/api/model");
  });

  test("carries no broken API links", () => {
    const routes = apiRoutes();
    const targets = apiLinkTargets(guideBody);
    expect(targets.length).toBeGreaterThan(0);
    const broken = targets.filter((href) => !routes.has(href.split("#")[0] ?? href));
    expect(broken).toEqual([]);
  });
});
