import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { editJsoncFile, parseJsoncObject, readJsoncObject } from "./jsonc-file";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-jsonc-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fileWith(text: string): string {
  const filePath = path.join(dir, "config.json");
  writeFileSync(filePath, text);
  return filePath;
}

// Each edit is expressed as the desired object, built from the current one the
// way every writer builds it, so the diff is the only thing that decides what
// text changes.
function editTo(filePath: string, change: (value: Record<string, unknown>) => void): string {
  const value = readJsoncObject(filePath);
  change(value);
  editJsoncFile(filePath, value);
  return readFileSync(filePath, "utf8");
}

describe("editJsoncFile", () => {
  test("an edit changes one value and keeps comments, other keys and CRLF endings", () => {
    const original = [
      "// project config",
      "{",
      '  "extends": "./base.json",',
      '  "compilerOptions": {',
      '    "strict": true, // keep strict',
      '    "target": "ES2022",',
      "  },",
      '  "include": ["src/**/*.ts"],',
      "}",
      "",
    ].join("\r\n");
    const result = editTo(fileWith(original), (value) => {
      (value.compilerOptions as Record<string, unknown>).target = "ES2020";
    });
    expect(result).toBe(original.replace('"ES2022"', '"ES2020"'));
  });

  test("deleting the first entry keeps the comment above the next entry and that entry's layout byte for byte (a task)", () => {
    const before = [
      "{",
      '  "version": "2.0.0",',
      '  "tasks": [',
      '    { "label": "stale" },',
      "    // the user's own build",
      "    {",
      '      "label":   "mine",  "type": "shell"',
      "    }",
      "  ]",
      "}",
      "",
    ].join("\n");
    const result = editTo(fileWith(before), (value) => {
      value.tasks = (value.tasks as Array<{ label: string }>).filter((t) => t.label !== "stale");
    });
    expect(result).toBe(before.replace('    { "label": "stale" },\n', ""));
  });

  test("deleting the first entry keeps the comment above the next entry and that entry's layout byte for byte (a paths alias)", () => {
    const before = [
      "{",
      '  "compilerOptions": {',
      '    "paths": {',
      '      "@old/*": ["old/*"],',
      "      // the user's alias",
      '      "@mine/*":   [ "mine/*" ]',
      "    }",
      "  }",
      "}",
      "",
    ].join("\n");
    const result = editTo(fileWith(before), (value) => {
      const options = value.compilerOptions as { paths: Record<string, unknown> };
      delete options.paths["@old/*"];
    });
    expect(result).toBe(before.replace('      "@old/*": ["old/*"],\n', ""));
  });

  test("deleting the last entry removes its same-line comment and the dangling comma", () => {
    const before = [
      "{",
      '  "exclude": [',
      '    "a", // first',
      '    "b" // last',
      "  ]",
      "}",
      "",
    ].join("\n");
    const result = editTo(fileWith(before), (value) => {
      value.exclude = ["a"];
    });
    expect(result).toBe(["{", '  "exclude": [', '    "a" // first', "  ]", "}", ""].join("\n"));
  });

  test("deleting a last entry that shares a line with its closing bracket keeps the comments before it", () => {
    const before = [
      "{",
      '  "compilerOptions": {',
      '    "types": [',
      '      "defold-1.12.4", // engine',
      "      // extension declarations",
      '      "extensions"]',
      "  }",
      "}",
      "",
    ].join("\n");
    const filePath = fileWith(before);
    const result = editTo(filePath, (value) => {
      const options = value.compilerOptions as { types: string[] };
      options.types = options.types.filter((entry) => entry !== "extensions");
    });
    expect(result).toBe(
      before.replace('"defold-1.12.4",', '"defold-1.12.4"').replace('"extensions"]', "]"),
    );
    expect(readJsoncObject(filePath)).toEqual({ compilerOptions: { types: ["defold-1.12.4"] } });
  });

  test("deleting the last entry of a one-line array takes its comma and its own comment and keeps the line compact", () => {
    const result = editTo(fileWith('{ "a": ["x", "y" /* own */] }\n'), (value) => {
      value.a = ["x"];
    });
    expect(result).toBe('{ "a": ["x"] }\n');
  });

  for (const [name, eol] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
  ] as const) {
    test(`an inserted entry is formatted and nothing outside it moves (${name})`, () => {
      const before = [
        "{",
        "  // own settings",
        '  "include": [',
        '    "src/**/*.ts" // game',
        "  ],",
        '  "compilerOptions": {"strict": true}',
        "}",
        "",
      ].join(eol);
      const result = editTo(fileWith(before), (value) => {
        value.include = [...(value.include as string[]), ".defold-types/scene-addresses.d.ts"];
        value.references = [{ path: "./tools" }];
      });
      expect(result).toBe(
        [
          "{",
          "  // own settings",
          '  "include": [',
          '    "src/**/*.ts", // game',
          '    ".defold-types/scene-addresses.d.ts"',
          "  ],",
          '  "compilerOptions": {"strict": true},',
          '  "references": [{ "path": "./tools" }]',
          "}",
          "",
        ].join(eol),
      );
    });
  }

  test("an unchanged file is not rewritten", () => {
    const filePath = fileWith('{ "a": [1, 2] } // keep\n');
    utimesSync(filePath, new Date(0), new Date(0));
    expect(editJsoncFile(filePath, readJsoncObject(filePath))).toBe(false);
    expect(statSync(filePath).mtimeMs).toBe(0);
  });
});

describe("readJsoncObject", () => {
  test("a read accepts comments and trailing commas, and a syntax error names the file", () => {
    const good = fileWith('/* head */ {\n  "a": [1, 2,], // tail\n  "b": { "c": true, },\n}\n');
    expect(readJsoncObject(good)).toEqual({ a: [1, 2], b: { c: true } });

    const bad = path.join(dir, "broken.json");
    writeFileSync(bad, '{ "a": }\n');
    expect(() => readJsoncObject(bad)).toThrow(bad);
    expect(() => parseJsoncObject("[1]", "list.json")).toThrow("list.json");
  });
});
