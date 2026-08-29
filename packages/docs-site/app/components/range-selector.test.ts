import { describe, expect, test } from "bun:test";
import leftGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-left-duotone.svg?raw";
import rightGlyphRaw from "@phosphor-icons/core/duotone/arrow-fat-lines-right-duotone.svg?raw";
import type { ApiVersion } from "../lib/api-surface-loader";
import { buildRangeSelector } from "../lib/version-switch";
import { RangeColumn } from "./range-selector";

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
    expect(summary).toContain('aria-hidden="true"');
  });

  test("the oldest-tracked footnote keeps the full label", () => {
    expect(render("from")).toContain("Oldest tracked: Defold 1.12.0.");
    expect(render("to")).not.toContain("Oldest tracked:");
  });
});
