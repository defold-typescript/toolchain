import { readFileSync, writeFileSync } from "node:fs";
import {
  findNodeAtLocation,
  getNodeValue,
  type JSONPath,
  type Node,
  type ParseError,
  parse,
  parseTree,
  printParseErrorCode,
} from "jsonc-parser";
import { formatJsonLikeBiome } from "./format-json";

// TypeScript and VS Code both read their configs as JSON with comments and
// trailing commas, so every config the CLI reads accepts both.
const PARSE_OPTIONS = { allowTrailingComma: true, disallowComments: false } as const;

// Biome's default, which the scaffold's own `biome.json` keeps.
const LINE_WIDTH = 100;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lineAndColumn(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - (before.lastIndexOf("\n") + 1) + 1;
  return `line ${line}, column ${column}`;
}

function parseErrorMessage(text: string, label: string, error: ParseError): string {
  return `${label}: ${printParseErrorCode(error.error)} at ${lineAndColumn(text, error.offset)}`;
}

export function parseJsoncObject(text: string, label: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, PARSE_OPTIONS);
  const first = errors[0];
  if (first !== undefined) {
    throw new Error(parseErrorMessage(text, label, first));
  }
  if (!isPlainObject(value)) {
    throw new Error(`${label}: expected a JSON object`);
  }
  return value;
}

export function readJsoncObject(filePath: string): Record<string, unknown> {
  return parseJsoncObject(readFileSync(filePath, "utf8"), filePath);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a).filter((key) => a[key] !== undefined);
    const bKeys = Object.keys(b).filter((key) => b[key] !== undefined);
    return aKeys.length === bKeys.length && aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

