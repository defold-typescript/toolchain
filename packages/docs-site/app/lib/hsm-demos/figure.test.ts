import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDDY_LIGHTS, BUDDY_POSES } from "./demos";
import { BUDDY_SVG, figureClass } from "./figure";

const STYLES_CSS = readFileSync(join(import.meta.dir, "../../styles.css"), "utf8");

function hasSelector(className: string): boolean {
  return new RegExp(`\\.${className}(?![\\w-])`).test(STYLES_CSS);
}

function sortedSet(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

describe("the buddy figure and its stylesheet", () => {
  test("every class the figure can carry has a rule", () => {
    for (const pose of BUDDY_POSES) {
      for (const light of BUDDY_LIGHTS) {
        for (const className of figureClass({ pose, light }).split(" ")) {
          expect(hasSelector(className), className).toBe(true);
        }
      }
    }
  });

  test("the drawing's parts are the parts the stylesheet styles", () => {
    const drawn = [...BUDDY_SVG.matchAll(/class="([^"]*)"/g)]
      .flatMap((match) => (match[1] as string).split(/\s+/))
      .filter((className) => className.startsWith("hsm-b-"));
    const styled = [...STYLES_CSS.matchAll(/\.(hsm-b-[\w-]+)/g)].map((match) => match[1] as string);
    expect(drawn.length).toBeGreaterThan(0);
    expect(sortedSet(drawn)).toEqual(sortedSet(styled));
  });
});
