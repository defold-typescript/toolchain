import { describe, expect, test } from "bun:test";
import { labelTooltipPosition, tooltipPosition } from "./tooltip-position";

describe("tooltipPosition", () => {
  test("anchors below the symbol and caps maxHeight when there is ample room", () => {
    // top = rectBottom + GAP = 100 + 8 = 108; room below far exceeds the cap, so
    // maxHeight is CARD_MAX_H (320) and a taller brief scrolls.
    const pos = tooltipPosition({
      rectLeft: 50,
      rectBottom: 100,
      innerWidth: 1280,
      innerHeight: 1000,
    });
    expect(pos.top).toBe(108);
    expect(pos.maxHeight).toBe(320);
    expect(pos.left).toBe(50);
  });

  test("shrinks maxHeight to the space below near the viewport bottom, never negative", () => {
    // top = 708; maxHeight = innerHeight - top - MARGIN = 800 - 708 - 8 = 84.
    const near = tooltipPosition({
      rectLeft: 50,
      rectBottom: 700,
      innerWidth: 1280,
      innerHeight: 800,
    });
    expect(near.maxHeight).toBe(84);

    // top = 808 sits below innerHeight: 800 - 808 - 8 = -16, clamped to 0.
    const below = tooltipPosition({
      rectLeft: 50,
      rectBottom: 800,
      innerWidth: 1280,
      innerHeight: 800,
    });
    expect(below.maxHeight).toBe(0);
  });

  test("right-aligns the card near the right edge", () => {
    // left clamps to innerWidth - CARD_MAX_W - MARGIN = 1280 - 320 - 8 = 952.
    const pos = tooltipPosition({
      rectLeft: 1200,
      rectBottom: 100,
      innerWidth: 1280,
      innerHeight: 1000,
    });
    expect(pos.left).toBe(952);
  });

  test("keeps left at rectLeft when comfortable, lower-bounded by MARGIN", () => {
    const comfortable = tooltipPosition({
      rectLeft: 100,
      rectBottom: 100,
      innerWidth: 1280,
      innerHeight: 1000,
    });
    expect(comfortable.left).toBe(100);

    // rectLeft below MARGIN is raised to MARGIN (8).
    const flush = tooltipPosition({
      rectLeft: 2,
      rectBottom: 100,
      innerWidth: 1280,
      innerHeight: 1000,
    });
    expect(flush.left).toBe(8);
  });
});

describe("labelTooltipPosition", () => {
  const anchor = {
    rectLeft: 500,
    rectTop: 300,
    rectBottom: 320,
    rectWidth: 20,
    innerWidth: 1280,
    tipWidth: 60,
    tipHeight: 28,
  };

  test("centres the tip above the anchor when there is room", () => {
    // left = 500 + 20 / 2 - 60 / 2 = 480; top = rectTop - GAP - tipHeight = 300 - 6 - 28 = 266.
    expect(labelTooltipPosition(anchor)).toEqual({ top: 266, left: 480, placement: "top" });
  });

  test("clamps the tip inside the viewport margin at both edges", () => {
    expect(labelTooltipPosition({ ...anchor, rectLeft: 0 }).left).toBe(8);
    // innerWidth - tipWidth - MARGIN = 1280 - 60 - 8 = 1212.
    expect(labelTooltipPosition({ ...anchor, rectLeft: 1270 }).left).toBe(1212);
  });

  test("flips below the anchor when the space above is smaller than the tip", () => {
    // Space above = rectTop - GAP - MARGIN = 40 - 6 - 8 = 26 < 28, so top = rectBottom + GAP = 66.
    expect(labelTooltipPosition({ ...anchor, rectTop: 40, rectBottom: 60 })).toEqual({
      top: 66,
      left: 480,
      placement: "bottom",
    });
    // Exactly enough room (42 - 6 - 8 = 28) stays above.
    expect(labelTooltipPosition({ ...anchor, rectTop: 42, rectBottom: 62 }).placement).toBe("top");
  });
});
