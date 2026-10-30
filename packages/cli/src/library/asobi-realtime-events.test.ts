import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { LIBRARY_DATA_DIR } from "./package-root";
import { printedModule } from "./print-corpus";

// `on` raises for a name the Lua does not register, and each handler receives what the Lua
// passes to `fire`. Both sides are read at test time: the printed declaration and the vendored
// `realtime.lua`, whose digest `authored-parity-floor.test.ts` pins.

const DECLARATION = await printedModule(LIBRARY_DATA_DIR, "asobi.realtime");
const UPSTREAM = resolve(LIBRARY_DATA_DIR, "fixtures/upstream-lua/asobi-defold/asobi/realtime.lua");

function declaredEvents(): Record<string, number> {
  const sf = ts.createSourceFile("asobi.realtime.d.ts", DECLARATION, ts.ScriptTarget.Latest, true);
  const module = sf.statements.find(
    (s): s is ts.ModuleDeclaration =>
      ts.isModuleDeclaration(s) && ts.isStringLiteral(s.name) && s.name.text === "asobi.realtime",
  );
  const body = module?.body;
  const events =
    body &&
    ts.isModuleBlock(body) &&
    body.statements.find(
      (s): s is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(s) && s.name.text === "RealtimeEvents",
    );
  if (!events) throw new Error("asobi.realtime declares no RealtimeEvents interface");
  const counts: Record<string, number> = {};
  for (const member of events.members) {
    if (!ts.isPropertySignature(member) || !member.type || !ts.isFunctionTypeNode(member.type)) {
      throw new Error(
        `RealtimeEvents member is not a function-typed property: ${member.getText(sf)}`,
      );
    }
    counts[member.name.getText(sf)] = member.type.parameters.length;
  }
  return counts;
}

function stripComments(lua: string): string {
  return lua
    .split("\n")
    .map((line) => {
      let quote: string | undefined;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = undefined;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "-" && line[i + 1] === "-") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function tableBody(lua: string, name: string): string {
  const start = lua.indexOf(`local ${name} = {`);
  const end = lua.indexOf("\n}", start);
  if (start < 0 || end < 0) throw new Error(`realtime.lua declares no ${name} table`);
  return lua.slice(start, end);
}

// Reads from just past `fire(` to its balanced `)`, splitting on top-level commas.
function callArguments(lua: string, open: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = open;
  for (let i = open; i < lua.length; i++) {
    const c = lua[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" && depth === 0) {
      args.push(lua.slice(start, i).trim());
      return args;
    } else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      args.push(lua.slice(start, i).trim());
      start = i + 1;
    }
  }
  throw new Error("realtime.lua has an unbalanced fire call");
}

function upstreamEvents(): Record<string, number> {
  const lua = stripComments(readFileSync(UPSTREAM, "utf8"));
  const serverEvents = new Set(
    [...tableBody(lua, "SERVER_EVENTS").matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1] as string),
  );
  const knownEvents = [
    ...tableBody(lua, "KNOWN_EVENTS").matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*true\b/gm),
  ].map((m) => m[1] as string);
  const widest = new Map<string, number>();
  const widen = (name: string, count: number) =>
    widest.set(name, Math.max(widest.get(name) ?? 0, count));
  let dispatchSites = 0;
  for (const site of lua.matchAll(/(?<!function\s+)\bfire\(/g)) {
    const [, name, ...passed] = callArguments(lua, site.index + site[0].length);
    const literal = name?.match(/^"([^"]+)"$/);
    if (literal) {
      widen(literal[1] as string, passed.length);
    } else {
      dispatchSites++;
      for (const event of serverEvents) widen(event, passed.length);
    }
  }
  if (dispatchSites !== 1)
    throw new Error(`expected one SERVER_EVENTS dispatch site, found ${dispatchSites}`);
  const counts: Record<string, number> = {};
  for (const event of new Set([...serverEvents, ...knownEvents])) {
    const count = widest.get(event);
    if (count === undefined) throw new Error(`realtime.lua registers ${event} but never fires it`);
    counts[event] = count;
  }
  return counts;
}

test("on accepts exactly the events realtime.lua registers", () => {
  expect(Object.keys(declaredEvents()).sort()).toEqual(Object.keys(upstreamEvents()).sort());
});

test("each event handler declares as many arguments as realtime.lua passes it", () => {
  expect(declaredEvents()).toEqual(upstreamEvents());
});
