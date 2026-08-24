import { describe, expect, test } from "bun:test";
import {
  type ApiFunction,
  type ApiModule,
  type ApiSymbolIdentity,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { type MiniElement, parseHtml } from "./__fixtures__/mini-dom";
import { apiPageMarkdown, navLeafBadgeHtml, navNamespaceBadges } from "./api-page-render";
import { type ApiPage, type AvailabilityLookup, windowedBadgeCategory } from "./api-surface";
import { type ApiSurfaceConfig, type BadgeCountTable, readStoredRange } from "./api-surface-pref";
import {
  buildBadgeCountTable,
  buildCombinedSurface,
  type CombinedVersionSurface,
  namespaceBadgeCounts,
  type SignaturesArtifact,
} from "./combined-surface";
import { renderMarkdown } from "./markdown";
import { applySinceFilter } from "./since-filter";

// Newest first, matching the tracked axis every availability span is read against.
const NEWEST = "3.0.0";
const MIDDLE = "2.0.0";
const OLDEST = "1.0.0";
const AXIS = [NEWEST, MIDDLE, OLDEST];

const fn = (name: string) => ({
  name,
  brief: "",
  description: `What ${name} does.`,
  parameters: [],
  returnValues: [],
});

// The identity key folds in the normalized overload signature, so it is derived
// with the same production helper the render-time join uses rather than spelled
// out — a hand-written signature silently misses and the record never joins.
const identity = (name: string) => ({
  namespace: "demo",
  kind: "FUNCTION" as const,
  name,
  signature: normalizedFunctionSignature(fn(name)),
});

// `demo.retired` ends at the oldest version, so a window starting at `2.0.0`
// excludes it while every other symbol survives. `demo.plain` carries no
// availability record at all — the case a filter keyed off badges alone would
// silently make unfilterable.
// The axis is a parameter because the vocabulary the spans are written in is the
// thing under test: rendering the same page against the prefixed axis emits
// prefixed `data-span-newest` markers, with the badge dots unchanged.
function availability(axis: readonly string[] = AXIS): AvailabilityLookup {
  const newest = axis[0] as string;
  const oldest = axis[axis.length - 1] as string;
  const spans: readonly (readonly [string, readonly string[]])[] = [
    ["demo.always", axis],
    ["demo.retired", [oldest]],
    ["demo.recent", [newest]],
  ];
  const records = new Map(
    spans.map(([name, availableIn]) => [
      symbolIdentityKey(identity(name)),
      { identity: identity(name), availableIn: [...availableIn] },
    ]),
  );
  return { versions: [...axis], records, transitions: new Set<string>() };
}

function demoPage(axis: readonly string[] = AXIS): ApiPage {
  return {
    namespace: "demo",
    route: "/api/defold-3.0.0/demo",
    brief: "Demo",
    module: {
      namespace: "demo",
      brief: "Demo",
      description: "Demo namespace.",
      functions: ["demo.always", "demo.plain", "demo.recent", "demo.retired"].map(fn),
      variables: [],
      constants: [],
      properties: [],
      typedefs: [],
    },
    translations: {},
    signatures: {},
    category: "engine",
    availability: availability(axis),
  };
}

// The sidebar leaf the page's own namespace owns, rendered exactly as
// `_renderer.tsx` renders it, so the recount is checked against real pill markup.
// `demo.recent` is newest-only (a `since` span, so New) and `demo.retired`
// oldest-only (a bounded span, so Changed) — the server-rendered tally for the
// full range.
function sidebarHtml(): string {
  const leaf = (route: string, counts: { new: number; changed: number; deprecated: number }) =>
    `<a href="${route}"${route === "/api/demo" ? ' aria-current="page"' : ""}>${navNamespaceBadges(counts)}</a>`;
  return [
    leaf("/api/demo", { new: 1, changed: 1, deprecated: 0 }),
    // A second engine leaf the reader is *not* on: the reported defect is that
    // this one keeps the full-range tally whatever range is selected.
    leaf(`/api/defold-${MIDDLE}/other`, { new: 2, changed: 1, deprecated: 0 }),
    // A leaf the table has no window for at all — it must end up with no pills.
    leaf(`/api/defold-${MIDDLE}/absent?since=defold-${OLDEST}`, {
      new: 3,
      changed: 0,
      deprecated: 0,
    }),
  ].join("");
}

// The one range the demo page is rendered at; every filter call narrows `from`
// underneath it, exactly as the routed page does.
const PAGE_TO = NEWEST;

const configFor = (
  versionIds: readonly string[],
  badgeCounts: BadgeCountTable = {},
): ApiSurfaceConfig => ({
  base: "",
  versionIds,
  defaultVersionId: versionIds[0] as string,
  namespacesByVersion: Object.fromEntries(versionIds.map((id) => [id, ["demo"]])),
  badgeCounts,
});

const AXIS_CONFIG = configFor(AXIS);

async function renderPage(
  axis: readonly string[] = AXIS,
  window?: { from: string; to: string },
): Promise<MiniElement> {
  const html = await renderMarkdown(
    apiPageMarkdown(demoPage(axis), (t) => t, {
      combinedMarkers: true,
      ...(window ? { window } : {}),
    }),
    {
      highlightSignatureHeadings: true,
    },
  );
  return parseHtml(`<main>${html}</main>${sidebarHtml()}`);
}

const headingFor = (root: MiniElement, name: string): MiniElement | undefined =>
  root.querySelectorAll("h3").find((h) => h.textContent.includes(name));

const bodyAfter = (heading: MiniElement | undefined) => heading?.nextElementSibling ?? null;

const visible = (el: MiniElement | undefined | null): boolean => el?.style.display !== "none";

// The pills one sidebar leaf shows, keyed by category. A pill hidden by the
// filter reads 0, which is what the reader sees.
const pillsFor = (root: MiniElement, namespace: string) => {
  const leaf = root
    .querySelectorAll("a[href]")
    .find(
      (a) => ((a.getAttribute("href") ?? "").split("?")[0] ?? "").split("/").pop() === namespace,
    );
  if (!leaf) throw new Error(`no sidebar leaf for ${namespace}`);
  return Object.fromEntries(
    leaf
      .querySelectorAll("[class*=nav-badge-count--]")
      .map((pill) => [
        (/nav-badge-count--(\w+)/.exec(pill.className)?.[1] ?? "") as string,
        visible(pill) ? Number(pill.textContent) : 0,
      ]),
  );
};

const leafFor = (root: MiniElement, namespace: string): MiniElement => {
  const leaf = root
    .querySelectorAll("a[href]")
    .find(
      (a) => ((a.getAttribute("href") ?? "").split("?")[0] ?? "").split("/").pop() === namespace,
    );
  if (!leaf) throw new Error(`no sidebar leaf for ${namespace}`);
  return leaf;
};

// The `aria-label` each *visible* pill currently announces, keyed by category —
// the only place a sidebar pill names its category, since the visible text is
// the bare tally.
const labelsFor = (root: MiniElement, namespace: string) =>
  Object.fromEntries(
    leafFor(root, namespace)
      .querySelectorAll("[class*=nav-badge-count--]")
      .filter((pill) => visible(pill))
      .map((pill) => [
        (/nav-badge-count--(\w+)/.exec(pill.className)?.[1] ?? "") as string,
        pill.getAttribute("aria-label"),
      ]),
  );

// The labels the *server* would render for the same tallies, read off
// `navNamespaceBadges`' own output. Comparing the client's rewrite against this
// proves the two vocabularies agree without either side restating a literal.
const serverLabels = (counts: { new: number; changed: number; deprecated: number }) =>
  Object.fromEntries(
    parseHtml(navNamespaceBadges(counts))
      .querySelectorAll("[class*=nav-badge-count--]")
      .filter((pill) => Number(pill.textContent) > 0)
      .map((pill) => [
        (/nav-badge-count--(\w+)/.exec(pill.className)?.[1] ?? "") as string,
        pill.getAttribute("aria-label"),
      ]),
  );

// The dots a reader can actually see on the symbol headings still on the page.
// Both halves come off the rendered DOM, so this compares two production
// surfaces rather than either to a constant.
const visibleTally = (root: MiniElement, kind: string) =>
  root
    .querySelectorAll("h3")
    .filter((h) => visible(h))
    .filter((h) =>
      h.querySelectorAll(`[class*=api-badge-dot--${kind}]`).some((dot) => visible(dot)),
    ).length;

// The per-window triples the pre-paint script looks pills up in. Hand-written
// here as *input*: the assertions below hold it against the dots the page
// actually renders, so a wrong table reds rather than agreeing with itself.
const tableFor = (ids: readonly string[]): BadgeCountTable => ({
  demo: {
    [`${ids[2]}|${ids[0]}`]: [1, 1, 0],
    [`${ids[1]}|${ids[0]}`]: [1, 0, 0],
  },
  other: {
    [`${ids[2]}|${ids[0]}`]: [2, 1, 0],
    [`${ids[1]}|${ids[0]}`]: [1, 0, 0],
  },
});

const TABLE = tableFor(AXIS);

describe("api page symbol span markers", () => {
  test("every symbol heading carries a presence span, badge or no badge", async () => {
    const root = await renderPage();
    const headings = root.querySelectorAll("h3");
    expect(headings).toHaveLength(4);
    for (const heading of headings) {
      const marker = heading.querySelector("[data-span-newest]");
      expect(marker).not.toBeNull();
      expect(marker?.getAttribute("data-span-oldest")).toBeTruthy();
    }
    // `demo.plain` has no availability record, so its span is the full axis.
    const plain = headingFor(root, "demo.plain")?.querySelector("[data-span-newest]");
    expect(plain?.getAttribute("data-span-newest")).toBe(NEWEST);
    expect(plain?.getAttribute("data-span-oldest")).toBe(OLDEST);
    // `demo.retired` reports the real end of its span.
    const retired = headingFor(root, "demo.retired")?.querySelector("[data-span-newest]");
    expect(retired?.getAttribute("data-span-newest")).toBe(OLDEST);
  });

  test("the marker does not disturb the heading slug the overview cards link at", async () => {
    const root = await renderPage();
    const headingIds = root.querySelectorAll("h3").map((h) => h.getAttribute("id"));
    const cardTargets = root
      .querySelectorAll(".api-overview li a")
      .map((a) => (a.getAttribute("href") ?? "").slice(1));
    expect(cardTargets.length).toBeGreaterThan(0);
    for (const target of cardTargets) expect(headingIds).toContain(target);
  });
});

describe("applySinceFilter", () => {
  test("hides an out-of-window symbol and the body that follows it", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    const retired = headingFor(root, "demo.retired");
    expect(visible(retired)).toBe(false);
    // The body is a sibling, not a wrapper, so an orphaned body is the natural bug.
    expect(bodyAfter(retired)?.className).toContain("api-symbol-body");
    expect(visible(bodyAfter(retired))).toBe(false);
  });

  test("leaves every in-window symbol and its body visible", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    for (const name of ["demo.always", "demo.plain", "demo.recent"]) {
      const heading = headingFor(root, name);
      expect(visible(heading)).toBe(true);
      expect(visible(bodyAfter(heading))).toBe(true);
    }
  });

  test("hides the overview card that deep-links at a hidden symbol", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    const retiredId = headingFor(root, "demo.retired")?.getAttribute("id");
    const cards = root.querySelectorAll(".api-overview li");
    const retiredCard = cards.find(
      (li) => li.querySelector("a")?.getAttribute("href") === `#${retiredId}`,
    );
    expect(visible(retiredCard)).toBe(false);
    expect(cards.filter((li) => visible(li))).toHaveLength(3);
  });

  test("is idempotent, and widening `from` again restores every symbol", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, AXIS_CONFIG);
    for (const name of ["demo.always", "demo.plain", "demo.recent", "demo.retired"]) {
      const heading = headingFor(root, name);
      expect(visible(heading)).toBe(true);
      expect(visible(bodyAfter(heading))).toBe(true);
    }
    expect(root.querySelectorAll(".api-overview li").filter((li) => visible(li))).toHaveLength(4);
  });

  test("narrows to a single version without hiding what that version still has", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: NEWEST, to: PAGE_TO }, AXIS_CONFIG);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
  });

  test("an unknown `from` is treated as the full range rather than hiding the page", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: "9.9.9", to: PAGE_TO }, AXIS_CONFIG);
    expect(root.querySelectorAll("h3").every((h) => visible(h))).toBe(true);
  });

  test("the table's triple for the active window equals the dots the page shows", async () => {
    const root = await renderPage();
    const config = configFor(AXIS, TABLE);
    const agree = () =>
      expect(pillsFor(root, "demo")).toEqual({
        new: visibleTally(root, "new"),
        changed: visibleTally(root, "changed"),
      });

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(visibleTally(root, "changed")).toBe(1);
    agree();

    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, config);
    // The one Changed symbol is the one the window drops, so the pill must fall.
    expect(visibleTally(root, "changed")).toBe(0);
    agree();

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(visibleTally(root, "changed")).toBe(1);
    agree();
  });

  test("every leaf recounts, not only the one the reader is on", async () => {
    const root = await renderPage();
    const config = configFor(AXIS, TABLE);

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(pillsFor(root, "other")).toEqual({ new: 2, changed: 1 });
    // A pill announces the tally it is showing: the label is the only place the
    // category is named, so a stale one misreads the control outright.
    expect(labelsFor(root, "other")).toEqual(serverLabels({ new: 2, changed: 1, deprecated: 0 }));

    applySinceFilter(root, { from: MIDDLE, to: PAGE_TO }, config);
    expect(pillsFor(root, "other")).toEqual({ new: 1, changed: 0 });
    expect(labelsFor(root, "other")).toEqual(serverLabels({ new: 1, changed: 0, deprecated: 0 }));

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(pillsFor(root, "other")).toEqual({ new: 2, changed: 1 });
    expect(labelsFor(root, "other")).toEqual(serverLabels({ new: 2, changed: 1, deprecated: 0 }));
  });

  test("a leaf the table has no triple for renders no pills", async () => {
    const root = await renderPage();
    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, configFor(AXIS, TABLE));
    expect(pillsFor(root, "absent")).toEqual({ new: 0 });
  });

  test("a window the table omits leaves every leaf pill-less", async () => {
    const root = await renderPage();
    // `{NEWEST, NEWEST}` marks nothing anywhere, so the builder omits it entirely.
    applySinceFilter(root, { from: NEWEST, to: PAGE_TO }, configFor(AXIS, TABLE));
    expect(pillsFor(root, "demo")).toEqual({ new: 0, changed: 0 });
    expect(pillsFor(root, "other")).toEqual({ new: 0, changed: 0 });
  });
});

