import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { groupGuidePages } from "./guide-groups";
import { listGuidePages } from "./guide-loader";
import { slugify } from "./headings";
import { releaseSection, releaseSections } from "./upgrade-guide";

const SLUG = "upgrading-defold-versions";
// The currently-pinned release, and the only marked section: a patch replaces its
// predecessor in place, so the current section carries the whole 1.12.4 -> current
// migration rather than one section per replaced patch.
const RELEASE = "1.13.1";
// The version 1.13.1 replaced. Its `/api/defold-1.13.0/…` family no longer exists,
// so nothing on the page may link into it.
const REPLACED = "1.13.0";
const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const TYPES_DIR = join(import.meta.dir, "../../../../packages/types");

const guideBody = readFileSync(join(GUIDE_DIR, `${SLUG}.md`), "utf8");

// The page holds one marked section per release. Every claim about a specific
// release is asserted against that release's own section, mirroring how the
// readiness gate scopes its evidence — a heading parked in an older section
// must not satisfy the current release.
const releaseBody = releaseSection(guideBody, RELEASE) ?? "";

interface AvailabilityRecord {
  identity: { namespace: string; kind: string; name: string; signature: string };
  availableIn: string[];
  deprecatedSince?: string;
  replacement?: { namespace: string; kind: string; name: string; signature: string };
}

interface AvailabilityDoc {
  versions: string[];
  records: AvailabilityRecord[];
}

function availabilityDoc(): AvailabilityDoc {
  return JSON.parse(readFileSync(join(TYPES_DIR, "api-availability.json"), "utf8"));
}

// A symbol whose old signature no longer exists in the newest tracked version:
// its `availableIn` omits the newest version (`versions[0]`). This spans both a
// genuine removal and the retired side of a signature transition — both need a
// migration note in the upgrade guide.
function absentFromNewest(doc: AvailabilityDoc): (r: AvailabilityRecord) => boolean {
  const newest = doc.versions[0];
  return (r) => newest !== undefined && !r.availableIn.includes(newest);
}

// A record's fully-qualified symbol id: functions already carry the namespace in
// `name` (`liveupdate.add_mount`); other kinds carry a bare `name` (`material`).
function qualifiedName(record: AvailabilityRecord): string {
  const { namespace, name } = record.identity;
  return name.includes(".") ? name : `${namespace}.${name}`;
}

// Every h2/h3 heading's raw text, in document order, skipping fenced code.
function headingTexts(markdown: string): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^\s*(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (match) out.push(match[2] ?? "");
  }
  return out;
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

// The full route set the guide may link, built from the pure search-index
// generator (committed types + guide trees) rather than the ignored, build-only
// `public/search-index*.json`. Covers the shared canonical index plus every
// per-version family, so canonical, current, and historical guide links all
// resolve without a prior docs build.
function apiRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const { records } of searchIndexOutputs()) {
    for (const record of records) routes.add(record.route);
  }
  return routes;
}

// Every markdown link target in the guide that points at an API route.
function apiLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)]
    .map((m) => m[1] ?? "")
    .filter((href) => href.startsWith("/api/") || href === "/api");
}

