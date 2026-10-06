/**
 * Whether each stored translation makes the engine calls its Lua sample makes.
 *
 * A translation that loses a step still type-checks, and the drift guard is
 * satisfied because the hash is unchanged — so the only evidence left is how
 * many times each side calls each engine function. A call the Lua makes and the
 * translation does not is an omission; a call only the translation makes is
 * either scaffold or an invented step, which no rule can tell apart, so those
 * are printed for review rather than gated.
 *
 * Calls are counted, not collected into a set: a sample that reshapes three
 * fixtures and a translation that reshapes two name the same function.
 *
 * Both sides are read as calls, never as names: a function passed by reference
 * or named in a comment or a string is not something the sample executes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { FUNCTION_NAME_CORRECTIONS } from "../src/api-doc";
import type { TranslationStore } from "../src/example-store";
import {
  dottedChain,
  type ExampleSourceIndex,
  kindFactoryNames,
  longestKnownNamespace,
} from "./example-surfaces";
import { stripLuaCommentsAndStrings } from "./example-variant-drift";

/** A dotted callee rooted in a known namespace, or nothing for any other callee. */
function engineCall(
  chain: string | undefined,
  namespaces: ReadonlySet<string>,
): string | undefined {
  if (chain === undefined) return undefined;
  const receiver = chain.slice(0, Math.max(chain.lastIndexOf("."), 0));
  return longestKnownNamespace(receiver, namespaces) === undefined ? undefined : chain;
}