describe("data-span-cats", () => {
  const catsOf = (root: MiniElement, name: string) =>
    headingFor(root, name)?.querySelector("[data-span-cats]")?.getAttribute("data-span-cats");

  test("one field per axis index, naming the category that `from` would give", async () => {
    const root = await renderPage();
    // Field i answers "if the reader set `from` to AXIS[i], what would this
    // symbol be?" — read against the page's own `to`, the newest here.
    expect(catsOf(root, "demo.always")).toBe("-|-|-");
    expect(catsOf(root, "demo.plain")).toBe("-|-|-");
    expect(catsOf(root, "demo.recent")).toBe("-|N|N");
    expect(catsOf(root, "demo.retired")).toBe("-|-|C");
  });

  test("fields newer than the page's `to` are inert", async () => {
    const root = await renderPage(AXIS, { from: OLDEST, to: MIDDLE });
    // `from` can never be newer than `to`, so field 0 is unreachable and says so
    // rather than describing a window the reader cannot select.
    expect(catsOf(root, "demo.recent")).toBe("-|-|-");
    expect(catsOf(root, "demo.retired")).toBe("-|-|C");
    expect(catsOf(root, "demo.always")).toBe("-|-|-");
  });

  test("the letters agree with the categories the same window renders", async () => {
    // The oracle is `windowedBadgeCategory` itself, so the marker cannot drift
    // from the derivation the server dots come from.
    const root = await renderPage();
    for (const [name, availableIn] of [
      ["demo.always", AXIS],
      ["demo.recent", [NEWEST]],
      ["demo.retired", [OLDEST]],
    ] as const) {
      const expected = AXIS.map((from) => {
        const c = windowedBadgeCategory(availableIn, undefined, AXIS, { from, to: NEWEST });
        const letters = `${c.isNew ? "N" : ""}${c.isChanged ? "C" : ""}${c.isDeprecated ? "D" : ""}`;
        return letters || "-";
      }).join("|");
      expect({ name, cats: catsOf(root, name) }).toEqual({ name, cats: expected });
    }
  });
});

