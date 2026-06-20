import { describe, expect, test } from "bun:test";
import { tooltipPosition } from "./tooltip-position";

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
