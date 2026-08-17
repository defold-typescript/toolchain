import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import type { SceneComponentIndex } from "./scene-component-index";
import { createTranspileSession } from "./session";
import { checkUrlFragmentReachability } from "./url-fragment-reachability";

// The committed classification table, exactly as `@defold-typescript/types`
// ships it — a table written into the test would prove nothing about the slots
// the project actually classifies.
const TABLE: UrlParameterTable = JSON.parse(
  readFileSync(join(import.meta.dir, "../../types/url-parameters.json"), "utf8"),
);

function programFor(source: string): ts.Program {
  const session = createTranspileSession();
  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) {
    throw new Error("session produced no program");
  }
  return program;
}

function universe(...ids: string[]): SceneComponentIndex {
  return { ids: new Set(ids), incomplete: [] };
}

function check(source: string, index: SceneComponentIndex) {
  return checkUrlFragmentReachability({ program: programFor(source), table: TABLE, index });
}

function findingsOf(source: string, index: SceneComponentIndex) {
  const report = check(source, index);
  if (report.kind !== "checked") {
    throw new Error(`expected a checked report, got ${report.kind}`);
  }
  return report.findings;
}

describe("checkUrlFragmentReachability", () => {
  test("reports a fragment no scene file declares, on the literal's span", () => {
    const source = 'msg.post("#unknown", "hello");\n';
    const findings = findingsOf(source, universe("sprite"));
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.fragment).toBe("unknown");
    expect(finding?.fileName).toBe("main.ts");
    expect(finding?.start).toBe(source.indexOf('"#unknown"'));
    expect(finding?.length).toBe('"#unknown"'.length);
    expect(finding?.message).toContain("unknown");
  });

  test("stays silent once the component exists", () => {
    expect(findingsOf('msg.post("#unknown", "hello");\n', universe("unknown"))).toEqual([]);
  });

  test("the table decides which slot addresses, not the parameter's type", () => {
    // `mesh_id` carries the same `string | Hash | Url` triple as an address slot
    // but names a mesh inside the model asset, so it is absent from the table.
    // The literal is deliberately fragment-shaped: the only thing keeping this
    // silent is the classification, not the absence of a `#`.
    const source = 'const url = msg.url();\nmodel.get_mesh_enabled(url, "#torso");\n';
    expect(findingsOf(source, universe("sprite"))).toEqual([]);
  });

  test("never reports an empty fragment, a path, or a literal without one", () => {
    for (const call of [
      'msg.post("#", "hello");',
      'msg.post(".", "hello");',
      'go.get("/enemy", "position");',
      'msg.post("hello", "hello");',
    ]) {
      expect(findingsOf(`${call}\n`, universe("sprite"))).toEqual([]);
    }
  });

  test("reaches both the hand-authored and the generated signature surface", () => {
    const handAuthored = findingsOf('go.get("#missing", "position");\n', universe("sprite"));
    expect(handAuthored.map((f) => f.fragment)).toEqual(["missing"]);

    const generated = findingsOf(
      'go.animate("#missing", "tint", go.PLAYBACK_ONCE_FORWARD, vmath.vector4(1), go.EASING_LINEAR, 1);\n',
      universe("sprite"),
    );
    expect(generated.map((f) => f.fragment)).toEqual(["missing"]);
  });

  test("fails closed when the signature does not resolve", () => {
    expect(findingsOf('notDeclared("#unknown");\n', universe("sprite"))).toEqual([]);
    expect(findingsOf('msg.url("/a", "#unknown");\n', universe("sprite"))).toEqual([]);
  });

  test("judges a backtick address literal exactly as its quoted twin", () => {
    const source = 'msg.post(`#unknown`, "hello");\n';
    const findings = findingsOf(source, universe("sprite"));
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.fragment).toBe("unknown");
    expect(finding?.fileName).toBe("main.ts");
    expect(finding?.start).toBe(source.indexOf("`#unknown`"));
    expect(finding?.length).toBe("`#unknown`".length);
  });

  test("the table still decides which slot addresses for a backtick literal", () => {
    const source = "const url = msg.url();\nmodel.get_mesh_enabled(url, `#torso`);\n";
    expect(findingsOf(source, universe("sprite"))).toEqual([]);
  });

  test("the fragment rules still apply to a backtick literal", () => {
    for (const call of [
      'msg.post(`#`, "hello");',
      'msg.post(`.`, "hello");',
      'go.get(`/enemy`, "position");',
      'msg.post(`hello`, "hello");',
    ]) {
      expect(findingsOf(`${call}\n`, universe("sprite"))).toEqual([]);
    }
    expect(findingsOf('msg.post(`#unknown`, "hello");\n', universe("unknown"))).toEqual([]);
  });

  test("never examines a substituted template", () => {
    const source = `const id = "x";\nmsg.post(\`#\${id}\`, "hello");\n`;
    expect(check(source, universe("sprite"))).toEqual({ kind: "checked", findings: [] });
  });

  test("a node-id slot is never an address, so its `#` is not a component fragment", () => {
    // `gui.get_node` is classified, but as a node id — a `#` inside it is part
    // of the node's name, and no `.go`/`.collection` could ever declare it.
    const source = 'gui.get_node("nope#missing");\nmsg.post("#missing", "hello");\n';
    expect(findingsOf(source, universe("sprite")).map((f) => f.start)).toEqual([
      source.indexOf('"#missing"'),
    ]);
  });

  test("an animation-id slot is never an address, so its `#` is not a component fragment", () => {
    // An animation id names a block inside an atlas, not a component: adding
    // `animation` to the address set would report one carrying a `#` as an
    // unreachable component while its own address slot stays unexamined.
    const source = 'sprite.play_flipbook("#sprite", "no#pe");\nmsg.post("#missing", "hello");\n';
    expect(findingsOf(source, universe("sprite")).map((f) => f.start)).toEqual([
      source.indexOf('"#missing"'),
    ]);
  });

  test("an action-id slot is never an address, so it is never reported", () => {
    // The class is suggestion-only: an action id is not a component, and no
    // `.go`/`.collection` could declare one. `checkUrlFragmentReachability` is
    // the only reporting consumer of `addressClassOfArgument`, so adding
    // `action-id` to the address set would surface here as a finding on a
    // hashed name that is not an address at all.
    const source =
      "export function on_input(_self: unknown, action_id: Hash | undefined) {\n" +
      '  if (action_id === hash("no#pe")) {}\n' +
      "}\n" +
      'msg.post("#missing", "hello");\n';
    expect(findingsOf(source, universe("sprite")).map((f) => f.start)).toEqual([
      source.indexOf('"#missing"'),
    ]);
  });

  test("an action id built at runtime is examined no more than a written one", () => {
    const source =
      "export function on_input(_self: unknown, action_id: Hash | undefined) {\n" +
      "  const n = 1;\n" +
      `  if (action_id === hash(\`item_\${n}\`)) {}\n` +
      "}\n";
    expect(check(source, universe("sprite"))).toEqual({ kind: "checked", findings: [] });
  });

  test("reads the hashed source out of a hoisted constant, at its use site", () => {
    const source = 'const SPRITE = hash("#sprit");\nmsg.post(SPRITE, "hello");\n';
    const findings = findingsOf(source, universe("sprite"));
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.fragment).toBe("sprit");
    expect(finding?.start).toBe(source.indexOf("SPRITE", source.indexOf("msg.post")));
    expect(finding?.length).toBe("SPRITE".length);
  });

  test("reports a hoisted constant once per use site", () => {
    const source =
      'const SPRITE = hash("#sprit");\nmsg.post(SPRITE, "hello");\nmsg.post(SPRITE, "again");\n';
    expect(findingsOf(source, universe("sprite")).map((f) => f.start)).toEqual([
      source.indexOf("SPRITE", source.indexOf("msg.post")),
      source.indexOf("SPRITE", source.lastIndexOf("msg.post")),
    ]);
  });

  test("stays silent once the hoisted constant names a component the project declares", () => {
    const source = 'const SPRITE = hash("#sprite");\nmsg.post(SPRITE, "hello");\n';
    expect(findingsOf(source, universe("sprite"))).toEqual([]);
  });

  test("a hashed path carries no fragment, so it is no more decidable than a written one", () => {
    const source = 'const ENEMY = hash("/enemy");\nmsg.post(ENEMY, "hello");\n';
    expect(findingsOf(source, universe("sprite"))).toEqual([]);
  });

  test("never reports a value whose source string is not statically known", () => {
    for (const [declaration, argument] of [
      ['const raw: string = "#sprit";\nconst ID = hash(raw);', "ID"],
      ['const raw: string = "#sprit";', "raw"],
      ['const raw: string = "#sprit";\nconst URL = msg.url(raw);', "URL"],
      ['const ID = factory.create("#sprite");', "ID"],
    ] as const) {
      const source = `${declaration}\nmsg.post(${argument}, "hello");\n`;
      expect(findingsOf(source, universe("sprite"))).toEqual([]);
    }
  });

  test("a hoisted hash in a slot the table does not classify as an address is not reported", () => {
    // An animation id names a block inside an atlas; its `#` is part of that
    // name, so the same hoisting that makes an address readable must not turn a
    // non-address slot into a finding.
    const source = 'const ANIM = hash("no#pe");\nsprite.play_flipbook("#sprite", ANIM);\n';
    expect(findingsOf(source, universe("sprite"))).toEqual([]);
  });

  test("withholds every finding while the universe has gaps", () => {
    const reasons = ["main.collection: could not be parsed (line 3)"];
    const report = check('msg.post("#unknown", "hello");\n', {
      ids: new Set(["sprite"]),
      incomplete: reasons,
    });
    expect(report).toEqual({ kind: "suppressed", reasons });
  });
});
