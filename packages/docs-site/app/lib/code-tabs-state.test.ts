import { describe, expect, test } from "bun:test";
import {
  type CodeTabsGroup,
  chooseTab,
  pageStorage,
  readStoredTab,
  restoreStoredTabs,
  selectTab,
  type TabStorage,
} from "./code-tabs-state";

function group(key: string, tabCount = 2, selected = 0): CodeTabsGroup {
  return { key, tabCount, selected };
}

function memoryStorage(entries: Record<string, string> = {}): TabStorage & {
  entries: Record<string, string>;
} {
  return {
    entries,
    getItem: (name) => entries[name] ?? null,
    setItem: (name, value) => {
      entries[name] = value;
    },
  };
}

const throwingStorage: TabStorage = {
  getItem: () => {
    throw new Error("storage disabled");
  },
  setItem: () => {
    throw new Error("storage disabled");
  },
};

describe("selectTab", () => {
  test("selects the tab in every group with the key and leaves other keys alone", () => {
    const groups = [group("config-builder"), group("typescript-lua"), group("config-builder")];
    selectTab(groups, "config-builder", 1);
    expect(groups.map((g) => g.selected)).toEqual([1, 0, 1]);
  });

  test("leaves a group without that tab on its current tab", () => {
    const groups = [group("config-builder", 2, 1), group("config-builder", 3, 0)];
    selectTab(groups, "config-builder", 2);
    expect(groups.map((g) => g.selected)).toEqual([1, 2]);
    selectTab(groups, "config-builder", -1);
    expect(groups.map((g) => g.selected)).toEqual([1, 2]);
  });
});

describe("stored tab choice", () => {
  test("a chosen tab is stored per key and restored to that key's groups on the next page", () => {
    const storage = memoryStorage();
    chooseTab([group("config-builder"), group("typescript-lua")], "config-builder", 1, storage);
    expect(storage.entries).toEqual({ "code-tabs:config-builder": "1" });
    expect(readStoredTab(storage, "config-builder")).toBe(1);
    expect(readStoredTab(storage, "typescript-lua")).toBeUndefined();

    const next = [group("typescript-lua"), group("config-builder"), group("config-builder")];
    restoreStoredTabs(next, storage);
    expect(next.map((g) => g.selected)).toEqual([0, 1, 1]);
  });

  test("a stored index a group does not have leaves that group on its current tab", () => {
    const storage = memoryStorage({ "code-tabs:config-builder": "2" });
    const groups = [group("config-builder", 2, 0), group("config-builder", 3, 0)];
    restoreStoredTabs(groups, storage);
    expect(groups.map((g) => g.selected)).toEqual([0, 2]);
  });

  test("a stored value that is not a tab index is no stored choice", () => {
    for (const value of ["", "abc", "-1", "1.5"]) {
      const storage = memoryStorage({ "code-tabs:config-builder": value });
      expect(readStoredTab(storage, "config-builder")).toBeUndefined();
      const groups = [group("config-builder", 3, 1)];
      restoreStoredTabs(groups, storage);
      expect(groups[0]?.selected).toBe(1);
    }
  });

  test("storage that throws yields no stored choice and still switches the page", () => {
    expect(readStoredTab(throwingStorage, "config-builder")).toBeUndefined();
    const groups = [group("config-builder"), group("config-builder")];
    expect(() => restoreStoredTabs(groups, throwingStorage)).not.toThrow();
    expect(() => chooseTab(groups, "config-builder", 1, throwingStorage)).not.toThrow();
    expect(groups.map((g) => g.selected)).toEqual([1, 1]);
  });

  test("a page whose storage cannot be reached has none, and selection still works", () => {
    const blocked = {
      get localStorage(): TabStorage {
        throw new Error("SecurityError");
      },
    };
    const storage = pageStorage(blocked);
    expect(storage).toBeUndefined();
    const groups = [group("typescript-lua")];
    restoreStoredTabs(groups, storage);
    chooseTab(groups, "typescript-lua", 1, storage);
    expect(groups[0]?.selected).toBe(1);
  });
});
