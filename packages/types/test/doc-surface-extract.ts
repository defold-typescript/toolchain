export interface SymbolDoc {
  kind: "function" | "value";
  multiReturn: boolean;
  hasDescription: boolean;
  paramNames: Set<string>;
  hasReturns: boolean;
  hasExample: boolean;
}

interface ParsedDoc {
  hasDescription: boolean;
  paramNames: string[];
  hasReturns: boolean;
  hasExample: boolean;
}

const NAMESPACE_OPEN =
  /(?:export |declare )?namespace\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\{/;
const GLOBAL_OPEN = /\bdeclare\s+global\s*\{/;
const FN_DECL = /(?:export\s+|declare\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]/;
const VAR_DECL = /(?:export\s+|declare\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/;

function stripCommentMargin(line: string): string {
  return line.replace(/^\s*\*?\s?/, "");
}

function parseDocBlock(block: string[]): ParsedDoc {
  let hasDescription = false;
  let hasReturns = false;
  let hasExample = false;
  const paramNames: string[] = [];
  let seenTag = false;
  for (const raw of block) {
    const text = stripCommentMargin(raw).trimEnd();
    if (text.startsWith("@")) {
      seenTag = true;
      const param = text.match(/^@param\s+(?:-\s+)?([A-Za-z_$][\w$]*)/);
      if (param?.[1]) paramNames.push(param[1]);
      if (/^@returns?\b/.test(text)) hasReturns = true;
      if (/^@example\b/.test(text)) hasExample = true;
      continue;
    }
    if (!seenTag && text.trim() !== "") hasDescription = true;
  }
  return { hasDescription, paramNames, hasReturns, hasExample };
}

function mergeInto(target: SymbolDoc, doc: ParsedDoc, multiReturn: boolean): void {
  target.hasDescription ||= doc.hasDescription;
  target.hasReturns ||= doc.hasReturns;
  target.hasExample ||= doc.hasExample;
  target.multiReturn ||= multiReturn;
  for (const name of doc.paramNames) target.paramNames.add(name);
}

function signatureText(lines: string[], start: number): string {
  let text = lines[start] ?? "";
  for (let k = start; !text.includes(";") && k + 1 < lines.length; ) {
    k++;
    text += lines[k] ?? "";
  }
  return text;
}

/**
 * Text-level extractor shared by both the pinned ts-defold-types fixture and our
 * own `generated/*.d.ts`: walks namespace frames (real `namespace X {` plus the
 * `declare global {` wrapper), attaches each preceding `/** … *\/` block to the
 * function/const it documents, and keys symbols by their full dotted path.
 * Overloaded re-declarations (the fixture lists each twice) merge by union.
 */
export function extractSurface(source: string): Map<string, SymbolDoc> {
  const out = new Map<string, SymbolDoc>();
  const lines = source.split("\n");
  const frames: (string | null)[] = [];
  let pending: ParsedDoc | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("/**")) {
      const block: string[] = [];
      let j = i;
      let text = line;
      while (true) {
        block.push(text.replace(/^\s*\/\*\*/, "").replace(/\*\/\s*$/, ""));
        if (text.includes("*/")) break;
        j++;
        if (j >= lines.length) break;
        text = lines[j] ?? "";
      }
      i = j;
      pending = parseDocBlock(block);
      continue;
    }

    if (trimmed === "") continue;

    const nsName = NAMESPACE_OPEN.exec(line)?.[1];
    if (nsName) {
      frames.push(nsName);
      pending = null;
      continue;
    }
    if (GLOBAL_OPEN.test(line)) {
      frames.push(null);
      pending = null;
      continue;
    }
    if (trimmed === "}") {
      frames.pop();
      pending = null;
      continue;
    }

    const fnName = FN_DECL.exec(line)?.[1];
    const varName = fnName ? undefined : VAR_DECL.exec(line)?.[1];
    const name = fnName ?? varName;
    if (name) {
      const ns = frames.filter((f): f is string => f !== null);
      const key = [...ns, name].join(".");
      const multiReturn = fnName ? signatureText(lines, i).includes("LuaMultiReturn") : false;
      const doc = pending ?? {
        hasDescription: false,
        paramNames: [],
        hasReturns: false,
        hasExample: false,
      };
      const existing = out.get(key);
      if (existing) {
        mergeInto(existing, doc, multiReturn);
      } else {
        out.set(key, {
          kind: fnName ? "function" : "value",
          multiReturn,
          hasDescription: doc.hasDescription,
          paramNames: new Set(doc.paramNames),
          hasReturns: doc.hasReturns,
          hasExample: doc.hasExample,
        });
      }
      pending = null;
    }
  }

  return out;
}