// A table constructor after a callee is Lua's parenthesis-free call form:
// `editor.ui.text_button { text = "ok" }`.
const LUA_CALL = /(?<![\w.:])[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+(?=[ \t]*[({])/g;

/** An engine function's name -> how many times a body calls it. */
export type CallCounts = ReadonlyMap<string, number>;

function count(counts: Map<string, number>, name: string, times = 1): void {
  counts.set(name, (counts.get(name) ?? 0) + times);
}

/**
 * The engine calls a Lua sample makes. The tail of a line after `->` is the
 * result the docs illustrate (`model.get_aabb("#m") -> { min = vmath.vector3(...) }`),
 * so a call written there is never executed.
 */
export function luaEngineCalls(lua: string, namespaces: ReadonlySet<string>): CallCounts {
  const executed = stripLuaCommentsAndStrings(lua)
    .split("\n")
    .map((line) => line.split("->")[0] ?? "")
    .join("\n");
  const counts = new Map<string, number>();
  for (const [chain] of executed.matchAll(LUA_CALL)) {
    const name = engineCall(chain, namespaces);
    if (name !== undefined) count(counts, name);
  }
  return counts;
}

/** The members of a `properties` object passed to a kind factory, if this call is one. */
function declaredProperties(call: ts.CallExpression, factories: ReadonlySet<string>): number {
  const [options] = call.arguments;
  if (
    !ts.isIdentifier(call.expression) ||
    !factories.has(call.expression.text) ||
    options === undefined ||
    !ts.isObjectLiteralExpression(options)
  ) {
    return 0;
  }
  for (const member of options.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
      member.name.text === "properties" &&
      ts.isObjectLiteralExpression(member.initializer)
    ) {
      return member.initializer.properties.length;
    }
  }
  return 0;
}

/**
 * The engine calls a translation makes, a template literal's embedded calls
 * included. `go.get<label.properties>()("#label", "text")` counts once: the
 * typed accessor's own callee is the engine function, and the call of what it
 * returns has no dotted callee.
 *
 * `go.property` has no TypeScript call form. The transpiler emits one
 * registration per member of a kind factory's `properties` object, so each
 * member is a call the translation makes.
 */
export function tsEngineCalls(source: string, namespaces: ReadonlySet<string>): CallCounts {
  const parsed = ts.createSourceFile("body.ts", source, ts.ScriptTarget.Latest, true);
  const factories = new Set(kindFactoryNames());
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = engineCall(dottedChain(node.expression), namespaces);
      if (name !== undefined) count(counts, name);
      const declared = declaredProperties(node, factories);
      if (declared > 0) count(counts, "go.property", declared);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return counts;
}

export interface ScopePair {
  readonly lua: string;
  readonly ts: string;
  readonly namespaces: ReadonlySet<string>;
}

interface CallSides {
  readonly source: CallCounts;
  readonly body: CallCounts;
}

/**
 * Both sides under one naming. A function the ref-doc misspells is read as the
 * name its engine binding registers, since that is the only name a translation
 * can call.
 */
function callSides({ lua, ts: source, namespaces }: ScopePair): CallSides {
  const corrected = new Map<string, number>();
  for (const [name, times] of luaEngineCalls(lua, namespaces)) {
    count(corrected, FUNCTION_NAME_CORRECTIONS.get(name)?.name ?? name, times);
  }
  return { source: corrected, body: tsEngineCalls(source, namespaces) };
}

/** The engine functions the translation calls fewer times than its Lua does. */
export function droppedCalls(pair: ScopePair): string[] {
  const { source, body } = callSides(pair);
  return [...source]
    .filter(([name, times]) => (body.get(name) ?? 0) < times)
    .map(([name]) => name)
    .sort();
}

/** The engine functions the translation calls more times than its Lua does. */
export function addedCalls(pair: ScopePair): string[] {
  const { source, body } = callSides(pair);
  return [...body]
    .filter(([name, times]) => times > (source.get(name) ?? 0))
    .map(([name]) => name)
    .sort();
}

export interface ScopeBody {
  readonly fqn: string;
  readonly sourceHash: string;
  readonly dropped: readonly string[];
  readonly added: readonly string[];
}

/**
 * Every stored translation whose Lua a committed target still documents, with
 * its call differences. A body no target documents has no Lua to compare
 * against; the ownership gate names those.
 */
export function scopeBodies(store: TranslationStore, index: ExampleSourceIndex): ScopeBody[] {
  const bodies: ScopeBody[] = [];
  for (const [fqn, entries] of Object.entries(store)) {
    const byHash = index.sources.get(fqn);
    if (byHash === undefined) continue;
    for (const entry of entries) {
      const own = byHash.get(entry.sourceHash);
      if (own === undefined) continue;
      const pair = { lua: own.lua, ts: entry.ts, namespaces: index.namespaces };
      bodies.push({
        fqn,
        sourceHash: entry.sourceHash,
        dropped: droppedCalls(pair),
        added: addedCalls(pair),
      });
    }
  }
  return bodies;
}

/**
 * A translation deliberately left without engine calls its Lua sample makes,
 * pinned like a translation by the hash of that sample, with the functions it
 * calls less often and the reason TypeScript has no form for them.
 */
export type ScopeKeepStore = Record<
  string,
  { sourceHash: string; calls: string[]; reason: string }[]
>;

const SCOPE_KEPT_PATH = resolve(import.meta.dir, "..", "examples", "scope-kept.json");

export function loadScopeKeeps(path: string = SCOPE_KEPT_PATH): ScopeKeepStore {
  return JSON.parse(readFileSync(path, "utf8")) as ScopeKeepStore;
}

export interface ScopeDefects {
  /** A body omitting calls that no kept entry records exactly. */
  readonly dropped: readonly string[];
  /** A kept entry whose body is gone, or omits something other than what it records. */
  readonly ghosts: readonly string[];
}

export function scopeDefects(
  store: TranslationStore,
  index: ExampleSourceIndex,
  keeps: ScopeKeepStore,
): ScopeDefects {
  const live = new Map<string, ScopeBody>(
    scopeBodies(store, index).map((body) => [`${body.fqn}:${body.sourceHash}`, body]),
  );
  const kept = new Map<string, string>();
  const ghosts: string[] = [];
  for (const [fqn, entries] of Object.entries(keeps)) {
    for (const entry of entries) {
      const identity = `${fqn}:${entry.sourceHash}`;
      const calls = [...entry.calls].sort().join(", ");
      kept.set(identity, calls);
      const body = live.get(identity);
      if (body === undefined) {
        ghosts.push(`${identity} keeps ${calls} but matches no translated example`);
      } else if (body.dropped.join(", ") !== calls) {
        ghosts.push(`${identity} keeps ${calls} but drops ${body.dropped.join(", ") || "nothing"}`);
      }
    }
  }
  const dropped: string[] = [];
  for (const [identity, body] of live) {
    const calls = body.dropped.join(", ");
    if (calls !== "" && kept.get(identity) !== calls) dropped.push(`${identity} drops ${calls}`);
  }
  return { dropped: dropped.sort(), ghosts: ghosts.sort() };
}

// The review report for added calls: scaffold cannot be told from an invented
// step mechanically, so each line is read once against its Lua.
if (import.meta.main) {
  const { loadTranslations } = await import("./example-store-io");
  const { exampleSourceIndex } = await import("./example-surfaces");
  for (const body of scopeBodies(loadTranslations(), exampleSourceIndex())) {
    if (body.added.length === 0 && body.dropped.length === 0) continue;
    process.stdout.write(
      `${body.fqn}@${body.sourceHash.slice(0, 6)} +[${body.added.join(", ")}] -[${body.dropped.join(", ")}]\n`,
    );
  }
}
