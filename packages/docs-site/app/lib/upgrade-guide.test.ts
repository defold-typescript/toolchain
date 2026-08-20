import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchIndexOutputs } from "../../scripts/build-search-index";
import { renderGuidePage } from "./content";
import { groupGuidePages } from "./guide-groups";
import { listGuidePages } from "./guide-loader";
import { type Heading, pageHeadings, slugify } from "./headings";
import { renderMarkdown } from "./markdown";
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

const guidePage = listGuidePages(GUIDE_DIR).find((page) => page.slug === SLUG);
if (!guidePage) throw new Error(`no guide page for ${SLUG}`);
// One render of the real page through the exact path the site uses. Every anchor
// claim below resolves against the ids a reader actually receives — the
// `slugify-headings` ruler is the only thing that decides what a guide anchor is,
// so re-deriving that mapping here would put a second model of production between
// the page and its gate. That second model is what let a heading closed with
// `###` pass: the line regex kept the closing hashes in the text and slugged them
// to a different anchor than the one the renderer minted.
const guideHtml = await renderGuidePage(GUIDE_DIR, guidePage);

// The page holds one marked section per release. Every claim about a specific
// release is asserted against that release's own section, mirroring how the
// readiness gate scopes its evidence — a heading parked in an older section
// must not satisfy the current release. The markers are html_blocks on their own
// line, so the same splitter reads the rendered page as well as the source.
const releaseBody = releaseSection(guideBody, RELEASE) ?? "";
// The hop a baseline project actually makes spans every release after the
// baseline up to the current one — 1.13.0 and 1.13.1 both — so migration coverage
// is asserted over their union, mirroring `collectMigrationGuide`. Each release
// keeps its own notes under its own marker rather than being relabelled forward.
const BASELINE = "1.12.4";
function spanOf(source: string): string {
  return releaseSections(source)
    .filter((s) => s.version !== BASELINE)
    .map((s) => s.body)
    .join("\n");
}
const spanBody = spanOf(guideBody);
const spanHtml = spanOf(guideHtml);
const replacedBody = releaseSection(guideBody, REPLACED) ?? "";

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

// A heading production had to disambiguate. For an uncontested heading the ruler
// mints exactly `slugify(text)`, so an id differing from its own rendered text's
// slug is the `-1`/`-2` suffix and nothing else — whatever form the collision took
// in the source, including one the renderer folds together.
//
// Scoped to h2 and h4: the release wrappers and the per-symbol notes, which are
// the page's stable link targets. h3 topic headings ("Changed Lua API
// signatures") repeat by design under each release's parent — they are structure,
// not link targets — and are checked for uniqueness within a single release
// instead.
//
// One benign divergence class stays a contract rather than code: these headings
// are plain text, and a heading wrapping a markdown link (whose id would slug the
// target too) must not be introduced.
function disambiguatedAnchors(html: string): Heading[] {
  return pageHeadings(html).filter((h) => h.level !== 3 && h.id !== slugify(h.text));
}