describe("dots follow the active `from`", () => {
  const dotVisible = (root: MiniElement, name: string, kind: string) =>
    headingFor(root, name)
      ?.querySelectorAll(`[class*=api-badge-dot--${kind}]`)
      .some((dot) => visible(dot)) ?? false;

  test("narrowing hides a dot the window no longer justifies, and widening restores it", async () => {
    const root = await renderPage();
    const config = configFor(AXIS, TABLE);

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(dotVisible(root, "demo.recent", "new")).toBe(true);

    // `demo.recent` survives a `from` of NEWEST — it is present in that version —
    // but inside `{NEWEST, NEWEST}` it did not move, so it must lose its dot
    // while keeping its row. Hiding rows but leaving stale dots is today's bug.
    applySinceFilter(root, { from: NEWEST, to: PAGE_TO }, config);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
    expect(dotVisible(root, "demo.recent", "new")).toBe(false);

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(dotVisible(root, "demo.recent", "new")).toBe(true);
  });

  test("the overview card's marker follows its heading", async () => {
    const root = await renderPage();
    const config = configFor(AXIS, TABLE);
    const cardFor = (name: string) => {
      const id = headingFor(root, name)?.getAttribute("id");
      return root
        .querySelectorAll(".api-overview li")
        .find((li) => li.querySelector("a")?.getAttribute("href") === `#${id}`);
    };
    const cardDot = (name: string, kind: string) =>
      cardFor(name)
        ?.querySelectorAll(`[class*=api-badge-dot--${kind}]`)
        .some((dot) => visible(dot)) ?? false;

    applySinceFilter(root, { from: OLDEST, to: PAGE_TO }, config);
    expect(cardDot("demo.recent", "new")).toBe(true);

    applySinceFilter(root, { from: NEWEST, to: PAGE_TO }, config);
    expect(cardDot("demo.recent", "new")).toBe(false);
  });
});

