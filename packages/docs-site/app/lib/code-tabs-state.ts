/**
 * Tab selection for the code tab groups the markdown pipeline renders. A group's
 * key names its tab set (`config-builder`, `typescript-lua`); choosing a tab
 * selects it in every group with that key and remembers it per key, so a reader
 * who prefers one spelling picks it once. The CodeTabs island binds these to the
 * DOM.
 */
export interface CodeTabsGroup {
  readonly key: string;
  readonly tabCount: number;
  selected: number;
}

export type TabStorage = Pick<Storage, "getItem" | "setItem">;

function storageKey(key: string): string {
  return `code-tabs:${key}`;
}

/** Selects tab `index` in every group keyed `key`; a group without that tab keeps its current one. */
export function selectTab(groups: Iterable<CodeTabsGroup>, key: string, index: number): void {
  for (const group of groups) {
    if (group.key === key && Number.isInteger(index) && index >= 0 && index < group.tabCount) {
      group.selected = index;
    }
  }
}

/** The page's `localStorage`, or none when reaching it throws (blocked storage, sandboxed frame). */
export function pageStorage(
  scope: { readonly localStorage: TabStorage } = globalThis,
): TabStorage | undefined {
  try {
    return scope.localStorage;
  } catch {
    return undefined;
  }
}

export function readStoredTab(storage: TabStorage | undefined, key: string): number | undefined {
  let value: string | null | undefined;
  try {
    value = storage?.getItem(storageKey(key));
  } catch {
    return undefined;
  }
  if (value == null || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

/** Selects the clicked tab across its key's groups and remembers it; a storage failure only skips the remembering. */
export function chooseTab(
  groups: Iterable<CodeTabsGroup>,
  key: string,
  index: number,
  storage: TabStorage | undefined,
): void {
  selectTab(groups, key, index);
  try {
    storage?.setItem(storageKey(key), String(index));
  } catch {
    // The choice still applies to this page; it just won't carry to the next.
  }
}

/** Applies each key's remembered tab to every group with that key. */
export function restoreStoredTabs(
  groups: readonly CodeTabsGroup[],
  storage: TabStorage | undefined,
): void {
  for (const key of new Set(groups.map((group) => group.key))) {
    const index = readStoredTab(storage, key);
    if (index !== undefined) selectTab(groups, key, index);
  }
}