// Two release sections shaped exactly as the page shapes them, so a fixture
// exercises the same renderer path as the real guide. Blank lines around each
// marker keep it its own html_block, which is what `releaseSections` looks for.
function twoReleaseFixture(first: string, second: string): string {
  return [
    "<!-- release: 1.13.0 -->",
    "",
    "## Defold 1.13.0",
    "",
    first,
    "",
    "<!-- release: 1.13.1 -->",
    "",
    "## Defold 1.13.1",
    "",
    second,
    "",
  ].join("\n");
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

  // The anchor contract, read off the rendered page: the guide's preamble promises
  // a stable anchor per documented symbol, and a disambiguated id means some other
  // heading already owns that anchor, leaving this one's permalink and TOC entry
  // pointing at the wrong release's note.
  test("no stable anchor on the rendered page has been disambiguated", () => {
    expect(pageHeadings(guideHtml).filter((h) => h.level === 4).length).toBeGreaterThan(0);
    expect(disambiguatedAnchors(guideHtml).map((h) => `${h.id} (${h.text})`)).toEqual([]);
  });

  // `pageHeadings` falls back to `slugify(text)` when a heading carries no `id`, so
  // an unminted heading reads as undisambiguated. Assert the attribute itself, or
  // narrowing the ruler's depth bound would silently empty the check above.
  test("every per-symbol heading carries a minted id in the rendered html", () => {
    const opens = [...guideHtml.matchAll(/<h4(\s+[^>]*)?>/g)].map((m) => m[1] ?? "");
    expect(opens.length).toBeGreaterThan(0);
    expect(opens.filter((attrs) => !/\sid="[^"]+"/.test(attrs))).toEqual([]);
  });

  test("a symbol heading repeated across releases is rejected, closing hashes and all", async () => {
    const html = await renderMarkdown(
      twoReleaseFixture("#### liveupdate.add_mount", "#### liveupdate.add_mount ####"),
    );
    expect(disambiguatedAnchors(html).map((h) => h.id)).toEqual(["liveupdateadd_mount-1"]);
  });

  test("distinct symbol headings across releases are accepted", async () => {
    const html = await renderMarkdown(
      twoReleaseFixture("#### liveupdate.add_mount", "#### liveupdate.remove_mount"),
    );
    expect(disambiguatedAnchors(html)).toEqual([]);
  });

  test("a heading-like line inside a fence is not a heading", async () => {
    const fenced = ["```md", "#### liveupdate.add_mount", "```"].join("\n");
    const html = await renderMarkdown(twoReleaseFixture("#### liveupdate.add_mount", fenced));
    expect(disambiguatedAnchors(html)).toEqual([]);
  });

  // Group anchors are navigation-only, so they may repeat *across* releases but
  // never inside one, where two identical entries leave a release's own TOC
  // ambiguous. Compared by slug, not by id: the ruler's counter is page-wide, so
  // the second occurrence inside a release already carries a distinct `-1` id.
  test("no two group headings inside one release resolve to the same slug", () => {
    const offenders: string[] = [];
    for (const { version, body } of releaseSections(guideHtml)) {
      const slugs = pageHeadings(body)
        .filter((h) => h.level === 3)
        .map((h) => slugify(h.text));
      for (const [i, slug] of slugs.entries()) {
        if (slugs.indexOf(slug) !== i) offenders.push(`${version}: ${slug}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The shape a reader navigates by, and the shape `agent-runbooks.md` tells the
  // next bump to author: one `## Defold <version>` owning each release's notes,
  // rather than a flat run of version-prefixed siblings.
  test("each release section opens with exactly one `Defold <version>` h2", () => {
    const sections = releaseSections(guideHtml);
    expect(sections.length).toBeGreaterThan(0);
    for (const { version, body } of sections) {
      const h2 = pageHeadings(body).filter((h) => h.level === 2);
      expect(h2.map((h) => h.text)).toEqual([`Defold ${version}`]);
    }
  });

  test("the replaced release's per-symbol notes render at h4 with bare-symbol ids", () => {
    const body = releaseSection(guideHtml, REPLACED) ?? "";
    const ids = pageHeadings(body)
      .filter((h) => h.level === 4)
      .map((h) => h.id);
    expect(ids).toContain("liveupdateadd_mount");
    expect(ids).toContain("modelmaterial");
  });

  test("is registered in the Guides navigation under Project configuration", () => {
    const groups = groupGuidePages(listGuidePages(GUIDE_DIR));
    const projectConfig = groups.find((g) => g.id === "project-configuration");
    expect(projectConfig?.pages.map((p) => p.slug)).toContain(SLUG);
  });

  test("covers every PRD-listed engine breaking change", () => {
    const body = spanBody.toLowerCase();
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
    const anchors = new Set(pageHeadings(spanHtml).map((h) => h.id));
    // An explicit no-action list: `<!-- no-action: <qualified> -->` classifies a
    // removed/deprecated symbol that needs no migration, without minting a heading.
    // Read from the source, where the marker is authored.
    const noAction = new Set(
      [...spanBody.matchAll(/<!--\s*no-action:\s*([^\s]+)\s*-->/g)].map((m) => m[1] ?? ""),
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
      expect(spanBody).toContain(`/api/defold-1.12.4/${namespace}`);
    }
  });

  test("points current-surface claims at the exact-version pages", () => {
    // The upgrade guide's current-surface claims are version-specific, so they
    // resolve to the exact-version pages, not the unprefixed Combined page.
    expect(spanBody).toContain(`/api/defold-${RELEASE}/liveupdate`);
    expect(spanBody).toContain(`/api/defold-${RELEASE}/model`);
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
    const replacedHtml = releaseSection(guideHtml, REPLACED) ?? "";
    const groups = pageHeadings(replacedHtml)
      .filter((h) => h.level === 3)
      .map((h) => h.text);
    expect(groups).toContain("Changed Lua API signatures");
    const collapsed = replacedBody.replace(/\s+/g, " ");
    expect(collapsed).toContain("`liveupdate.add_mount` was **not** removed");
    expect(collapsed).toContain("widened from `string` to `string | Hash`");
    expect(collapsed).not.toContain("auto-mount API is gone");
    expect(collapsed).not.toContain("no longer exists on the 1.13.1");
    expect(collapsed).not.toContain("is removed alongside `add_mount`");
  });

  test("still describes model.material as removed", () => {
    expect(spanBody.replace(/\s+/g, " ")).toContain(
      "The single-slot `model.material` property is removed",
    );
  });

  // Camera-focus messages are deprecated in 1.13.0 but live outside the typed
  // identity surface (no MESSAGE kind in api-availability.json), so the guide is
  // their user-facing surface, mirroring the reset_constant no-action entries.
  test("documents the deprecated 1.13.0 camera-focus messages with no-action markers", () => {
    for (const name of ["acquire_camera_focus", "release_camera_focus"]) {
      expect(spanBody).toContain(name);
      expect(spanBody).toContain(`<!-- no-action: ${name} -->`);
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

  // The markers survive rendering as their own html_blocks, which is what lets the
  // rendered page be split by the same function that splits the source.
  test("splits a rendered page as well as its source", async () => {
    const html = await renderMarkdown(twoReleaseFixture("#### a.one", "#### b.two"));
    expect(releaseSections(html).map((s) => s.version)).toEqual(["1.13.0", "1.13.1"]);
    expect(releaseSections(html)[0]?.body).toContain("a.one");
    expect(releaseSections(html)[0]?.body).not.toContain("b.two");
  });
});
