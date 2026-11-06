import { useEffect } from "hono/jsx";
import {
  type CodeTabsGroup,
  chooseTab,
  pageStorage,
  restoreStoredTabs,
} from "../lib/code-tabs-state";

interface RenderedGroup extends CodeTabsGroup {
  readonly tabs: HTMLElement[];
  readonly panels: HTMLElement[];
}

function readGroups(article: Element): RenderedGroup[] {
  return Array.from(article.querySelectorAll<HTMLElement>("[data-code-tabs]")).map((element) => {
    const tabs = Array.from(element.querySelectorAll<HTMLElement>(".code-tab"));
    const panels = Array.from(element.querySelectorAll<HTMLElement>(".code-tabs-panel"));
    const selected = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    return {
      key: element.dataset.codeTabs ?? "",
      tabCount: tabs.length,
      selected: Math.max(0, selected),
      tabs,
      panels,
    };
  });
}

function show(group: RenderedGroup): void {
  group.tabs.forEach((tab, i) => {
    tab.setAttribute("aria-selected", String(i === group.selected));
  });
  group.panels.forEach((panel, i) => {
    panel.hidden = i !== group.selected;
  });
}

/**
 * Switches the tab groups the markdown pipeline renders.
 *
 * The groups are server markup (`[data-code-tabs="<key>"]`: a tab list of
 * `.code-tab` buttons, then one `.code-tabs-panel` per tab in the same order),
 * so first paint already shows the first tab. On mount the island applies each
 * key's remembered tab; one delegated click listener on the article then selects
 * the clicked tab in every group with the clicked group's key and remembers it.
 * The selection rules live in `code-tabs-state`; this binds them to the DOM.
 */
export default function CodeTabs() {
  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;
    const storage = pageStorage();
    const mounted = readGroups(article);
    restoreStoredTabs(mounted, storage);
    mounted.forEach(show);
    const onClick = (event: Event) => {
      const tab = (event.target as Element | null)?.closest<HTMLElement>(".code-tab");
      const element = tab?.closest<HTMLElement>("[data-code-tabs]");
      if (!tab || !element) return;
      const index = Array.from(element.querySelectorAll(".code-tab")).indexOf(tab);
      const groups = readGroups(article);
      chooseTab(groups, element.dataset.codeTabs ?? "", index, storage);
      groups.forEach(show);
    };
    article.addEventListener("click", onClick);
    return () => article.removeEventListener("click", onClick);
  }, []);

  return <div class="code-tabs-root" style={{ display: "contents" }} />;
}
