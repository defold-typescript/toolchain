import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { MODULE_MANIFEST } from "../scripts/regen";
import type { ApiFunction } from "../src/api-doc";
import { parseDefoldApiDoc } from "../src/api-doc";
import { htmlToDocText } from "../src/doc-comment";
import { summaryFor } from "../src/emit-dts";
import { SCRIPT_HOOK_NAMES } from "../src/lifecycle";
import { offGridLines } from "./jsdoc-wellformed";

const lifecycleFile = resolve(import.meta.dir, "..", "src", "lifecycle.ts");
const lifecycleSource = await Bun.file(lifecycleFile).text();

function fixtureFunction(namespace: string, fnName: string): ApiFunction {
  const entry = MODULE_MANIFEST.find((m) => m.namespace === namespace);
  if (!entry) throw new Error(`no MODULE_MANIFEST entry for namespace "${namespace}"`);
  const fn = parseDefoldApiDoc(entry.doc).functions.find((f) => f.name === fnName);
  if (!fn) throw new Error(`fixture for "${namespace}" has no function "${fnName}"`);
  return fn;
}

// Pull the JSDoc block sitting directly above an interface member line. `call`
// members read `<name>?(`, `prop` members read `<name>?:`. Mirrors
// `firstOverloadBlock` in facade-overload-docs.test.ts: walk up over blanks,
// require the previous non-blank line to close a block, find its `/**` open,
// then split the body into summary (lines before the first `@tag`) and the set
// of `@param` names declared.
function memberBlock(
  source: string,
  memberName: string,
  kind: "call" | "prop" = "call",
): { summary: string; params: Set<string> } {
  const lines = source.split("\n");
  const tail = kind === "call" ? "\\?\\(" : "\\?:";
  const memberRe = new RegExp(`^\\s*${memberName}${tail}`);
  const memberIdx = lines.findIndex((l) => memberRe.test(l));
  if (memberIdx === -1) throw new Error(`no member "${memberName}" found`);

  let close = memberIdx - 1;
  while (close >= 0 && (lines[close] ?? "").trim() === "") close--;
  if (close < 0 || !(lines[close] ?? "").trim().endsWith("*/")) {
    throw new Error(`no JSDoc block directly above member "${memberName}"`);
  }
  let open = close;
  while (open >= 0 && !(lines[open] ?? "").trim().startsWith("/**")) open--;
  if (open < 0) throw new Error(`unterminated JSDoc block above member "${memberName}"`);

  const body = lines
    .slice(open + 1, close)
    .map((l) => l.replace(/^\s*\*\s?/, "").replace(/\s+$/, ""));

  const summaryLines: string[] = [];
  const params = new Set<string>();
  let seenTag = false;
  for (const text of body) {
    if (text.startsWith("@")) {
      seenTag = true;
      const m = /^@param\s+(\S+)/.exec(text);
      if (m?.[1]) params.add(m[1]);
      continue;
    }
    if (!seenTag) summaryLines.push(text);
  }
  while (summaryLines.length > 0 && summaryLines[summaryLines.length - 1] === "") {
    summaryLines.pop();
  }
  return { summary: summaryLines.join("\n"), params };
}

// Parameter names declared on the first signature of an interface member, used
// to decide which fixture params survive in our shape (`init` takes none).
function signatureParamNames(source: string, memberName: string): Set<string> {
  const idx = source.indexOf(`${memberName}?(`);
  if (idx === -1) throw new Error(`no signature for member "${memberName}"`);
  const openParen = source.indexOf("(", idx);
  let depth = 0;
  let end = openParen;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const inner = source.slice(openParen + 1, end);
  const names = new Set<string>();
  for (const part of inner.split(",")) {
    const m = /^\s*([A-Za-z_]\w*)/.exec(part);
    if (m?.[1]) names.add(m[1]);
  }
  return names;
}

// Find the `{ ... }` body span of an `export type <name>` declaration (the
// object literal after `Omit<...> &`) so the right `init` override is matched,
// not the base `ScriptHooks.init`.
function typeBraceSpan(source: string, typeName: string): string {
  const decl = source.indexOf(`export type ${typeName}`);
  if (decl === -1) throw new Error(`no type "${typeName}"`);
  const openBrace = source.indexOf("{", decl);
  if (openBrace === -1) throw new Error(`no object body for type "${typeName}"`);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(openBrace, i + 1);
    }
  }
  throw new Error(`unterminated object body for type "${typeName}"`);
}

function memberHasPrecedingDoc(spanSource: string, memberRe: RegExp): boolean {
  const lines = spanSource.split("\n");
  const idx = lines.findIndex((l) => memberRe.test(l));
  if (idx === -1) return false;
  let close = idx - 1;
  while (close >= 0 && (lines[close] ?? "").trim() === "") close--;
  return close >= 0 && (lines[close] ?? "").trim().endsWith("*/");
}

describe("lifecycle hook-member docs", () => {
  test("every ScriptHooks member carries a non-empty JSDoc summary", () => {
    for (const name of SCRIPT_HOOK_NAMES) {
      const { summary } = memberBlock(lifecycleSource, name);
      expect(summary.length).toBeGreaterThan(0);
    }
  });

  test("each *WithProperties init override and properties member is documented", () => {
    const types = [
      "ScriptHooksWithProperties",
      "GuiScriptHooksWithProperties",
      "RenderScriptHooksWithProperties",
    ];
    for (const typeName of types) {
      const span = typeBraceSpan(lifecycleSource, typeName);
      expect(memberHasPrecedingDoc(span, /^\s*init\?\(/)).toBe(true);
      expect(memberHasPrecedingDoc(span, /^\s*properties\?:/)).toBe(true);
    }
  });

  test("each hook summary equals its go-fixture prose (drift guard)", () => {
    for (const name of SCRIPT_HOOK_NAMES) {
      const fn = fixtureFunction("go", name);
      const { summary } = memberBlock(lifecycleSource, name);
      expect(summary).toBe(htmlToDocText(summaryFor(fn.brief, fn.description)));
    }
  });

  test("each hook declares @param for every documented fixture param in our signature", () => {
    for (const name of SCRIPT_HOOK_NAMES) {
      const fn = fixtureFunction("go", name);
      const ours = signatureParamNames(lifecycleSource, name);
      const { params } = memberBlock(lifecycleSource, name);
      for (const p of fn.parameters) {
        if (htmlToDocText(p.doc).trim() === "" || !ours.has(p.name)) continue;
        expect(params.has(p.name)).toBe(true);
      }
    }
  });

  test("every line inside a lifecycle JSDoc block stays on the ` * ` grid", () => {
    expect(offGridLines(lifecycleSource)).toEqual([]);
  });
});
