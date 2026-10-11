import { describe, expect, test } from "bun:test";
import { lessonProjects } from "./hsm-guide-steps";

function stepFence(title: string, ...lines: string[]): string {
  return [`\`\`\`ts step title="${title}"`, ...lines, "```"].join("\n");
}

const LAMP = [
  "export const lamp = {",
  '  initial: "/off",',
  "  states: {",
  '    off: { on: { TOGGLE: "/on" } },',
  '    on: { on: { TOGGLE: "/off" } },',
  "  },",
  "};",
];

function files(page: string): Record<string, string>[] {
  return lessonProjects(page).map((project) => Object.fromEntries(project.files));
}

describe("lessonProjects", () => {
  test("a first step fence creates the file from its body", () => {
    const page = ["## 1. A lamp", "", stepFence("a.ts", ...LAMP), ""].join("\n");
    expect(lessonProjects(page).map((project) => project.heading)).toEqual(["1. A lamp"]);
    expect(files(page)).toEqual([{ "a.ts": `${LAMP.join("\n")}\n` }]);
  });

  test("a later fence puts each added line where the removed one was, markers gone", () => {
    const page = [
      stepFence("a.ts", ...LAMP),
      "",
      stepFence(
        "a.ts",
        "  states: {",
        '    off: { on: { TOGGLE: "/on" } },',
        '    on: { on: { TOGGLE: "/off" } }, // [!code --]',
        '    on: { on: { TOGGLE: "/off", DIM: "/on" } },   // [!code ++]',
        "  },",
      ),
    ].join("\n");
    expect(files(page)).toEqual([
      {
        "a.ts": [
          "export const lamp = {",
          '  initial: "/off",',
          "  states: {",
          '    off: { on: { TOGGLE: "/on" } },',
          '    on: { on: { TOGGLE: "/off", DIM: "/on" } },',
          "  },",
          "};",
          "",
        ].join("\n"),
      },
    ]);
  });

  test("the hunk on each side of a `// ...` line applies at its own place", () => {
    const page = [
      stepFence("a.ts", ...LAMP),
      "",
      stepFence(
        "a.ts",
        "export const lamp = {",
        '  initial: "/off", // [!code --]',
        '  initial: "/on", // [!code ++]',
        "  // ...",
        '    on: { on: { TOGGLE: "/off" } },',
        "    broken: {}, // [!code ++]",
        "  },",
      ),
    ].join("\n");
    expect(files(page)).toEqual([
      {
        "a.ts": [
          "export const lamp = {",
          '  initial: "/on",',
          "  states: {",
          '    off: { on: { TOGGLE: "/on" } },',
          '    on: { on: { TOGGLE: "/off" } },',
          "    broken: {},",
          "  },",
          "};",
          "",
        ].join("\n"),
      },
    ]);
  });

  test("a later fence with no marker leaves the file as it is", () => {
    const page = [stepFence("a.ts", ...LAMP), "", stepFence("a.ts", ...LAMP.slice(2, 5))].join(
      "\n",
    );
    expect(files(page)).toEqual([{ "a.ts": `${LAMP.join("\n")}\n` }]);
  });

  test("a later fence with no marker throws when its lines are not a run of the file", () => {
    const page = [
      stepFence("a.ts", ...LAMP),
      "",
      stepFence("a.ts", "  states: {", '    on: { on: { TOGGLE: "/off" } },'),
    ].join("\n");
    expect(() => lessonProjects(page)).toThrow(/a\.ts.*line 11/);
  });

  test("a hunk that matches nowhere throws with the title and the fence's page line", () => {
    const page = [
      "Intro.",
      "",
      stepFence("a.ts", ...LAMP),
      "",
      "More words.",
      "",
      stepFence("a.ts", "  states: {", "    idle: {}, // [!code ++]", "  }"),
    ].join("\n");
    expect(() => lessonProjects(page)).toThrow(
      /a\.ts.*line 15.*`states: \{` match no place.*differs at `\}`/,
    );
  });

  test("a hunk whose first line is nowhere in the file names that line alone", () => {
    const page = [stepFence("a.ts", ...LAMP), "", stepFence("a.ts", "const other = 1;")].join("\n");
    expect(() => lessonProjects(page)).toThrow(/`const other = 1;` match no place in the file$/);
  });

  test("a hunk that matches in two places throws", () => {
    const twice = ["const a = {", "  x: 1,", "};", "const b = {", "  x: 1,", "};"];
    const page = [
      stepFence("a.ts", ...twice),
      "",
      stepFence("a.ts", "  x: 1,", "  y: 2, // [!code ++]", "};"),
    ].join("\n");
    expect(() => lessonProjects(page)).toThrow(/a\.ts.*line 10.*2 places/);
  });

  test("a first listing with a marker or a `// ...` line throws", () => {
    const marked = stepFence("a.ts", "const a = 1; // [!code ++]");
    expect(() => lessonProjects(marked)).toThrow(/a\.ts.*line 1/);
    const elided = stepFence("a.ts", "const a = 1;", "// ...", "const b = 2;");
    expect(() => lessonProjects(elided)).toThrow(/a\.ts.*line 1/);
  });

  test("a marker alone on a line throws, as the site would mark the next line with it", () => {
    const page = [
      stepFence("a.ts", "const a = 1;", "", "const b = 2;"),
      "",
      stepFence("a.ts", "const a = 1;", "  // [!code --]", "const b = 2;"),
    ].join("\n");
    expect(() => lessonProjects(page)).toThrow(/a\.ts.*line 7.*alone on a line/);
  });

  test("a marker the diff notation does not have throws", () => {
    const page = [
      stepFence("a.ts", "const a = 1;"),
      "",
      stepFence("a.ts", "const a = 1; // [!code highlight]"),
    ].join("\n");
    expect(() => lessonProjects(page)).toThrow(/a\.ts.*line 5.*\[!code highlight\]/);
    const glued = stepFence("a.ts", "const a = 1; //[!code ++]");
    expect(() => lessonProjects(glued)).toThrow(/a\.ts.*line 1/);
  });

  test("a step fence with no title throws with its page line", () => {
    const page = ["Intro.", "", "```ts step", "const a = 1;", "```"].join("\n");
    expect(() => lessonProjects(page)).toThrow(/line 3.*title/);
  });

  test("each section that changes a file adds one project holding every file as it stands", () => {
    const page = [
      "Intro.",
      "",
      "## 1. First",
      "",
      stepFence("a.ts", "export const a = 1;"),
      "",
      "## 2. Words only",
      "",
      "Nothing changes here.",
      "",
      stepFence("a.ts", "export const a = 1;"),
      "",
      "## 3. Second",
      "",
      stepFence("a.ts", "export const a = 1; // [!code --]", "export const a = 2; // [!code ++]"),
      "",
      stepFence("b.ts", 'import { a } from "./a";', "export const b = a;"),
      "",
    ].join("\n");
    const projects = lessonProjects(page);
    expect(projects.map((project) => project.heading)).toEqual(["1. First", "3. Second"]);
    expect(files(page)).toEqual([
      { "a.ts": "export const a = 1;\n" },
      {
        "a.ts": "export const a = 2;\n",
        "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
      },
    ]);
  });

  test("text above the first `## ` heading is its own section", () => {
    const page = [
      stepFence("a.ts", "export const a = 1;"),
      "",
      "## 1. Next",
      "",
      stepFence("a.ts", "export const a = 1; // [!code --]", "export const a = 2; // [!code ++]"),
    ].join("\n");
    expect(lessonProjects(page).map((project) => project.heading)).toEqual(["", "1. Next"]);
  });

  test("a step fence inside a callout is read without its blockquote prefix", () => {
    const page = [
      stepFence("a.ts", ...LAMP),
      "",
      "> [!MORE] The whole file so far",
      ">",
      '> ```ts step title="a.ts"',
      ...LAMP.map((line) => `> ${line}`),
      "> ```",
      "",
      "> [!NOTE] A change in a callout.",
      ">",
      '> ```ts step title="a.ts"',
      '>   initial: "/off", // [!code --]',
      '>   initial: "/on", // [!code ++]',
      "> ```",
    ].join("\n");
    expect(files(page)).toEqual([
      { "a.ts": `${LAMP.join("\n")}\n`.replace('initial: "/off"', 'initial: "/on"') },
    ]);
  });

  test("a plain ts fence and a ts excerpt fence are not steps", () => {
    const page = [
      "```ts",
      "const loose = 1;",
      "```",
      "",
      '```ts title="titled.ts"',
      "const titled = 1;",
      "```",
      "",
      "```ts excerpt",
      "const quoted = 1;",
      "```",
    ].join("\n");
    expect(lessonProjects(page)).toEqual([]);
  });
});
