import { describe, expect, test } from "bun:test";
import { EXTERNAL_LINK_ICON } from "@defold-typescript/docs-render/phosphor";
import { buildNav, type NavCategory } from "../lib/nav";
import { CategoryLink } from "./category-link";

function category(id: string): NavCategory {
  const found = buildNav([]).find((c) => c.id === id);
  if (!found) throw new Error(`no ${id} category`);
  return found;
}

const render = (id: string): string =>
  String(CategoryLink({ category: category(id), active: false }));

describe("CategoryLink", () => {
  test("the Libraries tab marks the site it leaves for with the external icon", () => {
    const html = render("libraries");
    expect(EXTERNAL_LINK_ICON).toContain('class="external-icon"');
    expect(html).toContain(EXTERNAL_LINK_ICON);
    expect(html).toContain(`href="${category("libraries").route}"`);
  });

  test("the Libraries tab opens in a new tab", () => {
    const html = render("libraries");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  test("a tab that stays on this site opens in place", () => {
    expect(render("api")).not.toContain("target=");
    expect(render("api")).not.toContain("rel=");
  });

  test("a tab that stays on this site carries no external icon", () => {
    expect(render("api")).toContain('href="/api"');
    expect(render("api")).not.toContain("external-icon");
    expect(render("guides")).not.toContain("external-icon");
  });
});
