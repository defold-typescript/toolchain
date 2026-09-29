import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { examplesHtmlToMarkdown } from "@defold-typescript/types";
import { exampleMarkdownFor } from "./api-surface";
import { loadApiSurface } from "./api-surface-loader";

const REAL_TYPES_DIR = join(import.meta.dir, "../../../types");

// Every malformed upstream example (`go.get`, `resource.*`, `gui.new_texture`,
// the `sys`/`render`/`json` shapes) is hand-translated, so it renders TypeScript;
// the untranslated residual is all well-formed Lua. Either way the rendered
// example markdown must carry no raw HTML, no leaked entity, and no fence
// delimiter glued to surrounding prose. A translated example also carries its
// source as a `lua original` fence right after the TypeScript one.
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
          if (line.includes("```") && !/^```[a-z]*( original)?$/.test(line.trim())) {
            problems.push(`glued fence: ${JSON.stringify(line)}`);
          }
        }
        if (problems.length > 0) offenders.push(`${fn.name}: ${problems.join(", ")}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  test("every rendered example is TypeScript — each ```lua fence is the source of the ```ts fence before it", () => {
    const luaFallbacks: string[] = [];
    const sourceMismatches: string[] = [];
    let rendered = 0;
    for (const page of pages) {
      // Lua-stdlib pages (`base`, `bit`, …) are pure-Lua surfaces whose types
      // come from `lua-types`; they are intentionally rendered with the Lua
      // fence because no hand-authored TypeScript translation exists for them.
      if (page.category === "lua-stdlib") continue;
      for (const fn of page.module.functions) {
        const md = exampleMarkdownFor(fn, page.translations);
        if (md === undefined) continue;
        rendered++;
        const { fences, unpairedLua } = readFences(md);
        if (unpairedLua) luaFallbacks.push(fn.name);
        const sources = fences.filter((f) => f.info.endsWith(" original")).map((f) => f.body);
        const expected = readFences(examplesHtmlToMarkdown(fn.examples ?? "")).fences.map(
          (f) => f.body,
        );
        if (JSON.stringify(sources) !== JSON.stringify(expected)) sourceMismatches.push(fn.name);
      }
    }
    expect(rendered).toBeGreaterThan(0);
    expect(luaFallbacks).toEqual([]);
    expect(sourceMismatches).toEqual([]);
  });
});

// Every fence in rendered example markdown, in order, and whether any ```lua
// fence is not a `lua original` directly after a closed ```ts fence (only blank
// lines between).
function readFences(md: string): {
  fences: { info: string; body: string }[];
  unpairedLua: boolean;
} {
  const lines = md.split("\n");
  const fences: { info: string; body: string; open: number; close: number }[] = [];
  for (let open = 0; open < lines.length; open++) {
    const info = lines[open]?.match(/^```(.*)$/)?.[1];
    if (info === undefined) continue;
    let close = open + 1;
    while (close < lines.length && lines[close] !== "```") close++;
    fences.push({ info, body: lines.slice(open + 1, close).join("\n"), open, close });
    open = close;
  }
  const unpairedLua = fences.some((fence, i) => {
    if (!fence.info.startsWith("lua")) return false;
    const previous = fences[i - 1];
    if (fence.info !== "lua original" || previous?.info !== "ts") return true;
    return lines.slice(previous.close + 1, fence.open).some((line) => line.trim() !== "");
  });
  return { fences: fences.map(({ info, body }) => ({ info, body })), unpairedLua };
}
