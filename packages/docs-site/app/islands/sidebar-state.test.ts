import { describe, expect, test } from "bun:test";
import { applySidebarState, nextSidebarState, readSidebarState } from "./sidebar-state";

describe("readSidebarState", () => {
  test("reads open from the data-sidebar attribute", () => {
    expect(readSidebarState({ dataset: { sidebar: "open" } })).toBe("open");
  });

  test("treats an unset attribute as closed", () => {
    expect(readSidebarState({ dataset: {} })).toBe("closed");
  });

  test("treats any non-open value as closed", () => {
    expect(readSidebarState({ dataset: { sidebar: "closed" } })).toBe("closed");
    expect(readSidebarState({ dataset: { sidebar: "" } })).toBe("closed");
  });
});

describe("nextSidebarState", () => {
  test("toggle flips closed to open", () => {
    expect(nextSidebarState("closed", "toggle")).toBe("open");
  });

  test("toggle flips open to closed", () => {
    expect(nextSidebarState("open", "toggle")).toBe("closed");
  });

  test("close always yields closed", () => {
    expect(nextSidebarState("open", "close")).toBe("closed");
    expect(nextSidebarState("closed", "close")).toBe("closed");
  });
});

describe("applySidebarState", () => {
  test("open writes the attribute", () => {
    const root = { dataset: {} as Record<string, string | undefined> };
    applySidebarState(root, "open");
    expect(root.dataset.sidebar).toBe("open");
  });

  test("closed removes the attribute", () => {
    const root = { dataset: { sidebar: "open" } as Record<string, string | undefined> };
    applySidebarState(root, "closed");
    expect(root.dataset.sidebar).toBeUndefined();
  });
});
