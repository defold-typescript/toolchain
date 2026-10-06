import { describe, expect, test } from "bun:test";
import { FUNCTION_NAME_CORRECTIONS } from "../src/api-doc";
import {
  addedCalls,
  droppedCalls,
  loadScopeKeeps,
  luaEngineCalls,
  scopeDefects,
  tsEngineCalls,
} from "./example-scope-parity";
import { loadTranslations } from "./example-store-io";
import { exampleSourceIndex } from "./example-surfaces";

const index = exampleSourceIndex();
const { namespaces } = index;

function counts(calls: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries([...calls].sort(([a], [b]) => a.localeCompare(b)));
}

describe("lua engine calls", () => {
  test("a call in a comment or a string literal is not a call", () => {
    const lua = "go.get(url, 'x') -- sound.play('#s')\nprint('msg.post(1)')";
    expect(counts(luaEngineCalls(lua, namespaces))).toEqual({ "go.get": 1 });
  });

  test("text after a result marker on the same line is illustration", () => {
    const lua = 'model.get_aabb("#m") -> { min = vmath.vector3(0, 0, 0) }';
    expect(counts(luaEngineCalls(lua, namespaces))).toEqual({ "model.get_aabb": 1 });
  });

  test("a call on the line after a result marker still counts", () => {
    const lua = 'model.get_aabb("#m") -> { min = 0 }\nvmath.vector3(0, 0, 0)';
    expect(counts(luaEngineCalls(lua, namespaces))).toEqual({
      "model.get_aabb": 1,
      "vmath.vector3": 1,
    });
  });

  test("a callee followed by a table constructor is a call", () => {
    const lua = "return editor.ui.text_button {\n  text = tostring(count)\n}";
    expect(counts(luaEngineCalls(lua, namespaces))).toEqual({ "editor.ui.text_button": 1 });
  });

  test("a member of a local table that shares a namespace's name is not an engine call", () => {
    expect(counts(luaEngineCalls("self.go.get(url)\nmy_go.get(url)", namespaces))).toEqual({});
  });

  test("each call of one function is counted", () => {
    const lua = "go.delete()\ngo.delete(id)\ngo.delete(ids)";
    expect(counts(luaEngineCalls(lua, namespaces))).toEqual({ "go.delete": 3 });
  });
});

describe("typescript engine calls", () => {
  test("a curried typed accessor and a call inside a template literal both count once", () => {
    const ts = [
      'const t = go.get<label.properties>()("#label", "text");',
      `print(\`.\${editor.get(a, "path")}\`);`,
      "// sound.play('#s')",
      'const s = "msg.post(1)";',
    ].join("\n");
    expect(counts(tsEngineCalls(ts, namespaces))).toEqual({ "editor.get": 1, "go.get": 1 });
  });

  test("a nested namespace's call is named in full", () => {
    expect(counts(tsEngineCalls("b2d.body.create_chain(body, {});", namespaces))).toEqual({
      "b2d.body.create_chain": 1,
    });
  });

  test("a namespace member that is read but not called is not a call", () => {
    expect(counts(tsEngineCalls("timer.delay(1, false, go.delete);", namespaces))).toEqual({
      "timer.delay": 1,
    });
  });

  test("each member of a kind factory's properties object is a go.property call", () => {
    const ts = "export default defineScript({ properties: { hp: 1, mp: 2 }, init(self) {} });";
    expect(counts(tsEngineCalls(ts, namespaces))).toEqual({ "go.property": 2 });
  });

  test("a properties object outside a kind factory declares nothing", () => {
    expect(counts(tsEngineCalls("const config = { properties: { hp: 1 } };", namespaces))).toEqual(
      {},
    );
  });
});

