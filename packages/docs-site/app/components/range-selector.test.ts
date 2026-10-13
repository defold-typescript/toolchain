import { describe, expect, test } from "bun:test";
import leftGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-left-duotone.svg?raw";
import rightGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-right-duotone.svg?raw";
import type { ApiVersion } from "../lib/api-surface-loader";
import { buildRangeSelector } from "../lib/version-switch";
import { RangeColumn, RangeSelectorControls } from "./range-selector";

const NEWEST = "defold-1.13.0";
const MIDDLE = "defold-1.12.4";
const OLDEST = "defold-1.12.0";

const versions: ApiVersion[] = [
  { id: NEWEST, isDefault: true },
  { id: MIDDLE, isDefault: false },
  { id: OLDEST, isDefault: false },
];

// The real builder, so the column is rendered over the option vocabulary
// production hands it rather than a hand-written stand-in.
const selector = buildRangeSelector({
  versions,
  namespacesByVersion: { [NEWEST]: ["go"], [MIDDLE]: ["go"], [OLDEST]: ["go"] },
  route: "/api/defold-1.13.0/go",
  range: { from: MIDDLE, to: NEWEST },
});

const render = (bound: "from" | "to") =>
  String(
    RangeColumn({
      bound,
      label: bound === "from" ? "From" : "To",
      options: bound === "from" ? selector.from : selector.to,
      limit: bound === "from" ? selector.oldest?.label : undefined,
    }),
  );

// The closed `<summary>` runs to the first `</summary>`; everything after it is
// the popup. Splitting there is what lets one render assert that the two carry
// different labels.
function split(html: string): { summary: string; popup: string } {
  const end = html.indexOf("</summary>");
  expect(end).toBeGreaterThan(0);
  return { summary: html.slice(0, end), popup: html.slice(end) };
}

// The chevron further down the summary is decorative too, so an unscoped
// `aria-hidden` search is satisfied by either carrier. Locating the glyph's own
// wrapper by the `?raw` bytes production injects keeps each assertion on one.
function glyphWrapperTag(summary: string, glyph: string): string {
  const at = summary.indexOf(glyph);
  expect(at).toBeGreaterThan(0);
  const open = summary.lastIndexOf("<", at - 1);
  expect(open).toBeGreaterThan(-1);
  const close = summary.indexOf(">", open);
  expect(close).toBeGreaterThan(open);
  return summary.slice(open, close + 1);
}

describe("RangeColumn", () => {
  test("shows the bare version in the closed chrome and the full label in the popup", () => {
    const { summary, popup } = split(render("to"));
    expect(summary).toContain('data-range-summary="to">1.13.0<');
    expect(summary).not.toContain("Defold 1.13.0");
    for (const option of selector.to) {
      expect(popup).toContain(`>${option.label}<`);
    }
  });

  test("every option advertises its bare form, the source the reconciliation reads", () => {
    const popup = split(render("from")).popup;
    for (const option of selector.from) {
      expect(popup).toContain(`data-range-short="${option.shortLabel}"`);
    }
  });

  test("each bound gets its own direction glyph", () => {
    const from = render("from");
    const to = render("to");
    expect(from).toContain(rightGlyphRaw);
    expect(from).not.toContain(leftGlyphRaw);
    expect(to).toContain(leftGlyphRaw);
    expect(to).not.toContain(rightGlyphRaw);
  });

  test("the glyph is decorative and the bound keeps a screen-reader name", () => {
    const { summary } = split(render("from"));
    expect(summary).toContain("sr-only");
    expect(summary).toContain(">From<");
    expect(glyphWrapperTag(summary, rightGlyphRaw)).toContain('aria-hidden="true"');
    const afterGlyph = summary.slice(summary.indexOf(rightGlyphRaw) + rightGlyphRaw.length);
    expect(afterGlyph).toContain('aria-hidden="true"');
  });

  test("the oldest-tracked footnote keeps the full label", () => {
    expect(render("from")).toContain("Oldest tracked: Defold 1.12.0.");
    expect(render("to")).not.toContain("Oldest tracked:");
  });
});

describe("RangeSelectorControls", () => {
  // Both columns rendered through the real control, so the flag is asserted over
  // the wiring production uses rather than a prop passed in by the test.
  const controls = (to: string) =>
    String(
      RangeSelectorControls({
        selector: buildRangeSelector({
          versions,
          namespacesByVersion: { [NEWEST]: ["go"], [MIDDLE]: ["go"], [OLDEST]: ["go"] },
          route: `/api/${to}/go`,
          range: { from: OLDEST, to },
        }),
      }),
    );

  // The opening `<details>` tag of one column, which is where the flag lives.
  function columnTag(html: string, bound: "from" | "to"): string {
    const at = html.indexOf(`data-range-column="${bound}"`);
    expect(at).toBeGreaterThan(-1);
    return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
  }

  test("flags a To bound that stops short of the newest tracked version", () => {
    const to = columnTag(controls(MIDDLE), "to");
    expect(to).toContain(`data-range-newest="${NEWEST}"`);
    expect(to).toContain("data-range-stale");
  });

  test("leaves a To bound at the newest tracked version unflagged", () => {
    const to = columnTag(controls(NEWEST), "to");
    expect(to).toContain(`data-range-newest="${NEWEST}"`);
    expect(to).not.toContain("data-range-stale");
  });

  test("never flags the From column", () => {
    const from = columnTag(controls(MIDDLE), "from");
    expect(from).not.toContain("data-range-newest");
    expect(from).not.toContain("data-range-stale");
  });
});
