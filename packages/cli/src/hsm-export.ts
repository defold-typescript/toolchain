import { readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

export type XStateJson = { [key: string]: unknown };

interface Definition {
  readonly name: string;
  readonly config: ts.Expression;
}

const HISTORY_KEY = "$history";

const KEY_ORDER = [
  "type",
  "initial",
  "entry",
  "exit",
  "invoke",
  "meta",
  "on",
  "after",
  "always",
  "states",
] as const;

class StaticReader {
  private readonly consts = new Map<string, ts.Expression>();

  constructor(
    private readonly sourceFile: ts.SourceFile,
    private readonly fileName: string,
  ) {
    for (const statement of sourceFile.statements) {
      if (
        !ts.isVariableStatement(statement) ||
        (statement.declarationList.flags & ts.NodeFlags.Const) === 0
      ) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
          this.consts.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }

  locate(node: ts.Node): string {
    const { line, character } = this.sourceFile.getLineAndCharacterOfPosition(
      node.getStart(this.sourceFile),
    );
    return `${this.fileName}:${line + 1}:${character + 1}`;
  }

  fail(node: ts.Node, slot: string): never {
    throw new Error(`${this.locate(node)}: hsm-export cannot read ${slot} statically`);
  }

  // Strips wrappers that leave the value unchanged and follows identifiers to a same-file const.
  resolve(node: ts.Expression): ts.Expression {
    const seen = new Set<string>();
    let current = node;
    for (;;) {
      if (
        ts.isParenthesizedExpression(current) ||
        ts.isAsExpression(current) ||
        ts.isSatisfiesExpression(current) ||
        ts.isNonNullExpression(current) ||
        ts.isTypeAssertionExpression(current)
      ) {
        current = current.expression;
        continue;
      }
      if (ts.isIdentifier(current) && !seen.has(current.text)) {
        const initializer = this.consts.get(current.text);
        if (initializer !== undefined) {
          seen.add(current.text);
          current = initializer;
          continue;
        }
      }
      return current;
    }
  }

  string(node: ts.Expression, slot: string): string {
    const value = this.resolve(node);
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      return value.text;
    }
    return this.fail(node, slot);
  }

  object(node: ts.Expression, slot: string): [string, ts.Expression][] {
    const value = this.resolve(node);
    if (!ts.isObjectLiteralExpression(value)) {
      return this.fail(node, slot);
    }
    const entries: [string, ts.Expression][] = [];
    for (const property of value.properties) {
      if (ts.isPropertyAssignment(property)) {
        entries.push([this.key(property.name, slot), property.initializer]);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        entries.push([property.name.text, property.name]);
      } else if (ts.isMethodDeclaration(property)) {
        entries.push([this.key(property.name, slot), property as unknown as ts.Expression]);
      } else {
        this.fail(property, slot);
      }
    }
    return entries;
  }

  private key(name: ts.PropertyName, slot: string): string {
    if (
      ts.isIdentifier(name) ||
      ts.isStringLiteral(name) ||
      ts.isNumericLiteral(name) ||
      ts.isNoSubstitutionTemplateLiteral(name)
    ) {
      return name.text;
    }
    return this.fail(name, slot);
  }

  // A single entry or an array literal of entries, as `TransitionSpec` and `AlwaysSpec` allow.
  list(node: ts.Expression): { readonly items: ts.Expression[]; readonly isArray: boolean } {
    const value = this.resolve(node);
    if (ts.isArrayLiteralExpression(value)) {
      return { items: [...value.elements], isArray: true };
    }
    return { items: [node], isArray: false };
  }

  // A named function keeps its name; anything else is a placeholder named after where it sits.
  functionName(node: ts.Expression, label: string): string {
    let value: ts.Node = node;
    while (ts.isParenthesizedExpression(value)) {
      value = value.expression;
    }
    if (ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)) {
      return value.getText(this.sourceFile);
    }
    return label;
  }
}

function findDefinitions(sourceFile: ts.SourceFile, reader: StaticReader): Definition[] {
  const definitions: Definition[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      isDefineMachine(node.expression.expression) &&
      node.arguments[0] !== undefined
    ) {
      const keyArgument = node.expression.arguments[0];
      const parent = node.parent;
      const name =
        keyArgument !== undefined
          ? reader.string(keyArgument, "the defineMachine key")
          : ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
            ? parent.name.text
            : "machine";
      definitions.push({ name, config: node.arguments[0] });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return definitions;
}

function isDefineMachine(callee: ts.Expression): boolean {
  return (
    (ts.isIdentifier(callee) && callee.text === "defineMachine") ||
    (ts.isPropertyAccessExpression(callee) && callee.name.text === "defineMachine")
  );
}

function selectDefinition(
  definitions: readonly Definition[],
  fileName: string,
  name: string | undefined,
): Definition {
  const names = definitions.map((definition) => definition.name).join(", ");
  if (definitions.length === 0) {
    throw new Error(`${fileName}: hsm-export found no defineMachine call`);
  }
  if (name !== undefined) {
    const match = definitions.find((definition) => definition.name === name);
    if (match === undefined) {
      throw new Error(
        `${fileName}: hsm-export found no machine named "${name}"; machines: ${names}`,
      );
    }
    return match;
  }
  if (definitions.length > 1) {
    throw new Error(
      `${fileName}: hsm-export found ${definitions.length} machines (${names}); name one: hsm-export <file> <name>`,
    );
  }
  return definitions[0] as Definition;
}

// `.` is XState's path delimiter inside a `#id` target, and hsm allows it in state names.
function targetId(hsmPath: string): string {
  return `#${hsmPath.replace(/[\\.]/g, "\\$&")}`;
}

function childName(hsmPath: string): string {
  return hsmPath.slice(hsmPath.lastIndexOf("/") + 1);
}

// Shifting the decimal point as text lets `Number` round the exact millisecond value once, with no
// multiply noise, so the key always equals the `String(+key)` XState puts in its event type.
function millisecondsKey(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return String(seconds);
  }
  const [mantissa = "", exponent = "0"] = String(seconds).split("e");
  const [whole = "", fraction = ""] = mantissa.split(".");
  return String(Number(`${whole}${fraction}e${Number(exponent) + 3 - fraction.length}`));
}

