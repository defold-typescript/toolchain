import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { exampleMarkdownFor, loadApiSurface } from "./api-surface";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// Every malformed upstream example (`go.get`, `resource.*`, `gui.new_texture`,
// the `sys`/`render`/`json` shapes) is hand-translated, so it renders TypeScript;
// the untranslated residual is all well-formed Lua. Either way the rendered
// example markdown must carry no raw HTML, no leaked entity, and no fence
// delimiter glued to surrounding prose.
const FORBIDDEN = [
  "<span",
  "<div",
  "<code",
  "<pre",
  "class=",
  "codehilite",
  "&quot;",
  "&amp;",
  "&lt;",
];

describe("no malformed example reaches /api", () => {
  const pages = loadApiSurface(REAL_TYPES_DIR);

  test("renders clean markdown for every function example in the corpus", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const page of pages) {
      for (const fn of page.module.functions) {
        const md = exampleMarkdownFor(fn, page.translations);
        if (md === undefined) continue;
        checked++;
        const problems: string[] = [];
        for (const needle of FORBIDDEN) {
          if (md.includes(needle)) problems.push(needle);
        }
        for (const line of md.split("\n")) {
          if (line.includes("```") && !/^```[a-z]*$/.test(line.trim())) {
            problems.push(`glued fence: ${JSON.stringify(line)}`);
          }
        }
        if (problems.length > 0) offenders.push(`${fn.name}: ${problems.join(", ")}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("every rendered example is TypeScript — no ```lua fallback survives", () => {
    const luaFallbacks: string[] = [];
    let rendered = 0;
    for (const page of pages) {
      for (const fn of page.module.functions) {
        const md = exampleMarkdownFor(fn, page.translations);
        if (md === undefined) continue;
        rendered++;
        if (md.includes("```lua")) luaFallbacks.push(fn.name);
      }
    }
    expect(rendered).toBeGreaterThan(0);
    expect(luaFallbacks).toEqual([]);
  });
});
