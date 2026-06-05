import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { MODULE_MANIFEST } from "../scripts/regen";
import type { ApiFunction } from "../src/api-doc";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToDocText } from "../src/doc-comment";
import { summaryFor } from "../src/emit-dts";
import { extractSurface } from "./doc-surface-extract";

interface FacadeTarget {
  readonly key: string;
  readonly namespace: string;
  readonly fnName: string;
  readonly localName: string;
  readonly file: string;
}

const TARGETS: readonly FacadeTarget[] = [
  {
    key: "msg.post",
    namespace: "msg",
    fnName: "msg.post",
    localName: "post",
    file: "msg-overloads.d.ts",
  },
  { key: "go.get", namespace: "go", fnName: "go.get", localName: "get", file: "go-overloads.d.ts" },
  { key: "go.set", namespace: "go", fnName: "go.set", localName: "set", file: "go-overloads.d.ts" },
];

function fixtureFunction(namespace: string, fnName: string): ApiFunction {
  const entry = MODULE_MANIFEST.find((m) => m.namespace === namespace);
  if (!entry) throw new Error(`no MODULE_MANIFEST entry for namespace "${namespace}"`);
  const fn = parseDefoldApiDoc(entry.doc).functions.find((f) => f.name === fnName);
  if (!fn) throw new Error(`fixture for "${namespace}" has no function "${fnName}"`);
  return fn;
}

// Pull the raw JSDoc block that sits directly above the first `function
// <localName>(` overload signature. Returns the summary text (margin-stripped
// lines before the first `@tag`, trailing blanks dropped) and the fence language
// that follows `@example`, so the drift guard can pin both.
function firstOverloadBlock(
  source: string,
  localName: string,
): { summary: string; exampleFence: string | null } {
  const lines = source.split("\n");
  const fnRe = new RegExp(`function\\s+${localName}\\s*[(<]`);
  const fnIdx = lines.findIndex((l) => fnRe.test(l));
  if (fnIdx === -1) throw new Error(`no "function ${localName}" declaration found`);

  let close = fnIdx - 1;
  while (close >= 0 && (lines[close] ?? "").trim() === "") close--;
  if (close < 0 || !(lines[close] ?? "").trim().endsWith("*/")) {
    throw new Error(`no JSDoc block directly above "function ${localName}"`);
  }
  let open = close;
  while (open >= 0 && !(lines[open] ?? "").trim().startsWith("/**")) open--;
  if (open < 0) throw new Error(`unterminated JSDoc block above "function ${localName}"`);

  const body = lines
    .slice(open + 1, close)
    .map((l) => l.replace(/^\s*\*\s?/, "").replace(/\s+$/, ""));

  const summaryLines: string[] = [];
  let exampleFence: string | null = null;
  let seenTag = false;
  for (let i = 0; i < body.length; i++) {
    const text = body[i] ?? "";
    if (text.startsWith("@")) {
      seenTag = true;
      if (text.startsWith("@example")) exampleFence = (body[i + 1] ?? "").trim();
      continue;
    }
    if (!seenTag) summaryLines.push(text);
  }

  while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] === "") {
    summaryLines.pop();
  }
  return { summary: summaryLines.join("\n"), exampleFence };
}

describe("facade overload docs — drift guard for the skipped-and-replaced trio", () => {
  for (const target of TARGETS) {
    test(`${target.key}: documented at least as well as its fixture`, async () => {
      const fn = fixtureFunction(target.namespace, target.fnName);
      const file = resolve(import.meta.dir, "..", "src", target.file);
      const source = await Bun.file(file).text();

      // `go-overloads`'s `interface GoPropertyOptions` closing brace pops the
      // `go` frame in `extractSurface`, so `get`/`set` key bare; `msg.post`
      // keeps its namespace. Look up under either form.
      const symbols = extractSurface(source);
      const surface = symbols.get(target.key) ?? symbols.get(target.localName);
      expect(surface).toBeDefined();
      expect(surface?.hasDescription).toBe(true);

      const documentedParams = fn.parameters
        .filter((p) => htmlToDocText(p.doc).trim() !== "")
        .map((p) => p.name);
      for (const name of documentedParams) {
        expect(surface?.paramNames.has(name)).toBe(true);
      }
    });

    test(`${target.key}: authored summary equals the fixture prose`, async () => {
      const fn = fixtureFunction(target.namespace, target.fnName);
      const file = resolve(import.meta.dir, "..", "src", target.file);
      const source = await Bun.file(file).text();

      const { summary } = firstOverloadBlock(source, target.localName);
      expect(summary).toBe(htmlToDocText(summaryFor(fn.brief, fn.description)));
    });

    test(`${target.key}: @example is fenced as TypeScript`, async () => {
      const file = resolve(import.meta.dir, "..", "src", target.file);
      const source = await Bun.file(file).text();
      const { exampleFence } = firstOverloadBlock(source, target.localName);
      expect(exampleFence).toBe("```ts");
    });
  }
});
