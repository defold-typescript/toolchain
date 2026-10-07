/**
 * The page ships the stylesheet `tailwindcss` builds from `styles.css`, and Tailwind writes no rule
 * for a class it cannot resolve, so a class on a retired token name leaves its element unstyled
 * without an error anywhere. This gate builds that stylesheet and holds every class the client
 * sources carry to a rule in it, every custom property it reads to a value, and the light and dark
 * palettes to the same names.
 * It sees a class only where it is written in a `className`, a `cn(...)` or a `cva(...)`.
 */
import { beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";

const CLIENT_DIR = import.meta.dir;
const CLI_ROOT = path.resolve(CLIENT_DIR, "..");
const SLOW = 60_000;

interface CssRule {
  /** The selector or the at-rule text before the block; empty for the stylesheet itself. */
  readonly prelude: string;
  readonly declarations: string[];
  readonly rules: CssRule[];
}

/** The stylesheet as a tree of blocks, so a rule is read with the at-rules it sits inside. */
function parseCss(css: string): CssRule {
  const sheet: CssRule = { prelude: "", declarations: [], rules: [] };
  const open: CssRule[] = [sheet];
  let buffer = "";
  const top = (): CssRule => open.at(-1) ?? sheet;
  const endDeclaration = (): void => {
    const declaration = buffer.trim();
    if (declaration !== "") {
      top().declarations.push(declaration);
    }
    buffer = "";
  };

  let at = 0;
  while (at < css.length) {
    const char = css[at] ?? "";
    if (char === "/" && css[at + 1] === "*") {
      const end = css.indexOf("*/", at + 2);
      at = end === -1 ? css.length : end + 2;
    } else if (char === "\\") {
      buffer += css.slice(at, at + 2);
      at += 2;
    } else if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < css.length && css[end] !== char) {
        end += css[end] === "\\" ? 2 : 1;
      }
      buffer += css.slice(at, end + 1);
      at = end + 1;
    } else {
      if (char === "{") {
        const rule: CssRule = { prelude: buffer.trim(), declarations: [], rules: [] };
        top().rules.push(rule);
        open.push(rule);
        buffer = "";
      } else if (char === "}") {
        endDeclaration();
        if (open.length > 1) {
          open.pop();
        }
      } else if (char === ";") {
        endDeclaration();
      } else {
        buffer += char;
      }
      at += 1;
    }
  }
  return sheet;
}

interface PlacedRule {
  readonly rule: CssRule;
  readonly parent: CssRule;
}

function placedRules(parent: CssRule): PlacedRule[] {
  return parent.rules.flatMap((rule) => [{ rule, parent }, ...placedRules(rule)]);
}

const CSS_ESCAPE = /\\(?:([0-9a-fA-F]{1,6}) ?|(.))/g;

function unescapeCss(identifier: string): string {
  return identifier.replace(CSS_ESCAPE, (_, hex: string | undefined, char: string | undefined) =>
    hex === undefined ? (char ?? "") : String.fromCodePoint(Number.parseInt(hex, 16)),
  );
}

const CLASS_SELECTOR =
  /\.(-?(?:[A-Za-z_]|\\[0-9a-fA-F]{1,6} ?|\\.)(?:[\w-]|\\[0-9a-fA-F]{1,6} ?|\\.)*)/g;

/** Every class a selector of the stylesheet names. */
function ruledClasses(sheet: CssRule): Set<string> {
  const classes = new Set<string>();
  for (const { rule } of placedRules(sheet)) {
    if (rule.prelude.startsWith("@")) {
      continue;
    }
    for (const match of rule.prelude.matchAll(CLASS_SELECTOR)) {
      classes.add(unescapeCss(match[1] ?? ""));
    }
  }
  return classes;
}

const CUSTOM_PROPERTY_DECLARATION = /^(--[\w-]+)\s*:/;

function declaredProperties(rule: CssRule): string[] {
  return rule.declarations.flatMap(
    (declaration) => declaration.match(CUSTOM_PROPERTY_DECLARATION)?.[1] ?? [],
  );
}