function convertTransition(
  reader: StaticReader,
  node: ts.Expression,
  slot: string,
  label: string,
  index: string,
): unknown {
  const value = reader.resolve(node);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return targetId(value.text);
  }
  const out: XStateJson = {};
  for (const [key, field] of reader.object(node, slot)) {
    if (key === "target") {
      out.target = targetId(reader.string(field, `${slot} target`));
    } else if (key === "guard") {
      out.guard = reader.functionName(field, `${label} guard${index}`);
    } else if (key === "actions") {
      const { items, isArray } = reader.list(field);
      out.actions = items.map((item, i) =>
        reader.functionName(item, `${label} action${index}${isArray ? ` ${i}` : ""}`),
      );
    } else if (key === "reenter" && reader.resolve(field).kind === ts.SyntaxKind.TrueKeyword) {
      out.reenter = true;
    }
  }
  return out;
}

function convertSpec(
  reader: StaticReader,
  node: ts.Expression,
  slot: string,
  label: string,
): unknown {
  const { items, isArray } = reader.list(node);
  if (!isArray) {
    return convertTransition(reader, node, slot, label, "");
  }
  return items.map((item, i) => convertTransition(reader, item, slot, label, ` ${i}`));
}

function convertState(reader: StaticReader, node: ts.Expression, hsmPath: string): XStateJson {
  const at = hsmPath === "" ? "/" : hsmPath;
  const out: XStateJson = {};
  let history = false;
  let initial: string | undefined;
  for (const [key, field] of reader.object(node, `${at} state`)) {
    switch (key) {
      case "type":
        if (reader.string(field, `${at} type`) === "parallel") {
          out.type = "parallel";
        }
        break;
      case "initial":
        initial = reader.string(field, `${at} initial`);
        break;
      case "history":
        history = reader.string(field, `${at} history`) === "shallow";
        break;
      case "states": {
        const states: XStateJson = {};
        for (const [name, child] of reader.object(field, `${at} states`)) {
          const childPath = `${hsmPath}/${name}`;
          states[name] = { id: childPath, ...convertState(reader, child, childPath) };
        }
        out.states = states;
        break;
      }
      case "on": {
        const on: XStateJson = {};
        for (const [event, spec] of reader.object(field, `${at} on`)) {
          on[event] = convertSpec(reader, spec, `${at} on ${event}`, `${at} on ${event}`);
        }
        out.on = on;
        break;
      }
      case "after": {
        const after: XStateJson = {};
        const firstDelay = new Map<string, string>();
        for (const [seconds, target] of reader.object(field, `${at} after`)) {
          const delay = Number(seconds);
          if (seconds === "" || !(delay >= 0)) {
            reader.fail(target, `${at} after`);
          }
          const key = millisecondsKey(delay);
          const earlier = firstDelay.get(key);
          if (earlier !== undefined) {
            throw new Error(
              `${reader.locate(target)}: hsm-export cannot tell ${at} after delays ${earlier} and ${seconds} apart in XState`,
            );
          }
          firstDelay.set(key, seconds);
          after[key] = targetId(reader.string(target, `${at} after`));
        }
        out.after = after;
        break;
      }
      case "always":
        out.always = convertSpec(reader, field, `${at} always`, `${at} always`);
        break;
      case "enter":
        out.entry = [reader.functionName(field, `${at} enter`)];
        break;
      case "exit":
        out.exit = [reader.functionName(field, `${at} exit`)];
        break;
      case "update":
        out.meta = { update: reader.functionName(field, `${at} update`) };
        break;
      case "invoke":
        out.invoke = { src: reader.functionName(field, `${at} invoke`) };
        break;
    }
  }
  if (initial !== undefined) {
    out.initial = childName(initial);
  }
  // hsm's history changes every default entry; an XState history child reached through `initial`
  // does the same, and a transition that targets a child directly still bypasses it.
  if (history && initial !== undefined && out.states !== undefined) {
    let key = HISTORY_KEY;
    while (key in (out.states as XStateJson)) {
      key = `$${key}`;
    }
    out.states = {
      [key]: { type: "history", history: "shallow", target: targetId(initial) },
      ...(out.states as XStateJson),
    };
    out.initial = key;
  }
  const ordered: XStateJson = {};
  for (const key of KEY_ORDER) {
    if (out[key] !== undefined) {
      ordered[key] = out[key];
    }
  }
  return ordered;
}

export function exportMachine(source: string, fileName: string, name?: string): XStateJson {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const reader = new StaticReader(sourceFile, fileName);
  const definition = selectDefinition(findDefinitions(sourceFile, reader), fileName, name);
  return { id: definition.name, ...convertState(reader, definition.config, "") };
}

export interface HsmExportOptions {
  readonly cwd: string;
  readonly file: string;
  readonly name?: string;
}

export function runHsmExport({ cwd, file, name }: HsmExportOptions): XStateJson {
  let source: string;
  try {
    source = readFileSync(path.resolve(cwd, file), "utf8");
  } catch {
    throw new Error(`defold-typescript hsm-export: cannot read ${file}`);
  }
  return exportMachine(source, file, name);
}