describe("dropped and added calls", () => {
  const lua = 'go.property("hp", 1)\nfunction init(self)\n  print(self.hp)\nend';

  test("go.property is declared by a kind factory's properties member", () => {
    const ts = "export default defineScript({ properties: { hp: 1 }, init(self) {} });";
    expect(droppedCalls({ lua, ts, namespaces })).toEqual([]);
  });

  test("go.property is dropped when the translation declares no properties", () => {
    const ts = "export default defineScript({ init(self) { print(self.hp); } });";
    expect(droppedCalls({ lua, ts, namespaces })).toEqual(["go.property"]);
  });

  test("go.property is dropped when the translation declares fewer properties than the Lua", () => {
    const two = `${lua}\ngo.property("mp", 2)`;
    const ts = "export default defineScript({ properties: { hp: 1 }, init(self) {} });";
    expect(droppedCalls({ lua: two, ts, namespaces })).toEqual(["go.property"]);
  });

  test("a function the translation calls fewer times than its Lua is dropped", () => {
    const pair = { lua: "go.delete()\ngo.delete(id)", ts: "go.delete();", namespaces };
    expect(droppedCalls(pair)).toEqual(["go.delete"]);
    expect(addedCalls(pair)).toEqual([]);
  });

  test("a function the translation calls more times than its Lua is added", () => {
    const pair = { lua: "go.delete(id)", ts: "go.delete(go.get_id()); go.delete();", namespaces };
    expect(droppedCalls(pair)).toEqual([]);
    expect(addedCalls(pair)).toEqual(["go.delete", "go.get_id"]);
  });

  test("a name the ref-doc misspells is read as the name the engine registers", () => {
    expect(FUNCTION_NAME_CORRECTIONS.size).toBeGreaterThan(0);
    for (const [documented, { name }] of FUNCTION_NAME_CORRECTIONS) {
      const call = `${documented}(true)`;
      expect(droppedCalls({ lua: call, ts: `${name}(true);`, namespaces })).toEqual([]);
      expect(addedCalls({ lua: call, ts: `${name}(true);`, namespaces })).toEqual([]);
      expect(droppedCalls({ lua: call, ts: "", namespaces })).toEqual([name]);
    }
  });
});

describe("committed store", () => {
  const store = loadTranslations();
  const keeps = loadScopeKeeps();
  const fqn = "b2d.body.create_chain";
  const [entry] = store[fqn] ?? [];

  test("no translation drops an engine call its Lua makes", () => {
    expect(scopeDefects(store, index, keeps).dropped).toEqual([]);
  });

  test("every kept entry matches a live omission", () => {
    expect(scopeDefects(store, index, keeps).ghosts).toEqual([]);
  });

  test("a real translation that loses a call is named with the call", () => {
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const mutated = {
      ...store,
      [fqn]: [{ ...entry, ts: entry.ts.replace("b2d.body.create_chain(", "create_chain(") }],
    };
    expect(scopeDefects(mutated, index, keeps).dropped).toEqual([
      `${fqn}:${entry.sourceHash} drops b2d.body.create_chain`,
    ]);
  });

  test("a real translation that makes one of several calls to a function is named", () => {
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const mutated = {
      ...store,
      [fqn]: [{ ...entry, ts: entry.ts.replace("vmath.vector3(64, 0, 0)", "east") }],
    };
    expect(scopeDefects(mutated, index, keeps).dropped).toEqual([
      `${fqn}:${entry.sourceHash} drops vmath.vector3`,
    ]);
  });

  test("a kept entry outliving its omission is a ghost", () => {
    expect(entry).toBeDefined();
    if (entry === undefined) return;
    const stale = {
      ...keeps,
      [fqn]: [{ sourceHash: entry.sourceHash, calls: ["b2d.body.create_chain"], reason: "stale" }],
      "no.such_function": [{ sourceHash: "0000000000000000", calls: ["go.get"], reason: "stale" }],
    };
    expect(scopeDefects(store, index, stale).ghosts).toEqual([
      `${fqn}:${entry.sourceHash} keeps b2d.body.create_chain but drops nothing`,
      "no.such_function:0000000000000000 keeps go.get but matches no translated example",
    ]);
  });
});
