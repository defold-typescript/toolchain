/**
 * Whether each stored translation follows its *own* source rather than another
 * version of the same example.
 *
 * A re-pin that copies the older body forward type-checks when the older names
 * still resolve, and ownership is satisfied because the hash is new — so the
 * only evidence left is the API names. A body that writes a name its variant's
 * source uses but its own source dropped, or leaves out a name its own source
 * added, was translated from the wrong Lua.
 *
 * A variant is another source of the same fqn shipped by a disjoint set of
 * targets. Sources sharing a target are separate examples of one doc
 * (`gui.animate` ships three on every target), not versions of one example.
 */
import ts from "typescript";
import type { TranslationStore } from "../src/example-store";
import { dottedChain, type ExampleSourceIndex, longestKnownNamespace } from "./example-surfaces";

export function variantDriftDefects(
  store: TranslationStore,
  index: ExampleSourceIndex,
): readonly string[] {
  const defects: string[] = [];
  for (const [fqn, entries] of Object.entries(store)) {
    const byHash = index.sources.get(fqn);
    if (byHash === undefined) continue;
    for (const entry of entries) {
      const own = byHash.get(entry.sourceHash);
      if (own === undefined) continue;
      const variants = [...byHash].filter(
        ([hash, source]) =>
          hash !== entry.sourceHash && [...source.targets].every((id) => !own.targets.has(id)),
      );
      if (variants.length === 0) continue;
      const sourceNames = luaNames(own.lua, index.namespaces);
      const bodyNames = translationNames(entry.ts, index.namespaces);
      const undocumentedOnOwner = (name: string) =>
        [...own.targets].some((id) => !(index.documented.get(id)?.has(name) ?? false));
      // A body may write another version's name only in place of an own-source
      // name its shipping target cannot resolve: `resource.TEXTURE_*` is
      // undocumented on `defold-1.12.4`, which documents `graphics.TEXTURE_*`.
      const dropped = [...sourceNames].filter((name) => !bodyNames.has(name));
      const substituted = dropped.length > 0 && dropped.every(undocumentedOnOwner);
      const identity = `${fqn}:${entry.sourceHash}`;
      for (const [variantHash, variant] of variants) {
        const variantNames = luaNames(variant.lua, index.namespaces);
        for (const name of bodyNames) {
          if (substituted || sourceNames.has(name) || !variantNames.has(name)) continue;
          defects.push(`${identity} carries ${name} from ${variantHash}`);
        }
        for (const name of sourceNames) {
          if (variantNames.has(name) || bodyNames.has(name) || undocumentedOnOwner(name)) continue;
          defects.push(`${identity} omits ${name} its source adds over ${variantHash}`);
        }
      }
    }
  }
  return defects.sort();
}

/**
 * `<namespace>.<member>` for each property access whose receiver is exactly a
 * known namespace. The walk stops at the first such receiver from the outside,
 * so `b2d.body.create_chain` yields that name alone and never `b2d.body` too,
 * matching the one name `luaNames` reads from the same chain.
 */
function translationNames(source: string, known: ReadonlySet<string>): ReadonlySet<string> {
  const parsed = ts.createSourceFile("body.ts", source, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = dottedChain(node.expression);
      if (receiver !== undefined && longestKnownNamespace(receiver, known) === receiver) {
        found.add(`${receiver}.${node.name.text}`);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

const LUA_CHAIN = /(?<![\w.:])[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+/g;

function luaNames(lua: string, known: ReadonlySet<string>): ReadonlySet<string> {
  const found = new Set<string>();
  for (const [chain] of stripLuaCommentsAndStrings(lua).matchAll(LUA_CHAIN)) {
    const parts = chain.split(".");
    const namespace = longestKnownNamespace(parts.slice(0, -1).join("."), known);
    if (namespace === undefined) continue;
    found.add(`${namespace}.${parts[namespace.split(".").length]}`);
  }
  return found;
}

/**
 * The Lua with every comment and string blanked. One left-to-right scan, because
 * each form hides the others' delimiters: `"--"` is a string, `-- "` a comment.
 */
function stripLuaCommentsAndStrings(lua: string): string {
  let out = "";
  let at = 0;
  while (at < lua.length) {
    if (lua.startsWith("--", at)) {
      const level = longBracketLevel(lua, at + 2);
      if (level === undefined) {
        const lineEnd = lua.indexOf("\n", at);
        at = lineEnd === -1 ? lua.length : lineEnd;
      } else {
        at = longBracketEnd(lua, at + 2, level);
      }
      out += " ";
      continue;
    }
    const level = longBracketLevel(lua, at);
    if (level !== undefined) {
      at = longBracketEnd(lua, at, level);
      out += " ";
      continue;
    }
    const quote = lua[at];
    if (quote === '"' || quote === "'") {
      at += 1;
      while (at < lua.length && lua[at] !== quote && lua[at] !== "\n") {
        at += lua[at] === "\\" ? 2 : 1;
      }
      at += 1;
      out += " ";
      continue;
    }
    out += quote;
    at += 1;
  }
  return out;
}

/** The `=` count of a long bracket opening at `at` (`[[`, `[==[`), if one does. */
function longBracketLevel(lua: string, at: number): number | undefined {
  if (lua[at] !== "[") return undefined;
  let level = 0;
  while (lua[at + 1 + level] === "=") level += 1;
  return lua[at + 1 + level] === "[" ? level : undefined;
}

/** The index just past the long bracket closing the one opened at `at`. */
function longBracketEnd(lua: string, at: number, level: number): number {
  const close = `]${"=".repeat(level)}]`;
  const end = lua.indexOf(close, at + level + 2);
  return end === -1 ? lua.length : end + close.length;
}
