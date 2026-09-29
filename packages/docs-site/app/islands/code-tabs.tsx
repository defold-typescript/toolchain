import { useEffect } from "hono/jsx";

/**
 * Switches the TypeScript/Lua tab groups the markdown pipeline renders.
 *
 * The groups are server markup (`[data-code-tabs]`: a tab list of
 * `.code-tab` buttons, then one `.code-tabs-panel` per tab in the same order),
 * so first paint already shows the first tab. One delegated click listener on
 * the article selects the clicked tab and shows its panel, within that group
 * alone.
 */
export default function CodeTabs() {
  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;
    const onClick = (event: Event) => {
      const tab = (event.target as Element | null)?.closest<HTMLElement>(".code-tab");
      const group = tab?.closest<HTMLElement>("[data-code-tabs]");
      if (!tab || !group) return;
      const tabs = Array.from(group.querySelectorAll<HTMLElement>(".code-tab"));
      const panels = Array.from(group.querySelectorAll<HTMLElement>(".code-tabs-panel"));
      const selected = tabs.indexOf(tab);
      tabs.forEach((each, i) => {
        each.setAttribute("aria-selected", String(i === selected));
      });
      panels.forEach((panel, i) => {
        panel.hidden = i !== selected;
      });
    };
    article.addEventListener("click", onClick);
    return () => article.removeEventListener("click", onClick);
  }, []);

  return <div class="code-tabs-root" style={{ display: "contents" }} />;
}