const PROPERTY_RULE = /^@property\s+(--[\w-]+)$/;
const READ_WITHOUT_FALLBACK = /var\(\s*(--[\w-]+)\s*\)/g;

/** The custom properties read as `var(--name)` with no fallback that nothing in the sheet defines. */
function undefinedReads(sheet: CssRule): string[] {
  const rules = [sheet, ...placedRules(sheet).map(({ rule }) => rule)];
  const defined = new Set(rules.flatMap(declaredProperties));
  for (const rule of rules) {
    const registered = rule.prelude.match(PROPERTY_RULE)?.[1];
    if (registered !== undefined) {
      defined.add(registered);
    }
  }
  const read = new Set<string>();
  for (const declaration of rules.flatMap((rule) => rule.declarations)) {
    for (const match of declaration.matchAll(READ_WITHOUT_FALLBACK)) {
      read.add(match[1] ?? "");
    }
  }
  return [...read].filter((name) => !defined.has(name)).sort();
}

const DARK_SCHEME = /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/;

/** The custom property names of the light palette and of the dark one, each sorted. */
function palettes(sheet: CssRule): { light: string[]; dark: string[] } {
  const roots = placedRules(sheet).filter(({ rule }) => rule.prelude === ":root");
  const names = (found: PlacedRule[]): string[] =>
    [...new Set(found.flatMap(({ rule }) => declaredProperties(rule)))].sort();
  return {
    light: names(
      roots.filter(({ rule }) => rule.declarations.some((d) => /^color-scheme\s*:/.test(d))),
    ),
    dark: names(roots.filter(({ parent }) => DARK_SCHEME.test(parent.prelude))),
  };
}

const FOLLOWED_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.PlusToken,
]);

function propertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
    ? name.text
    : undefined;
}

/** Every class a source file writes into a `className`, a `cn(...)` or a `cva(...)`. */
function carriedClasses(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const constants = new Map<string, ts.Expression[]>();
  const classes = new Set<string>();
  const reached = new Set<ts.Node>();

  const carry = (literal: string): void => {
    for (const name of literal.split(/\s+/)) {
      if (name !== "") {
        classes.add(name);
      }
    }
  };

  const reach = (node: ts.Node | undefined): void => {
    if (node === undefined || reached.has(node)) {
      return;
    }
    reached.add(node);
    if (ts.isStringLiteralLike(node)) {
      carry(node.text);
    } else if (ts.isTemplateExpression(node)) {
      carry(node.head.text);
      for (const span of node.templateSpans) {
        reach(span.expression);
        carry(span.literal.text);
      }
    } else if (ts.isConditionalExpression(node)) {
      reach(node.whenTrue);
      reach(node.whenFalse);
    } else if (ts.isBinaryExpression(node)) {
      if (FOLLOWED_OPERATORS.has(node.operatorToken.kind)) {
        reach(node.left);
        reach(node.right);
      }
    } else if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSpreadElement(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      reach(node.expression);
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach(reach);
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          reach(property.initializer);
        } else if (ts.isShorthandPropertyAssignment(property)) {
          reach(property.name);
        } else if (ts.isSpreadAssignment(property)) {
          reach(property.expression);
        }
      }
    } else if (ts.isCallExpression(node)) {
      // A call is not resolved, but what a method is called on is still written here:
      // `[...].join(" ")` carries the strings of its array.
      if (ts.isPropertyAccessExpression(node.expression)) {
        reach(node.expression.expression);
      }
    } else if (ts.isIdentifier(node)) {
      (constants.get(node.text) ?? []).forEach(reach);
    }
  };

  const reachCva = (call: ts.CallExpression): void => {
    const [base, config] = call.arguments;
    reach(base);
    if (config === undefined || !ts.isObjectLiteralExpression(config)) {
      return;
    }
    for (const property of config.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const name = propertyName(property);
      if (name === "variants") {
        reach(property.initializer);
      } else if (name === "compoundVariants" && ts.isArrayLiteralExpression(property.initializer)) {
        // The other keys of an entry, like all of `defaultVariants`, hold variant names.
        for (const entry of property.initializer.elements) {
          if (!ts.isObjectLiteralExpression(entry)) {
            continue;
          }
          for (const field of entry.properties) {
            const key = propertyName(field);
            if (ts.isPropertyAssignment(field) && (key === "class" || key === "className")) {
              reach(field.initializer);
            }
          }
        }
      }
    }
  };

  const collectConstants = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      constants.set(node.name.text, [...(constants.get(node.name.text) ?? []), node.initializer]);
    }
    ts.forEachChild(node, collectConstants);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
      const value = node.initializer;
      reach(value !== undefined && ts.isJsxExpression(value) ? value.expression : value);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "cn") {
        node.arguments.forEach(reach);
      } else if (node.expression.text === "cva") {
        reachCva(node);
      }
    }
    ts.forEachChild(node, visit);
  };

  collectConstants(source);
  visit(source);
  return [...classes];
}