describe("upgrading-defold-versions guide", () => {
  test("exposes the current release as a marked section", () => {
    expect(releaseBody).not.toEqual("");
    expect(releaseSections(guideBody).map((s) => s.version)).toContain(RELEASE);
  });

  // Page-wide, not per-section: the API lifecycle badges link to
  // `slugify(<qualified symbol>)` on this one page, so a heading repeated in a
  // second release section would mint `<slug>-2` and leave the badge pointing at
  // the earlier release's note.
  test("every h2/h3 heading slug on the page is unique", () => {
    const seen = new Map<string, number>();
    for (const heading of headingTexts(guideBody)) {
      const slug = slugify(heading);
      seen.set(slug, (seen.get(slug) ?? 0) + 1);
    }
    const duplicated = [...seen].filter(([, n]) => n > 1).map(([slug]) => slug);
    expect(duplicated).toEqual([]);
    expect(seen.size).toBeGreaterThan(0);
  });

  test("a heading repeated across two release sections is reported as a duplicate slug", () => {
    const body = [
      "<!-- release: 1.13.0 -->",
      "### liveupdate.add_mount",
      "<!-- release: 1.13.1 -->",
      "### liveupdate.add_mount",
    ].join("\n");
    const slugs = headingTexts(body).map(slugify);
    expect(slugs).toEqual(["liveupdateadd_mount", "liveupdateadd_mount"]);
    expect(headingAnchors(body).has("liveupdateadd_mount-1")).toBe(true);
  });

  test("is registered in the Guides navigation under Project configuration", () => {
    const groups = groupGuidePages(listGuidePages(GUIDE_DIR));
    const projectConfig = groups.find((g) => g.id === "project-configuration");
    expect(projectConfig?.pages.map((p) => p.slug)).toContain(SLUG);
  });

  test("covers every PRD-listed engine breaking change", () => {
    const body = releaseBody.toLowerCase();
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
    const anchors = headingAnchors(releaseBody);
    // An explicit no-action list: `<!-- no-action: <qualified> -->` classifies a
    // removed/deprecated symbol that needs no migration, without minting a heading.
    const noAction = new Set(
      [...releaseBody.matchAll(/<!--\s*no-action:\s*([^\s]+)\s*-->/g)].map((m) => m[1] ?? ""),
    );
    const doc = availabilityDoc();
    const removed = absentFromNewest(doc);
    const catalog = doc.records.filter((r) => removed(r) || r.deprecatedSince);
    expect(catalog.length).toBeGreaterThan(0);
    const uncovered = catalog.filter((r) => {
      const qualified = qualifiedName(r);
      return !anchors.has(slugify(qualified)) && !noAction.has(qualified);
    });
    expect(uncovered.map(qualifiedName)).toEqual([]);
  });

  test("uses exact baseline and current target commands", () => {
    expect(releaseBody).toContain("--defold-target 1.12.4");
    expect(releaseBody).toContain(`--defold-target ${RELEASE}`);
  });

  test("links every removed symbol to its historical 1.12.4 API page", () => {
    const doc = availabilityDoc();
    const namespaces = new Set(
      doc.records.filter(absentFromNewest(doc)).map((r) => r.identity.namespace),
    );
    expect(namespaces.size).toBeGreaterThan(0);
    for (const namespace of namespaces) {
      expect(releaseBody).toContain(`/api/defold-1.12.4/${namespace}`);
    }
  });

  test("points current-surface claims at the exact-version pages", () => {
    // The upgrade guide's current-surface claims are version-specific, so they
    // resolve to the exact-version pages, not the unprefixed Combined page.
    expect(releaseBody).toContain(`/api/defold-${RELEASE}/liveupdate`);
    expect(releaseBody).toContain(`/api/defold-${RELEASE}/model`);
    expect(guideBody).not.toContain("](/api/liveupdate)");
    expect(guideBody).not.toContain("](/api/model)");
  });

  // A patch replaces its predecessor in place, taking that version's whole
  // `/api/defold-<replaced>/…` route family with it. Any surviving *link* is
  // broken by construction — and reds here on the guide body alone, without
  // waiting for a docs rebuild to repopulate the route set. Prose may still name
  // the family to explain that it is gone; only navigation into it is the defect.
  test("links nothing into the replaced version's API family", () => {
    const dead = apiLinkTargets(guideBody).filter((href) =>
      href.startsWith(`/api/defold-${REPLACED}/`),
    );
    expect(dead).toEqual([]);
  });

  test("carries no broken API links", () => {
    const routes = apiRoutes();
    const targets = apiLinkTargets(guideBody);
    expect(targets.length).toBeGreaterThan(0);
    const broken = targets.filter((href) => !routes.has(href.split("#")[0] ?? href));
    expect(broken).toEqual([]);
  });

  // The availability model classifies the Live Update mounts as a signature
  // transition — the `name` parameter widened to accept a hash — not as removed
  // symbols, so the guide must describe a parameter-type change.
  test("describes the Live Update mounts as a parameter-type change, not a removal", () => {
    const collapsed = releaseBody.replace(/\s+/g, " ");
    expect(collapsed).toContain("## Defold 1.13.1: changed Lua API signatures");
    expect(collapsed).toContain("`liveupdate.add_mount` was **not** removed");
    expect(collapsed).toContain("widened from `string` to `string | Hash`");
    expect(collapsed).not.toContain("auto-mount API is gone");
    expect(collapsed).not.toContain("no longer exists on the 1.13.1");
    expect(collapsed).not.toContain("is removed alongside `add_mount`");
  });

  test("still describes model.material as removed", () => {
    expect(releaseBody.replace(/\s+/g, " ")).toContain(
      "The single-slot `model.material` property is removed",
    );
  });

  // Camera-focus messages are deprecated in 1.13.0 but live outside the typed
  // identity surface (no MESSAGE kind in api-availability.json), so the guide is
  // their user-facing surface, mirroring the reset_constant no-action entries.
  test("documents the deprecated 1.13.0 camera-focus messages with no-action markers", () => {
    for (const name of ["acquire_camera_focus", "release_camera_focus"]) {
      expect(releaseBody).toContain(name);
      expect(releaseBody).toContain(`<!-- no-action: ${name} -->`);
    }
  });
});

describe("releaseSections", () => {
  const twoReleases = [
    "---",
    "toc-title: Upgrading Defold versions",
    "---",
    "# Upgrading Defold versions",
    "",
    "## Reproduce, then flip the target",
    "",
    "Preamble that belongs to no release.",
    "",
    "<!-- release: 1.13.0 -->",
    "",
    "### model.material",
    "",
    "Removed in 1.13.0.",
    "",
    "<!-- release: 1.13.1 -->",
    "",
    "### sprite.play_flipbook",
    "",
    "Removed in 1.13.1.",
    "",
  ].join("\n");

  test("returns one entry per marker, in document order", () => {
    expect(releaseSections(twoReleases).map((s) => s.version)).toEqual(["1.13.0", "1.13.1"]);
  });

  test("section boundaries do not bleed into the neighbouring release", () => {
    const [first, second] = releaseSections(twoReleases);
    expect(first?.body).toContain("model.material");
    expect(first?.body).not.toContain("sprite.play_flipbook");
    expect(second?.body).toContain("sprite.play_flipbook");
    expect(second?.body).not.toContain("model.material");
  });

  test("the preamble before the first marker belongs to no release", () => {
    for (const { body } of releaseSections(twoReleases)) {
      expect(body).not.toContain("Preamble that belongs to no release.");
      expect(body).not.toContain("## Reproduce, then flip the target");
    }
  });

  test("the final section runs to end of file", () => {
    const last = releaseSections(twoReleases).at(-1);
    expect(last?.body.trimEnd().endsWith("Removed in 1.13.1.")).toBe(true);
  });

  test("a body with no marker yields no sections", () => {
    expect(releaseSections("# Title\n\n## Heading\n")).toEqual([]);
  });

  test("releaseSection selects one version and is null for an absent one", () => {
    expect(releaseSection(twoReleases, "1.13.0")).toContain("model.material");
    expect(releaseSection(twoReleases, "1.13.2")).toBeNull();
  });
});