// A symbol present in the newest and oldest versions but not the middle one.
// Its full-range span is gapped (Changed), yet inside `{MIDDLE, NEWEST}` it
// reads as New — so a category the page does not show at its own window still
// has to be reachable. This is the case that decides what the server must emit.
describe("a gapped span gains a category the full range does not show", () => {
  const gappedPage = (): ApiPage => {
    const page = demoPage();
    const key = symbolIdentityKey(identity("demo.gapped"));
    const records = new Map(page.availability?.records ?? []);
    records.set(key, { identity: identity("demo.gapped"), availableIn: [NEWEST, OLDEST] });
    return {
      ...page,
      module: { ...page.module, functions: [...page.module.functions, fn("demo.gapped")] },
      availability: {
        versions: [...AXIS],
        records,
        transitions: new Set<string>(),
      },
    };
  };

  const renderGapped = async (): Promise<MiniElement> => {
    const html = await renderMarkdown(
      apiPageMarkdown(gappedPage(), (t) => t, {
        combinedMarkers: true,
        window: { from: OLDEST, to: NEWEST },
      }),
      { highlightSignatureHeadings: true },
    );
    return parseHtml(`<main>${html}</main>${sidebarHtml()}`);
  };

  test("its marker names Changed at the full range and New one step in", async () => {
    const root = await renderGapped();
    expect(
      headingFor(root, "demo.gapped")
        ?.querySelector("[data-span-cats]")
        ?.getAttribute("data-span-cats"),
    ).toBe("-|N|C");
  });

  test("the New dot is emitted though the page's own window shows Changed", async () => {
    const root = await renderGapped();
    const dot = (kind: string) =>
      headingFor(root, "demo.gapped")
        ?.querySelectorAll(`[class*=api-badge-dot--${kind}]`)
        .some((d) => visible(d)) ?? false;
    const config = configFor(AXIS, TABLE);

    applySinceFilter(root, { from: OLDEST, to: NEWEST }, config);
    expect({ new: dot("new"), changed: dot("changed") }).toEqual({ new: false, changed: true });

    // The client only toggles display, so the New span must already be in the
    // markup — a server that emitted only the active category cannot get here.
    applySinceFilter(root, { from: MIDDLE, to: NEWEST }, config);
    expect({ new: dot("new"), changed: dot("changed") }).toEqual({ new: true, changed: false });
  });
});

