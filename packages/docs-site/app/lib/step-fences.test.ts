/**
 * A `ts step` fence on the state machines tutorial is read twice. The docs site
 * shows each of its lines as added, removed or unchanged, and the lesson gate
 * (`packages/cli/src/hsm-guide-fences.test.ts`) applies the same lines to build
 * the files a reader ends with. Both must read every line of every fence alike,
 * or the gate compiles a project the page does not show.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStepFence, stepLines, tsFences } from "../../../cli/src/hsm-guide-steps";
import { renderMarkdown } from "./markdown";

const PAGE = join(import.meta.dir, "../../../docs/guide/state-machines-tutorial.md");

type Shown = readonly [mark: "++" | "--" | undefined, text: string];

function decode(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** The lines of the one code block in `html`, each with the diff mark its class carries. */
function shownLines(html: string): Shown[] {
  const code = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)?.[1];
  if (code === undefined) throw new Error("the fence rendered no code block");
  return code.split("\n").map((line): Shown => {
    const classes = line.match(/^<span class="(line[^"]*)">/)?.[1]?.split(" ") ?? [];
    const mark = classes.includes("add") ? "++" : classes.includes("remove") ? "--" : undefined;
    return [mark, decode(line).trimEnd()];
  });
}

test("the site shows every step fence line the way the lesson gate reads it", async () => {
  const fences = tsFences(readFileSync(PAGE, "utf8")).filter((fence) => isStepFence(fence.info));
  expect(fences.length).toBeGreaterThan(0);
  for (const fence of fences) {
    const html = await renderMarkdown(`\`\`\`ts${fence.info}\n${fence.body}\`\`\`\n`);
    const read = stepLines(fence).map(({ text, mark }): Shown => [mark, text]);
    expect(shownLines(html), `step fence at page line ${fence.line}`).toEqual(read);
  }
});

test("the gate can fail: the site gives a marker alone on a line to the line after it", async () => {
  const body = "const a = 1;\n// [!code ++]\nconst b = 2;\n";
  const html = await renderMarkdown(`\`\`\`ts step title="a.ts"\n${body}\`\`\`\n`);
  const read = stepLines({ info: ' step title="a.ts"', body, line: 1 }).map(
    ({ text, mark }): Shown => [mark, text],
  );
  expect(shownLines(html)).not.toEqual(read);
});