// Tailwind reads these as markers for `group-*` and `peer-*` variants and writes no rule for them.
const MARKER_CLASS = /^(?:group|peer)(?:\/[\w-]+)?$/;

function unruledClasses(fileName: string, text: string, ruled: ReadonlySet<string>): string[] {
  return carriedClasses(fileName, text)
    .filter((name) => !MARKER_CLASS.test(name) && !ruled.has(name))
    .sort();
}

function clientSources(): { file: string; text: string }[] {
  return [...new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: CLIENT_DIR })]
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .sort()
    .map((file) => ({ file, text: readFileSync(path.join(CLIENT_DIR, file), "utf8") }));
}

// One source through every way a class is reached; `sm` is a variant name and must stay unread.
const UNSTYLED_SOURCE = `
const MARK = { hit: "flex outline-nowhere" };
const tone = cva("flex border-nowhere", {
  variants: { size: { sm: "flex text-nowhere" } },
  compoundVariants: [{ size: "sm", class: "ring-nowhere" }],
  defaultVariants: { size: "sm" },
});
export const view = (on: boolean) => (
  <p className={on ? "flex bg-nowhere" : "flex"}>
    <i className={["flex", MARK.hit].join(" ")} />
    <b className={cn("flex", on && "fill-nowhere")} />
  </p>
);
`;

let sheet: CssRule = { prelude: "", declarations: [], rules: [] };

beforeAll(() => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hsm-view-styles-"));
  try {
    const out = path.join(dir, "styles.css");
    const built = Bun.spawnSync(
      [process.execPath, "x", "tailwindcss", "-i", "client/styles.css", "-o", out],
      { cwd: CLI_ROOT, stdout: "pipe", stderr: "pipe" },
    );
    if (built.exitCode !== 0) {
      throw new Error(`tailwindcss exited with ${built.exitCode}:\n${built.stderr.toString()}`);
    }
    sheet = parseCss(readFileSync(out, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, SLOW);

test("every class a view or component carries has a rule in the built stylesheet", () => {
  const ruled = ruledClasses(sheet);
  const unruled = clientSources().flatMap(({ file, text }) =>
    unruledClasses(file, text, ruled).map((name) => `${file}: ${name}`),
  );

  expect(unruled).toEqual([]);
});

test("every custom property the stylesheet reads without a fallback is defined in it", () => {
  expect(undefinedReads(sheet)).toEqual([]);
});

test("the light and dark palettes define the same custom properties", () => {
  const { light, dark } = palettes(sheet);

  expect(light).not.toEqual([]);
  expect(dark).toEqual(light);
});

test("the gate can fail", () => {
  expect(unruledClasses("unstyled.tsx", UNSTYLED_SOURCE, ruledClasses(sheet))).toEqual([
    "bg-nowhere",
    "border-nowhere",
    "fill-nowhere",
    "outline-nowhere",
    "ring-nowhere",
    "text-nowhere",
  ]);
});