// The renderer hands the filter route ids on both arguments — `range.from` and
// `C.versionIds` are `defold-`-prefixed — while the page's span markers carry bare
// semver. These drive the filter in that vocabulary, so the pair can never drift
// apart again without a red.
const PREFIXED_AXIS = [NEWEST, MIDDLE, OLDEST].map((v) => `defold-${v}`);

const prefixedConfig = (): ApiSurfaceConfig => configFor(PREFIXED_AXIS);

describe("applySinceFilter under the route-id vocabulary", () => {
  test("a prefixed bound hides the out-of-window symbol, its body and its card", async () => {
    const root = await renderPage();
    applySinceFilter(
      root,
      { from: `defold-${MIDDLE}`, to: `defold-${NEWEST}` },
      configFor(PREFIXED_AXIS),
    );

    const retired = headingFor(root, "demo.retired");
    expect(visible(retired)).toBe(false);
    expect(bodyAfter(retired)?.className).toContain("api-symbol-body");
    expect(visible(bodyAfter(retired))).toBe(false);

    const cards = root.querySelectorAll(".api-overview li");
    const retiredCard = cards.find(
      (li) => li.querySelector("a")?.getAttribute("href") === `#${retired?.getAttribute("id")}`,
    );
    expect(visible(retiredCard)).toBe(false);

    for (const name of ["demo.always", "demo.plain", "demo.recent"]) {
      const heading = headingFor(root, name);
      expect(visible(heading)).toBe(true);
      expect(visible(bodyAfter(heading))).toBe(true);
    }
  });

  test("the sidebar pills are recounted from the table under a prefixed bound", async () => {
    const root = await renderPage();
    applySinceFilter(
      root,
      { from: `defold-${MIDDLE}`, to: `defold-${NEWEST}` },
      configFor(PREFIXED_AXIS, tableFor(PREFIXED_AXIS)),
    );
    // The one Changed symbol is the one the window drops, so the pill must fall.
    expect(visibleTally(root, "changed")).toBe(0);
    expect(pillsFor(root, "demo")).toEqual({
      new: visibleTally(root, "new"),
      changed: visibleTally(root, "changed"),
    });
  });

  test("the bound the production range reader supplies is the one that narrows", async () => {
    const root = await renderPage();
    const config = prefixedConfig();
    // `_renderer.tsx` filters with `readStoredRange(...).from` and `C.versionIds`;
    // joining the two production surfaces here is that call with the `.toString()`
    // serialization removed, so neither side is a transcribed constant.
    const range = readStoredRange(
      `/api/defold-${MIDDLE}/demo`,
      `?since=defold-${MIDDLE}`,
      null,
      config,
    );
    expect(range.from).toBe(`defold-${MIDDLE}`);

    applySinceFilter(root, range, config);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
  });

  test("a bare bound filters a page whose spans were written in the prefixed vocabulary", async () => {
    // The mirror of the case above: the markers carry route ids and the bound is
    // bare, so the marker side of the normalization is the only thing that can
    // resolve them. `apiPageMarkdown` writes the spans, so neither axis is transcribed.
    const root = await renderPage(PREFIXED_AXIS);
    expect(
      headingFor(root, "demo.retired")
        ?.querySelector("[data-span-newest]")
        ?.getAttribute("data-span-newest"),
    ).toBe(`defold-${OLDEST}`);

    applySinceFilter(root, { from: MIDDLE, to: NEWEST }, configFor([NEWEST, MIDDLE, OLDEST]));
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
  });

  test("an unknown prefixed `from` still widens to the full range", async () => {
    const root = await renderPage();
    applySinceFilter(
      root,
      { from: "defold-9.9.9", to: `defold-${NEWEST}` },
      configFor(PREFIXED_AXIS),
    );
    expect(root.querySelectorAll("h3").every((h) => visible(h))).toBe(true);
    expect(root.querySelectorAll(".api-overview li").every((li) => visible(li))).toBe(true);
  });
});