// Index pairs of a longest common subsequence: the entries an array edit keeps
// where they stand, so everything between two kept entries is the only text
// that changes.
function commonSubsequence(current: unknown[], desired: unknown[]): Array<[number, number]> {
  const n = current.length;
  const m = desired.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = table[i] as number[];
      const next = table[i + 1] as number[];
      row[j] = deepEqual(current[i], desired[j])
        ? (next[j + 1] as number) + 1
        : Math.max(next[j] as number, row[j + 1] as number);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (deepEqual(current[i], desired[j])) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (
      ((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)
    ) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly content: string;
}

function isInlineSpace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

function isLineBreak(ch: string | undefined): boolean {
  return ch === "\n" || ch === "\r";
}

class JsoncEditor {
  text: string;
  private readonly eol: string;
  private readonly indentUnit: string;

  constructor(
    text: string,
    private readonly label: string,
  ) {
    this.text = text;
    this.eol = text.includes("\r\n") ? "\r\n" : "\n";
    this.indentUnit = /\n\t/.test(text) ? "\t" : "  ";
  }

  private root(): Node {
    const errors: ParseError[] = [];
    const tree = parseTree(this.text, errors, PARSE_OPTIONS);
    const first = errors[0];
    if (first !== undefined) {
      throw new Error(parseErrorMessage(this.text, this.label, first));
    }
    if (tree === undefined || tree.type !== "object") {
      throw new Error(`${this.label}: expected a JSON object`);
    }
    return tree;
  }

  private nodeAt(location: JSONPath): Node {
    const root = this.root();
    const node = location.length === 0 ? root : findNodeAtLocation(root, location);
    if (node === undefined) {
      throw new Error(`${this.label}: no value at ${JSON.stringify(location)}`);
    }
    return node;
  }

  private apply(edits: readonly TextEdit[]): void {
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
      this.text = this.text.slice(0, edit.start) + edit.content + this.text.slice(edit.end);
    }
  }

  private lineStart(offset: number): number {
    return this.text.lastIndexOf("\n", offset - 1) + 1;
  }

  private lineIndent(offset: number): string {
    const start = this.lineStart(offset);
    let end = start;
    while (isInlineSpace(this.text[end])) {
      end++;
    }
    return this.text.slice(start, end);
  }

  private skipInlineSpace(offset: number): number {
    let pos = offset;
    while (isInlineSpace(this.text[pos])) {
      pos++;
    }
    return pos;
  }

  // The end of a comment starting at `offset` that closes on the same line, or
  // `undefined` when there is none.
  private sameLineCommentEnd(offset: number): number | undefined {
    if (this.text.startsWith("//", offset)) {
      let pos = offset;
      while (pos < this.text.length && !isLineBreak(this.text[pos])) {
        pos++;
      }
      return pos;
    }
    if (this.text.startsWith("/*", offset)) {
      const close = this.text.indexOf("*/", offset + 2);
      if (close === -1) {
        return undefined;
      }
      const body = this.text.slice(offset, close);
      return body.includes("\n") ? undefined : close + 2;
    }
    return undefined;
  }

  // The comma that follows a value, skipping any whitespace and comments.
  private commaAfter(offset: number): number | undefined {
    let pos = offset;
    while (pos < this.text.length) {
      const ch = this.text[pos];
      if (ch === ",") {
        return pos;
      }
      if (isInlineSpace(ch) || isLineBreak(ch)) {
        pos++;
      } else if (this.text.startsWith("//", pos)) {
        pos = this.text.indexOf("\n", pos);
        if (pos === -1) {
          return undefined;
        }
      } else if (this.text.startsWith("/*", pos)) {
        const close = this.text.indexOf("*/", pos + 2);
        if (close === -1) {
          return undefined;
        }
        pos = close + 2;
      } else {
        return undefined;
      }
    }
    return undefined;
  }

  private isMultiLine(container: Node): boolean {
    const first = container.children?.[0];
    const end = first === undefined ? container.offset + container.length : first.offset;
    return /\n/.test(this.text.slice(container.offset + 1, end));
  }

  private render(value: unknown, indent: string, column: number): string {
    return formatJsonLikeBiome(value, { column }).split("\n").join(`${this.eol}${indent}`);
  }

  private entryText(key: string | undefined, value: unknown, indent: string): string {
    if (key === undefined) {
      return this.render(value, indent, indent.length);
    }
    const prefix = `${JSON.stringify(key)}: `;
    return `${prefix}${this.render(value, indent, indent.length + prefix.length)}`;
  }

  private insert(location: JSONPath, index: number, key: string | undefined, value: unknown): void {
    const container = this.nodeAt(location);
    const children = container.children ?? [];
    if (children.length === 0) {
      this.insertIntoEmpty(container, key, value);
      return;
    }
    const multiLine = this.isMultiLine(container);
    if (index === 0) {
      const first = children[0] as Node;
      if (multiLine) {
        const indent = this.lineIndent(first.offset);
        this.apply([
          {
            start: container.offset + 1,
            end: container.offset + 1,
            content: `${this.eol}${indent}${this.entryText(key, value, indent)},`,
          },
        ]);
      } else {
        const text = this.entryText(key, value, this.lineIndent(first.offset));
        this.apply([{ start: first.offset, end: first.offset, content: `${text}, ` }]);
        this.fitToWidth(location);
      }
      return;
    }
    const previous = children[index - 1] as Node;
    const previousEnd = previous.offset + previous.length;
    const comma = this.commaAfter(previousEnd);
    if (multiLine) {
      let lineEnd = this.skipInlineSpace(comma === undefined ? previousEnd : comma + 1);
      lineEnd = this.sameLineCommentEnd(lineEnd) ?? lineEnd;
      lineEnd = this.skipInlineSpace(lineEnd);
      if (lineEnd >= this.text.length || isLineBreak(this.text[lineEnd])) {
        const indent = this.lineIndent(previous.offset);
        const edits: TextEdit[] = [
          {
            start: lineEnd,
            end: lineEnd,
            content: `${this.eol}${indent}${this.entryText(key, value, indent)}${comma === undefined ? "" : ","}`,
          },
        ];
        if (comma === undefined) {
          edits.push({ start: previousEnd, end: previousEnd, content: "," });
        }
        this.apply(edits);
        return;
      }
    }
    const text = this.entryText(key, value, this.lineIndent(previous.offset));
    this.apply([{ start: previousEnd, end: previousEnd, content: `, ${text}` }]);
    this.fitToWidth(location);
  }

  // A one-line container that an inline insertion pushed past the width is laid
  // out again the way Biome would, so a project that formats its configs with
  // Biome still passes its check. One holding a comment keeps its line instead.
  private fitToWidth(location: JSONPath): void {
    const node = this.nodeAt(location);
    const start = this.lineStart(node.offset);
    const newline = this.text.indexOf("\n", node.offset);
    const lineEnd = newline === -1 ? this.text.length : newline;
    const line = this.text.slice(start, lineEnd).replace(/\r$/, "");
    const end = node.offset + node.length;
    if (
      line.length <= LINE_WIDTH ||
      this.text.slice(node.offset, end).includes("\n") ||
      this.hasComment(node.offset, end)
    ) {
      return;
    }
    this.replace(location, getNodeValue(node));
  }

  private hasComment(start: number, end: number): boolean {
    let inString = false;
    for (let i = start; i < end; i++) {
      const ch = this.text[i];
      if (inString) {
        if (ch === "\\") {
          i++;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "/" && (this.text[i + 1] === "/" || this.text[i + 1] === "*")) {
        return true;
      }
    }
    return false;
  }

  private insertIntoEmpty(container: Node, key: string | undefined, value: unknown): void {
    const inner = this.text.slice(container.offset + 1, container.offset + container.length - 1);
    const innerIsBlank = inner.trim() === "";
    const start = container.offset + 1;
    const end = innerIsBlank ? container.offset + container.length - 1 : start;
    if (key === undefined && !isPlainObject(value) && !Array.isArray(value)) {
      this.apply([{ start, end, content: this.entryText(undefined, value, "") }]);
      return;
    }
    const outer = this.lineIndent(container.offset);
    const indent = `${outer}${this.indentUnit}`;
    const text = this.entryText(key, value, indent);
    this.apply([
      {
        start,
        end,
        content: `${this.eol}${indent}${text}${innerIsBlank ? `${this.eol}${outer}` : ""}`,
      },
    ]);
  }

  private remove(container: Node, index: number): void {
    const children = container.children ?? [];
    const child = children[index] as Node;
    const start = child.offset;
    let end = child.offset + child.length;
    const comma = this.commaAfter(end);
    const ownComma = comma !== undefined;
    if (ownComma) {
      end = comma + 1;
    }
    const afterComma = this.skipInlineSpace(end);
    const commentEnd = this.sameLineCommentEnd(afterComma);
    const tail = commentEnd === undefined ? afterComma : this.skipInlineSpace(commentEnd);
    const lineStart = this.lineStart(start);
    const aloneOnLine =
      this.text.slice(lineStart, start).trim() === "" &&
      (tail >= this.text.length || isLineBreak(this.text[tail]));

    const edits: TextEdit[] = [];
    let previousComma: number | undefined;
    if (!ownComma && index > 0) {
      const previous = children[index - 1] as Node;
      previousComma = this.commaAfter(previous.offset + previous.length);
    }
    if (aloneOnLine) {
      let lineEnd = tail;
      if (this.text[lineEnd] === "\r") {
        lineEnd++;
      }
      if (this.text[lineEnd] === "\n") {
        lineEnd++;
      }
      edits.push({ start: lineStart, end: lineEnd, content: "" });
      if (previousComma !== undefined) {
        edits.push({ start: previousComma, end: previousComma + 1, content: "" });
      }
    } else if (ownComma) {
      edits.push({ start, end: afterComma, content: "" });
    } else if (previousComma !== undefined) {
      edits.push({ start: previousComma, end: child.offset + child.length, content: "" });
    } else {
      edits.push({ start, end: child.offset + child.length, content: "" });
    }
    this.apply(edits);
  }

  private replace(location: JSONPath, value: unknown): void {
    const node = this.nodeAt(location);
    const indent = this.lineIndent(node.offset);
    const column = node.offset - this.lineStart(node.offset);
    this.apply([
      {
        start: node.offset,
        end: node.offset + node.length,
        content: this.render(value, indent, column),
      },
    ]);
  }

  sync(location: JSONPath, desired: unknown): void {
    const current: unknown = getNodeValue(this.nodeAt(location));
    if (deepEqual(current, desired)) {
      return;
    }
    if (isPlainObject(current) && isPlainObject(desired)) {
      this.syncObject(location, desired);
    } else if (Array.isArray(current) && Array.isArray(desired)) {
      this.syncArray(location, current, desired);
    } else {
      this.replace(location, desired);
    }
  }

  private propertyIndex(location: JSONPath, key: string): number {
    const children = this.nodeAt(location).children ?? [];
    return children.findIndex((property) => property.children?.[0]?.value === key);
  }

  private syncObject(location: JSONPath, desired: Record<string, unknown>): void {
    const wanted = Object.entries(desired).filter(([, value]) => value !== undefined);
    const wantedKeys = new Set(wanted.map(([key]) => key));
    const currentKeys = (this.nodeAt(location).children ?? []).map(
      (property) => property.children?.[0]?.value as string,
    );
    for (const key of currentKeys) {
      if (!wantedKeys.has(key)) {
        this.remove(this.nodeAt(location), this.propertyIndex(location, key));
      }
    }
    let previousKey: string | undefined;
    for (const [key, value] of wanted) {
      if (this.propertyIndex(location, key) !== -1) {
        this.sync([...location, key], value);
      } else {
        const after = previousKey === undefined ? -1 : this.propertyIndex(location, previousKey);
        this.insert(location, after + 1, key, value);
      }
      previousKey = key;
    }
  }

  private syncArray(location: JSONPath, current: unknown[], desired: unknown[]): void {
    const anchors: Array<[number, number]> = [
      [-1, -1],
      ...commonSubsequence(current, desired),
      [current.length, desired.length],
    ];
    for (let k = anchors.length - 1; k > 0; k--) {
      const [ia, ja] = anchors[k - 1] as [number, number];
      const [ib, jb] = anchors[k] as [number, number];
      const removed = ib - ia - 1;
      const added = jb - ja - 1;
      const paired = Math.min(removed, added);
      for (let p = 0; p < paired; p++) {
        this.sync([...location, ia + 1 + p], desired[ja + 1 + p]);
      }
      for (let i = ib - 1; i >= ia + 1 + paired; i--) {
        this.remove(this.nodeAt(location), i);
      }
      for (let q = paired; q < added; q++) {
        this.insert(location, ia + 1 + q, undefined, desired[ja + 1 + q]);
      }
    }
  }
}

/**
 * Brings JSON-with-comments text to `desired` one object key and one array
 * entry at a time: comments, layout and line endings outside the entries that
 * change stay byte for byte. A deleted entry takes its own text, one comma and
 * a comment on the same line after it; an inserted one is formatted on its own.
 */
export function editJsoncText(
  text: string,
  desired: Record<string, unknown>,
  label = "JSON",
): string {
  const editor = new JsoncEditor(text, label);
  editor.sync([], desired);
  const result = parseJsoncObject(editor.text, label);
  if (!deepEqual(result, desired)) {
    throw new Error(`${label}: an in-place edit did not produce the intended settings`);
  }
  return editor.text;
}

/** Edits a config in place, writing only when the text changes; returns whether it did. */
export function editJsoncFile(filePath: string, desired: Record<string, unknown>): boolean {
  const before = readFileSync(filePath, "utf8");
  const after = editJsoncText(before, desired, filePath);
  if (after === before) {
    return false;
  }
  writeFileSync(filePath, after);
  return true;
}
