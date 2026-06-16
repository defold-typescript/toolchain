import { describe, expect, test } from "bun:test";
import { sidebarScrollTop } from "./sidebar-scroll";

describe("sidebarScrollTop", () => {
  test("keeps viewTop unchanged when the active entry is already fully visible", () => {
    const viewTop = sidebarScrollTop({
      targetTop: 40,
      targetHeight: 20,
      viewTop: 0,
      viewHeight: 200,
      maxScroll: 800,
    });
    expect(viewTop).toBe(0);
  });

  test("centers an entry that sits below the fold", () => {
    // targetTop - viewHeight/2 + targetHeight/2 = 500 - 100 + 10 = 410
    const top = sidebarScrollTop({
      targetTop: 500,
      targetHeight: 20,
      viewTop: 0,
      viewHeight: 200,
      maxScroll: 800,
    });
    expect(top).toBe(410);
  });

  test("clamps the centered value to [0, maxScroll]", () => {
    // near the very bottom: 790 - 100 + 10 = 700, clamped to maxScroll 700
    const bottom = sidebarScrollTop({
      targetTop: 790,
      targetHeight: 20,
      viewTop: 0,
      viewHeight: 200,
      maxScroll: 700,
    });
    expect(bottom).toBe(700);

    // near the top while view is scrolled down: 5 - 100 + 10 = -85, clamped to 0
    const top = sidebarScrollTop({
      targetTop: 5,
      targetHeight: 20,
      viewTop: 300,
      viewHeight: 200,
      maxScroll: 700,
    });
    expect(top).toBe(0);
  });

  test("scrolls up to reveal an entry above the current viewTop", () => {
    // entry above the band: 120 - 150 + 15 = -15, clamped to 0
    const top = sidebarScrollTop({
      targetTop: 120,
      targetHeight: 30,
      viewTop: 300,
      viewHeight: 300,
      maxScroll: 900,
    });
    expect(top).toBe(0);

    // entry above the band but mid-list: 600 - 150 + 15 = 465
    const mid = sidebarScrollTop({
      targetTop: 600,
      targetHeight: 30,
      viewTop: 800,
      viewHeight: 300,
      maxScroll: 900,
    });
    expect(mid).toBe(465);
  });
});
