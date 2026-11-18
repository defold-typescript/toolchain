import { describe, expect, test } from "bun:test";
import type { BadgeCountTable } from "@defold-typescript/docs-render/combined-surface";
import { cardBadgeHtml, navLeafBadgeHtml, navNamespaceBadges } from "./nav-badges";

describe("navNamespaceBadges (sidebar count pills)", () => {
  test("an all-zero namespace renders nothing", () => {
    expect(navNamespaceBadges({ new: 0, changed: 0, deprecated: 0 })).toBe("");
  });

  test("one nav-badge-count span per non-zero category, compact tally text + category aria-label", () => {
    const html = navNamespaceBadges({ new: 12, changed: 3, deprecated: 1 });
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--new" aria-label="12 new symbols">12</span>',
    );
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--changed" aria-label="3 changed symbols">3</span>',
    );
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--deprecated" aria-label="1 deprecated symbols">1</span>',
    );
    // Exactly three pills for three non-zero categories.
    expect(html.match(/nav-badge-count nav-badge-count--/g)).toHaveLength(3);
  });

  test("a zero category emits no pill", () => {
    const html = navNamespaceBadges({ new: 2, changed: 0, deprecated: 0 });
    expect(html).toContain("nav-badge-count--new");
    expect(html).not.toContain("nav-badge-count--changed");
    expect(html).not.toContain("nav-badge-count--deprecated");
  });

  test("a category only `emitted` carries rides along hidden", () => {
    const html = navNamespaceBadges(
      { new: 2, changed: 0, deprecated: 0 },
      {
        new: 2,
        changed: 5,
        deprecated: 0,
      },
    );
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--new" aria-label="2 new symbols">2</span>',
    );
    // The placeholder shows the *current* tally, not the reachable one: it is the
    // pill the reader would see if they narrowed, and until they do it reads 0.
    expect(html).toContain(
      '<span class="nav-badge-count nav-badge-count--changed" aria-label="0 changed symbols" style="display:none">0</span>',
    );
    expect(html).not.toContain("nav-badge-count--deprecated");
  });

  test("an emitted-nothing namespace still renders nothing, whatever the counts", () => {
    expect(
      navNamespaceBadges(
        { new: 4, changed: 1, deprecated: 0 },
        { new: 0, changed: 0, deprecated: 0 },
      ),
    ).toBe("");
  });

  test("a reachable category survives an all-zero active window", () => {
    // The window the page was rendered at can be all-zero while a narrower one is
    // not; collapsing that to `""` is what leaves the pill unreachable.
    const html = navNamespaceBadges(
      { new: 0, changed: 0, deprecated: 0 },
      {
        new: 3,
        changed: 0,
        deprecated: 0,
      },
    );
    expect(html).toContain('nav-badge-count--new" aria-label="0 new symbols" style="display:none"');
  });
});

describe("navLeafBadgeHtml (the sidebar leaf's pills, table -> markup)", () => {
  const TABLE: BadgeCountTable = {
    demo: { "c|a": [0, 1, 0], "b|a": [2, 0, 0] },
  };

  test("the active window sets the tallies, the whole row sets what is emitted", () => {
    const html = navLeafBadgeHtml(TABLE, "demo", "c|a");
    expect(html).toContain('nav-badge-count--changed" aria-label="1 changed symbols">1</span>');
    // `New` is zero at `c|a` but reachable at `b|a`, so it must be in the markup.
    expect(html).toContain('nav-badge-count--new" aria-label="0 new symbols" style="display:none"');
  });

  test("narrowing is a display change only — the same categories are emitted", () => {
    const wide = navLeafBadgeHtml(TABLE, "demo", "c|a");
    const narrow = navLeafBadgeHtml(TABLE, "demo", "b|a");
    const kinds = (html: string) => (html.match(/nav-badge-count--(\w+)/g) ?? []).sort();
    expect(kinds(narrow)).toEqual(kinds(wide));
    expect(narrow).toContain('nav-badge-count--new" aria-label="2 new symbols">2</span>');
    expect(narrow).toContain(
      'nav-badge-count--changed" aria-label="0 changed symbols" style="display:none"',
    );
  });

  test("a window the row omits still emits the reachable pills, all hidden", () => {
    const html = navLeafBadgeHtml(TABLE, "demo", "a|a");
    expect(html).toContain('nav-badge-count--new" aria-label="0 new symbols" style="display:none"');
    expect(html).toContain(
      'nav-badge-count--changed" aria-label="0 changed symbols" style="display:none"',
    );
  });

  test("a namespace the table omits renders nothing", () => {
    expect(navLeafBadgeHtml(TABLE, "absent", "c|a")).toBe("");
  });
});

describe("cardBadgeHtml (API landing card pills)", () => {
  const TABLE: BadgeCountTable = {
    demo: { "c|a": [2, 1, 0], "b|a": [0, 0, 0] },
  };

  test("labeled pills for the active window's non-zero categories", () => {
    expect(cardBadgeHtml(TABLE, "demo", "c|a")).toBe(
      '<span class="api-badge-counts" aria-label="Availability summary">' +
        '<span class="api-badge-count api-badge-count--new" aria-label="2 new symbols">2 new</span>' +
        '<span class="api-badge-count api-badge-count--changed" aria-label="1 changed symbols">1 changed</span>' +
        "</span>",
    );
  });

  test("a window with no counts, one the row omits, and an absent namespace render nothing", () => {
    expect(cardBadgeHtml(TABLE, "demo", "b|a")).toBe("");
    expect(cardBadgeHtml(TABLE, "demo", "a|a")).toBe("");
    expect(cardBadgeHtml(TABLE, "absent", "c|a")).toBe("");
  });
});