// The pre-paint `<script>` embeds this with `.toString()`, so its body runs with
// no module scope at all. Re-evaluating it through `new Function` reproduces
// exactly that isolation: any module-scope reference throws here while
// type-checking and the normal in-module call both stay green.
describe("pre-paint serialization contract", () => {
  test("applySinceFilter runs with no module scope", async () => {
    const root = await renderPage();
    const isolated = new Function(
      `"use strict";return (${String(applySinceFilter)});`,
    )() as typeof applySinceFilter;
    isolated(root, { from: MIDDLE, to: PAGE_TO }, AXIS_CONFIG);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
  });
});

// A namespace-parameterized identity + module pair, so a second namespace can be
// built from the same `fn` factory the demo page uses.
const funcIdent = (namespace: string, f: ApiFunction): ApiSymbolIdentity => ({
  namespace,
  kind: "FUNCTION",
  name: f.name,
  signature: normalizedFunctionSignature(f),
});

const moduleOf = (namespace: string, functions: ApiFunction[]): ApiModule => ({
  namespace,
  brief: "",
  description: "",
  functions,
  variables: [],
  constants: [],
  properties: [],
  typedefs: [],
});

// The case the committed corpus does not contain: a namespace whose `New` tally
// is zero at the window its page was rendered at and non-zero one step in. The
// client only toggles `display`, so that pill has to be in the markup already —
// every count and every window key below comes from the production builders, so
// a wrong expectation cannot agree with itself.
describe("a category reachable only by narrowing is already in the markup", () => {
  const gapped = fn("gapped.comes_back");
  const steady = fn("gapped.always_there");
  const gappedId = funcIdent("gapped", gapped);
  const steadyId = funcIdent("gapped", steady);

  // Present in the newest and the oldest, absent from the middle: at the full
  // range that reads Changed, and at `{MIDDLE, NEWEST}` it reads New.
  const surfaces: CombinedVersionSurface[] = [
    { version: NEWEST, modules: [moduleOf("gapped", [gapped, steady])] },
    { version: MIDDLE, modules: [moduleOf("gapped", [steady])] },
    { version: OLDEST, modules: [moduleOf("gapped", [gapped, steady])] },
  ];
  const signatures: SignaturesArtifact = {
    versions: Object.fromEntries(
      AXIS.map((version) => [
        version,
        version === MIDDLE
          ? { [symbolIdentityKey(steadyId)]: "function always_there(): void;" }
          : {
              [symbolIdentityKey(gappedId)]: "function comes_back(): void;",
              [symbolIdentityKey(steadyId)]: "function always_there(): void;",
            },
      ]),
    ),
  };
  const combined = buildCombinedSurface({
    surfaces,
    signatures,
    overlay: { versions: [...AXIS], transitions: new Set(), records: new Map() },
  });
  const ns = combined.namespaces.find((n) => n.namespace === "gapped");
  if (!ns) throw new Error("gapped namespace missing from the combined surface");

  const FULL = { from: OLDEST, to: NEWEST };
  const NARROW = { from: MIDDLE, to: NEWEST };
  const table = buildBadgeCountTable([ns], AXIS);
  const config = configFor(AXIS, table);

  test("the fixture really is gapped: New is zero at the full range and non-zero one step in", () => {
    // The premise every assertion below rests on. Stated against the production
    // tally so a fixture that stopped being gapped reds here, not silently.
    expect(namespaceBadgeCounts(ns, FULL).new).toBe(0);
    expect(namespaceBadgeCounts(ns, FULL).changed).toBe(1);
    expect(namespaceBadgeCounts(ns, NARROW).new).toBe(1);
    expect(namespaceBadgeCounts(ns, NARROW).changed).toBe(0);
  });

  // The sidebar leaf as `_renderer.tsx` builds it, at the window the page is
  // rendered for.
  const rootAtFullRange = () =>
    parseHtml(
      `<main></main><a href="/api/gapped">${navLeafBadgeHtml(table, "gapped", `${OLDEST}|${NEWEST}`)}</a>`,
    );

  test("the New pill ships hidden and narrowing reveals it", () => {
    const root = rootAtFullRange();
    // Present in the markup before any filtering — the browser cannot create it.
    expect(leafFor(root, "gapped").querySelectorAll("[class*=nav-badge-count--new]")).toHaveLength(
      1,
    );

    applySinceFilter(root, FULL, config);
    expect(pillsFor(root, "gapped")).toEqual({ new: 0, changed: 1 });

    applySinceFilter(root, NARROW, config);
    expect(pillsFor(root, "gapped")).toEqual({ new: 1, changed: 0 });
    expect(labelsFor(root, "gapped")).toEqual(serverLabels({ new: 1, changed: 0, deprecated: 0 }));

    applySinceFilter(root, FULL, config);
    expect(pillsFor(root, "gapped")).toEqual({ new: 0, changed: 1 });
    expect(labelsFor(root, "gapped")).toEqual(serverLabels({ new: 0, changed: 1, deprecated: 0 }));
  });
});
