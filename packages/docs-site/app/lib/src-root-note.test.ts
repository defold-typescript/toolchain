import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SRC_ROOT_FOOTNOTE_ID,
  SRC_ROOT_FOOTNOTE_LINE,
  stripSrcRootDefinitions,
} from "./src-root-note";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");

const REFERENCE = `[^${SRC_ROOT_FOOTNOTE_ID}]`;
const DEFINITION_PREFIX = `${REFERENCE}: `;

function guidePages(): { file: string; body: string }[] {
  return readdirSync(GUIDE_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({ file, body: readFileSync(join(GUIDE_DIR, file), "utf8") }));
}

// A definition line is the note itself; a reference is the superscript marker in
// prose. Both start `[^src-root]`, so the definition's trailing colon is what
// separates them.
function definitionLines(body: string): string[] {
  return body.split("\n").filter((line) => line.startsWith(DEFINITION_PREFIX));
}

function referenceCount(body: string): number {
  let count = 0;
  for (const line of body.split("\n")) {
    if (line.startsWith(DEFINITION_PREFIX)) continue;
    count += line.split(REFERENCE).length - 1;
  }
  return count;
}

describe("SRC_ROOT_FOOTNOTE_LINE", () => {
  test("is a well-formed single-line definition naming tsconfig.json and include", () => {
    expect(SRC_ROOT_FOOTNOTE_LINE.startsWith(DEFINITION_PREFIX)).toBe(true);
    expect(SRC_ROOT_FOOTNOTE_LINE).not.toContain("\n");
    expect(SRC_ROOT_FOOTNOTE_LINE).toContain("tsconfig.json");
    expect(SRC_ROOT_FOOTNOTE_LINE).toContain("include");
  });
});

describe("guide pages carrying the note", () => {
  test("every page with a reference defines it exactly once, byte-identical", () => {
    const carrying = guidePages().filter((page) => referenceCount(page.body) > 0);
    expect(carrying.length).toBeGreaterThan(0);
    for (const page of carrying) {
      expect([page.file, definitionLines(page.body)]).toEqual([
        page.file,
        [SRC_ROOT_FOOTNOTE_LINE],
      ]);
    }
  });

  test("no page carries a definition without a reference, and none carries two", () => {
    for (const page of guidePages()) {
      const definitions = definitionLines(page.body);
      if (definitions.length === 0) continue;
      expect([page.file, definitions.length]).toEqual([page.file, 1]);
      expect([page.file, referenceCount(page.body) > 0]).toEqual([page.file, true]);
    }
  });
});

describe("stripSrcRootDefinitions", () => {
  test("removes every definition line and leaves references untouched", () => {
    const body = `Sources live in \`src/\`${REFERENCE}.\n\nMore prose${REFERENCE}.\n\n${SRC_ROOT_FOOTNOTE_LINE}\n`;
    const stripped = stripSrcRootDefinitions(body);
    expect(stripped).not.toContain(DEFINITION_PREFIX);
    expect(referenceCount(stripped)).toBe(2);
  });

  test("is idempotent and returns a body with no definition unchanged", () => {
    const body = `Sources live in \`src/\`${REFERENCE}.\n\nTrailing prose.\n`;
    expect(stripSrcRootDefinitions(body)).toBe(body);
    const once = stripSrcRootDefinitions(`${body}\n${SRC_ROOT_FOOTNOTE_LINE}\n`);
    expect(stripSrcRootDefinitions(once)).toBe(once);
  });

  test("leaves a definition-looking line inside a fenced code block alone", () => {
    const body = [
      "Prose.",
      "",
      "```markdown",
      SRC_ROOT_FOOTNOTE_LINE,
      "```",
      "",
      SRC_ROOT_FOOTNOTE_LINE,
      "",
    ].join("\n");
    const stripped = stripSrcRootDefinitions(body);
    expect(stripped.split("\n").filter((line) => line.startsWith(DEFINITION_PREFIX))).toEqual([
      SRC_ROOT_FOOTNOTE_LINE,
    ]);
    expect(stripped).toContain("```markdown");
  });

  test("collapses the blank run the removal leaves behind", () => {
    const body = `Prose${REFERENCE}.\n\n${SRC_ROOT_FOOTNOTE_LINE}\n\nAfter.\n`;
    expect(stripSrcRootDefinitions(body)).not.toMatch(/\n{3,}/);
  });
});
