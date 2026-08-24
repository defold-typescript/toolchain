import { describe, expect, test } from "bun:test";
import { normalizedFunctionSignature, symbolIdentityKey } from "@defold-typescript/types";
import { type MiniElement, parseHtml } from "./__fixtures__/mini-dom";
import { apiPageMarkdown, navNamespaceBadges } from "./api-page-render";
import type { ApiPage, AvailabilityLookup } from "./api-surface";
import { type ApiSurfaceConfig, readStoredRange } from "./api-surface-pref";
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
  return `<a href="/api/demo" aria-current="page">${navNamespaceBadges({
    new: 1,
    changed: 1,
    deprecated: 0,
  })}</a>`;
}

async function renderPage(axis: readonly string[] = AXIS): Promise<MiniElement> {
  const html = await renderMarkdown(
    apiPageMarkdown(demoPage(axis), (t) => t, { combinedMarkers: true }),
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

const pills = (root: MiniElement) =>
  Object.fromEntries(
    root
      .querySelectorAll("[class*=nav-badge-count--]")
      .map((pill) => [
        (/nav-badge-count--(\w+)/.exec(pill.className)?.[1] ?? "") as string,
        visible(pill) ? Number(pill.textContent) : 0,
      ]),
  );

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
    applySinceFilter(root, MIDDLE, AXIS);
    const retired = headingFor(root, "demo.retired");
    expect(visible(retired)).toBe(false);
    // The body is a sibling, not a wrapper, so an orphaned body is the natural bug.
    expect(bodyAfter(retired)?.className).toContain("api-symbol-body");
    expect(visible(bodyAfter(retired))).toBe(false);
  });

  test("leaves every in-window symbol and its body visible", async () => {
    const root = await renderPage();
    applySinceFilter(root, MIDDLE, AXIS);
    for (const name of ["demo.always", "demo.plain", "demo.recent"]) {
      const heading = headingFor(root, name);
      expect(visible(heading)).toBe(true);
      expect(visible(bodyAfter(heading))).toBe(true);
    }
  });

  test("hides the overview card that deep-links at a hidden symbol", async () => {
    const root = await renderPage();
    applySinceFilter(root, MIDDLE, AXIS);
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
    applySinceFilter(root, MIDDLE, AXIS);
    applySinceFilter(root, MIDDLE, AXIS);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);

    applySinceFilter(root, OLDEST, AXIS);
    for (const name of ["demo.always", "demo.plain", "demo.recent", "demo.retired"]) {
      const heading = headingFor(root, name);
      expect(visible(heading)).toBe(true);
      expect(visible(bodyAfter(heading))).toBe(true);
    }
    expect(root.querySelectorAll(".api-overview li").filter((li) => visible(li))).toHaveLength(4);
  });

  test("narrows to a single version without hiding what that version still has", async () => {
    const root = await renderPage();
    applySinceFilter(root, NEWEST, AXIS);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
  });

  test("an unknown `from` is treated as the full range rather than hiding the page", async () => {
    const root = await renderPage();
    applySinceFilter(root, "9.9.9", AXIS);
    expect(root.querySelectorAll("h3").every((h) => visible(h))).toBe(true);
  });

  test("the sidebar count pills agree with the symbols still on the page", async () => {
    const root = await renderPage();
    // Both sides are read off the same rendered DOM, so this compares two
    // production surfaces to each other rather than either to a constant.
    const visibleTally = (kind: string) =>
      root
        .querySelectorAll("h3")
        .filter((h) => visible(h))
        .filter((h) => h.querySelector(`[class*=api-badge-dot--${kind}]`) !== null).length;

    expect(pills(root)).toEqual({ new: visibleTally("new"), changed: visibleTally("changed") });

    applySinceFilter(root, MIDDLE, AXIS);
    // The one Changed symbol is the one the window drops, so the pill must fall.
    expect(visibleTally("changed")).toBe(0);
    expect(pills(root)).toEqual({ new: visibleTally("new"), changed: visibleTally("changed") });

    applySinceFilter(root, OLDEST, AXIS);
    expect(visibleTally("changed")).toBe(1);
    expect(pills(root)).toEqual({ new: visibleTally("new"), changed: visibleTally("changed") });
  });
});

// The renderer hands the filter route ids on both arguments — `range.from` and
// `C.versionIds` are `defold-`-prefixed — while the page's span markers carry bare
// semver. These drive the filter in that vocabulary, so the pair can never drift
// apart again without a red.
const PREFIXED_AXIS = [NEWEST, MIDDLE, OLDEST].map((v) => `defold-${v}`);

const prefixedConfig = (): ApiSurfaceConfig => ({
  base: "",
  versionIds: PREFIXED_AXIS,
  defaultVersionId: PREFIXED_AXIS[0] as string,
  namespacesByVersion: Object.fromEntries(PREFIXED_AXIS.map((id) => [id, ["demo"]])),
});

describe("applySinceFilter under the route-id vocabulary", () => {
  test("a prefixed bound hides the out-of-window symbol, its body and its card", async () => {
    const root = await renderPage();
    applySinceFilter(root, `defold-${MIDDLE}`, PREFIXED_AXIS);

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

  test("the sidebar pills are recounted from the symbols a prefixed bound leaves", async () => {
    const root = await renderPage();
    const visibleTally = (kind: string) =>
      root
        .querySelectorAll("h3")
        .filter((h) => visible(h))
        .filter((h) => h.querySelector(`[class*=api-badge-dot--${kind}]`) !== null).length;

    applySinceFilter(root, `defold-${MIDDLE}`, PREFIXED_AXIS);
    // The one Changed symbol is the one the window drops, so the pill must fall.
    expect(visibleTally("changed")).toBe(0);
    expect(pills(root)).toEqual({ new: visibleTally("new"), changed: visibleTally("changed") });
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

    applySinceFilter(root, range.from, config.versionIds);
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

    applySinceFilter(root, MIDDLE, [NEWEST, MIDDLE, OLDEST]);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
    expect(visible(headingFor(root, "demo.recent"))).toBe(true);
  });

  test("an unknown prefixed `from` still widens to the full range", async () => {
    const root = await renderPage();
    applySinceFilter(root, "defold-9.9.9", PREFIXED_AXIS);
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
    isolated(root, MIDDLE, AXIS);
    expect(visible(headingFor(root, "demo.retired"))).toBe(false);
    expect(visible(headingFor(root, "demo.always"))).toBe(true);
  });
});
