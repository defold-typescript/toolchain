import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { type Line, lineStarts, tokenizeLines } from "./hsm-view-tokens";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const PLATFORMER_MACHINE = path.join(
  REPO_ROOT,
  "docs",
  "examples",
  "platformer",
  "src",
  "player-machine.ts",
);

function lineBreaks(text: string): string[] {
  return text.match(/\r\n|\r|\n/g) ?? [];
}

function rejoin(lines: readonly Line[], text: string): string {
  const breaks = lineBreaks(text);
  return lines
    .map((line, index) => line.map((run) => run.text).join("") + (breaks[index] ?? ""))
    .join("");
}

function kindOf(line: Line, text: string): string | undefined {
  return line.find((run) => run.text === text)?.kind;
}

const TRICKY = [
  "/* first",
  "   second",
  "   third */",
  "const greeting = `hello",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text for the tokenizer
  "${name} and ${`nested ${deep}`}",
  "done`;",
  "const pattern = /a[/]b\\/c/gi;",
  "const ratio = total / count / 2;",
  'const quoted = "a \\" b";',
  "",
].join("\r\n");

describe("tokenizeLines", () => {
  test("rejoins the platformer machine file byte for byte", () => {
    const text = readFileSync(PLATFORMER_MACHINE, "utf8");
    const lines = tokenizeLines(text);
    expect(lines).toHaveLength(lineBreaks(text).length + 1);
    expect(rejoin(lines, text)).toBe(text);
  });

  test("rejoins multi-line comments, templates, regexes and CRLF line endings", () => {
    const lines = tokenizeLines(TRICKY);
    expect(lines).toHaveLength(lineBreaks(TRICKY).length + 1);
    expect(rejoin(lines, TRICKY)).toBe(TRICKY);
    for (const line of lines) {
      for (const run of line) {
        expect(run.text).not.toMatch(/[\r\n]/);
      }
    }
  });

  test("classifies keywords, identifiers, strings and comments", () => {
    const [line] = tokenizeLines('export const x = "a"; // c');
    if (line === undefined) {
      throw new Error("no line");
    }
    expect(kindOf(line, "export")).toBe("keyword");
    expect(kindOf(line, "const")).toBe("keyword");
    expect(kindOf(line, "x")).toBe("identifier");
    expect(kindOf(line, '"a"')).toBe("string");
    expect(kindOf(line, "// c")).toBe("comment");
  });

  test("marks every line of a three-line block comment as comment", () => {
    const lines = tokenizeLines(TRICKY);
    for (const line of lines.slice(0, 3)) {
      const visible = line.filter((run) => run.text.trim() !== "");
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every((run) => run.kind === "comment")).toBe(true);
    }
  });

  test("tells a regex from division and keeps template text a string", () => {
    const lines = tokenizeLines(TRICKY);
    expect(kindOf(lines[6] as Line, "/a[/]b\\/c/gi")).toBe("regex");
    expect(kindOf(lines[7] as Line, "/")).toBe("punctuation");
    expect(kindOf(lines[5] as Line, "done`")).toBe("string");
    expect(kindOf(lines[4] as Line, "name")).toBe("identifier");
    expect(kindOf(lines[4] as Line, "deep")).toBe("identifier");
  });
});

describe("lineStarts", () => {
  test("gives each tokenized line's offset in the text, whatever its line break", () => {
    const text = "const a = 1;\r\n/* two\rlines */\n\nlet b = `x\r\ny`;\n";
    const lines = tokenizeLines(text);
    const starts = lineStarts(text);

    expect(starts).toHaveLength(lines.length);
    lines.forEach((line, index) => {
      const lineText = line.map((run) => run.text).join("");
      const start = starts[index] as number;
      expect(text.slice(start, start + lineText.length)).toBe(lineText);
    });
    expect(starts).toEqual([0, 14, 21, 30, 31, 43, 47]);
  });
});
