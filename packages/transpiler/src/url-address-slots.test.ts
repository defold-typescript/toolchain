import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  UrlParameterClass,
  UrlParameterEntry,
  UrlParameterTable,
} from "@defold-typescript/types";
import type * as ts from "typescript";
import { createTranspileSession } from "./session";
import {
  isAddressClass,
  isFragmentCaret,
  resolveClassifiedSlotAtPosition,
} from "./url-address-slots";

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

function slotAt(source: string, position: number) {
  return resolveClassifiedSlotAtPosition({
    program: programFor(source),
    table: TABLE,
    fileName: "main.ts",
    position,
  });
}

// The offset just inside the opening quote of `literal` as it appears in
// `source` — the cursor position an editor reports for a caret at the start of
// the literal's text.
function insideOf(source: string, literal: string): number {
  const start = source.indexOf(literal);
  if (start === -1) {
    throw new Error(`${literal} is not in the source`);
  }
  return start + 1;
}

// The plain-function form of the hook, whose `action_id` is the parameter an
// action-id slot must be compared against.
function ON_INPUT(body: string): string {
  return [
    "export function on_input(_self: unknown, action_id: Hash | undefined) {",
    `  ${body}`,
    "}",
    "",
  ].join("\n");
}

// One real call per class, resolved through the production session and the
// committed table. The expected side is the table's own class column, so a
// class it carries with no positive here reds instead of passing quietly —
// which is what let `game-object`, 21 of its 40 entries, go unexercised.
const CLASS_POSITIVES: ReadonlyArray<{
  source: string;
  literal: string;
  class: UrlParameterClass;
}> = [
  { source: 'go.get_position("/player");\n', literal: '"/player"', class: "game-object" },
  { source: 'msg.post("#sprite", "hello");\n', literal: '"#sprite"', class: "either" },
  { source: 'gui.get_node("score");\n', literal: '"score"', class: "gui-node" },
  { source: 'sprite.play_flipbook("#sprite", "wa");\n', literal: '"wa"', class: "animation" },
  {
    source: 'go.property("my_atlas", resource.atlas(""));\n',
    literal: '""',
    class: "resource-path",
  },
  { source: 'const width = sys.get_config_int("", 960);\n', literal: '""', class: "config-key" },
  { source: ON_INPUT('if (action_id === hash("")) {}'), literal: '""', class: "action-id" },
];

describe("resolveClassifiedSlotAtPosition", () => {
  test("resolves an address slot, reporting the span strictly inside the quotes", () => {
    const source = 'msg.post("#sprite", "hello");\n';
    const slot = slotAt(source, insideOf(source, '"#sprite"'));
    expect(slot?.class).not.toBe("none");
    expect(slot?.text).toBe("#sprite");
    expect(slot?.textStart).toBe(source.indexOf("#sprite"));
    expect(slot?.fragmentStart).toBe(source.indexOf("#sprite") + 1);
  });

  test("the table decides which slot addresses, not the parameter's type", () => {
    // `mesh_id` carries the same `string | Hash | Url` triple as an address slot
    // but names a mesh inside the model asset, so it is absent from the table.
    const source = 'const url = msg.url();\nmodel.get_mesh_enabled(url, "#torso");\n';
    expect(slotAt(source, insideOf(source, '"#torso"'))).toBeUndefined();
  });

  test("a quote and anything beyond the literal is not a slot position", () => {
    const source = 'msg.post("#sprite", "hello");\n';
    const start = source.indexOf('"#sprite"');
    expect(slotAt(source, start)).toBeUndefined();
    expect(slotAt(source, start + '"#sprite"'.length)).toBeUndefined();
    expect(slotAt(source, 0)).toBeUndefined();
  });

  test("the end of the inside-quotes text resolves — that is the append position", () => {
    const source = 'msg.post("#", "hello");\n';
    const slot = slotAt(source, source.indexOf('"#"') + 2);
    expect(slot?.text).toBe("#");
    expect(slot?.fragmentStart).toBe(source.indexOf('"#"') + 2);
  });

  test("an address slot with no `#` resolves with `fragmentStart` -1", () => {
    const source = 'go.get("/enemy", "position");\n';
    const slot = slotAt(source, insideOf(source, '"/enemy"'));
    expect(slot?.class).not.toBe("none");
    expect(slot?.text).toBe("/enemy");
    expect(slot?.fragmentStart).toBe(-1);
  });

  test("a backtick literal resolves exactly as its quoted twin", () => {
    const quoted = 'msg.post("#sprite", "hello");\n';
    const backtick = 'msg.post(`#sprite`, "hello");\n';
    expect(slotAt(backtick, insideOf(backtick, "`#sprite`"))).toEqual(
      // biome-ignore lint/style/noNonNullAssertion: the quoted twin resolves or the first test already failed
      slotAt(quoted, insideOf(quoted, '"#sprite"'))!,
    );
  });

  test("a substituted template is never a slot — its text is not statically known", () => {
    const source = `const id = "x";\nmsg.post(\`#\${id}\`, "hello");\n`;
    expect(slotAt(source, source.indexOf("`") + 1)).toBeUndefined();
  });

  test("a literal carrying an escape is refused — cooked offsets would lie", () => {
    const source = 'msg.post("a\\tb", "hello");\n';
    expect(slotAt(source, insideOf(source, '"a\\tb"'))).toBeUndefined();
  });

  test("an unresolvable call is not a slot", () => {
    const source = '(undefined as any)("#x");\n';
    expect(slotAt(source, insideOf(source, '"#x"'))).toBeUndefined();
  });

  test("a game-object slot resolves as its own class, and its class is an address", () => {
    const source = 'go.get_position("/player");\n';
    const slot = slotAt(source, insideOf(source, '"/player"'));
    expect(slot?.class).toBe("game-object");
    expect(slot?.text).toBe("/player");
    expect(slot?.textStart).toBe(source.indexOf("/player"));
    expect(slot?.fragmentStart).toBe(-1);
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(true);
  });

  test("a node-id slot resolves as its own class, not as an address", () => {
    const source = 'gui.get_node("score");\n';
    const slot = slotAt(source, insideOf(source, '"score"'));
    expect(slot?.class).toBe("gui-node");
    expect(slot?.text).toBe("score");
    expect(slot?.textStart).toBe(source.indexOf("score"));
    expect(slot?.fragmentStart).toBe(-1);
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(false);
  });

  test("an animation slot resolves with the component its sibling literal addresses", () => {
    const source = 'sprite.play_flipbook("#sprite", "wa");\n';
    const slot = slotAt(source, insideOf(source, '"wa"'));
    expect(slot?.class).toBe("animation");
    expect(slot?.text).toBe("wa");
    expect(slot?.textStart).toBe(source.indexOf("wa"));
    expect(slot?.fragmentStart).toBe(-1);
    expect(slot?.addressText).toBe("#sprite");
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(false);
  });

  test("the animation slot's own address parameter stays unclassified", () => {
    const source = 'sprite.play_flipbook("#sprite", "wa");\n';
    expect(slotAt(source, insideOf(source, '"#sprite"'))).toBeUndefined();
  });

  test("only a string literal is read as the address — every other form leaves it unknown", () => {
    for (const call of [
      'const url = msg.url("#sprite");\nsprite.play_flipbook(url, "wa");',
      `const id = "sprite";\nsprite.play_flipbook(\`#\${id}\`, "wa");`,
      'sprite.play_flipbook(msg.url("#sprite"), "wa");',
    ]) {
      const source = `${call}\n`;
      const slot = slotAt(source, insideOf(source, '"wa"'));
      expect(slot?.class).toBe("animation");
      expect(slot?.addressText).toBeUndefined();
    }
  });

  test("a resource-path slot resolves with the extensions its entry declares", () => {
    const source = 'go.property("my_atlas", resource.atlas(""));\n';
    const slot = slotAt(source, insideOf(source, '""'));
    expect(slot?.class).toBe("resource-path");
    expect(slot?.text).toBe("");
    expect(slot?.fragmentStart).toBe(-1);
    expect(slot?.resourceExtensions).toEqual([".atlas"]);
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(false);
  });

  test("the extensions track the entry, not one hardcoded value", () => {
    const source = 'go.property("my_font", resource.font("/ui/main.font"));\n';
    const slot = slotAt(source, insideOf(source, '"/ui/main.font"'));
    expect(slot?.class).toBe("resource-path");
    expect(slot?.resourceExtensions).toEqual([".font"]);
  });

  test("a slot whose entry declares no extensions carries none", () => {
    const source = 'msg.post("#sprite", "hello");\n';
    const slot = slotAt(source, insideOf(source, '"#sprite"'));
    expect(slot?.class).not.toBe("none");
    expect(slot?.resourceExtensions).toBeUndefined();
    // The second argument is an unclassified `string`, so nothing resolves there.
    expect(slotAt(source, insideOf(source, '"hello"'))).toBeUndefined();
  });

  test("the address is read by parameter name, not by argument position", () => {
    // The committed table cannot prove this: its one companion is the parameter
    // at index 0, so a fixed `arguments[0]` reading would satisfy every case
    // above. Here the companion is the *second* parameter, and the caret sits in
    // the first.
    const source = 'sprite.play_flipbook("#sprite", "walk");\n';
    const slot = resolveClassifiedSlotAtPosition({
      program: programFor(source),
      table: [
        {
          fqn: "sprite.play_flipbook",
          parameter: "url",
          class: "animation",
          source: "generated",
          addressParameter: "id",
        },
      ],
      fileName: "main.ts",
      position: insideOf(source, '"#sprite"'),
    });
    expect(slot?.text).toBe("#sprite");
    expect(slot?.addressText).toBe("walk");
  });

  test("a config-key slot resolves whole-literal, and the default value does not", () => {
    const source = 'const width = sys.get_config_int("", 960);\n';
    const slot = slotAt(source, insideOf(source, '""'));
    expect(slot?.class).toBe("config-key");
    expect(slot?.text).toBe("");
    expect(slot?.fragmentStart).toBe(-1);
    expect(slot?.resourceExtensions).toBeUndefined();
    expect(slot?.addressText).toBeUndefined();
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(false);

    const stringSource = 'const title = sys.get_config_string("project.title", "fallback");\n';
    expect(slotAt(stringSource, insideOf(stringSource, '"project.title"'))?.class).toBe(
      "config-key",
    );
    // The `default_value` argument is an unclassified `string`, so a caret there
    // resolves nothing rather than offering keys.
    expect(slotAt(stringSource, insideOf(stringSource, '"fallback"'))).toBeUndefined();
  });

  test("an action-id slot resolves whole-literal inside a compared `hash`", () => {
    const source = ON_INPUT('if (action_id === hash("")) {}');
    const slot = slotAt(source, insideOf(source, '""'));
    expect(slot?.class).toBe("action-id");
    expect(slot?.text).toBe("");
    expect(slot?.fragmentStart).toBe(-1);
    expect(slot?.addressText).toBeUndefined();
    expect(slot?.resourceExtensions).toBeUndefined();
    // biome-ignore lint/style/noNonNullAssertion: the assertions above already failed if it did not resolve
    expect(isAddressClass(slot!.class)).toBe(false);
  });

  test("either operand order and either equality operator scopes the slot", () => {
    for (const comparison of [
      'action_id === hash("")',
      'hash("") === action_id',
      'action_id !== hash("")',
      'hash("") != action_id',
      'action_id == hash("")',
    ]) {
      const source = ON_INPUT(`if (${comparison}) {}`);
      expect(slotAt(source, insideOf(source, '""'))?.class).toBe("action-id");
    }
  });

  test("the `defineScript` method form scopes the slot too", () => {
    // The hook is written as an object method there, whose `action_id` is a
    // `ParameterDeclaration` exactly as a plain function's is.
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "export default defineScript({",
      "  on_input(_self, action_id) {",
      '    if (action_id === hash("")) {}',
      "    return false;",
      "  },",
      "});",
      "",
    ].join("\n");
    expect(slotAt(source, insideOf(source, '""'))?.class).toBe("action-id");
  });

  test("a `hash` carrying no comparison against an action id resolves nothing", () => {
    // The hoisted-constant form is the common one, and it has nothing to scope
    // by: offering every action there would suggest ids in component, message
    // and property names alike.
    const hoisted = 'const JUMP = hash("");\n';
    expect(slotAt(hoisted, insideOf(hoisted, '""'))).toBeUndefined();

    const argument = 'sprite.play_flipbook(hash(""), "");\n';
    expect(slotAt(argument, insideOf(argument, '""'))).toBeUndefined();

    for (const comparison of ['action_id > hash("")', 'action_id ? hash("") : action_id']) {
      const source = ON_INPUT(`if (${comparison}) {}`);
      expect(slotAt(source, insideOf(source, '""'))).toBeUndefined();
    }
  });

  test("the compared operand must resolve to a parameter of that name, not merely read as one", () => {
    // A local of the same name is the case identifier text alone cannot tell
    // apart, and it is not an action id — nothing in it came from `on_input`.
    const local = [
      "export function handle() {",
      '  const action_id = hash("other");',
      '  if (action_id === hash("")) {}',
      "}",
      "",
    ].join("\n");
    expect(slotAt(local, insideOf(local, '""'))).toBeUndefined();

    const renamed = [
      "export function on_input(_self: unknown, message_id: Hash | undefined) {",
      '  if (message_id === hash("")) {}',
      "}",
      "",
    ].join("\n");
    expect(slotAt(renamed, insideOf(renamed, '""'))).toBeUndefined();
  });

  test("a `hash` the project declares itself shadows the global and offers nothing", () => {
    // The entry describes Defold's ambient `hash`. A project's own function of
    // that name takes an `s` too, so the table would match it on name alone.
    const declared = [
      "function hash(s: string) {",
      "  return s;",
      "}",
      "export function on_input(_self: unknown, action_id: Hash | undefined) {",
      '  if (action_id === hash("")) {}',
      "}",
      "",
    ].join("\n");
    expect(slotAt(declared, insideOf(declared, '""'))).toBeUndefined();

    const local = [
      "export function on_input(_self: unknown, action_id: Hash | undefined) {",
      "  const hash = (s: string) => s;",
      '  if (action_id === hash("")) {}',
      "}",
      "",
    ].join("\n");
    expect(slotAt(local, insideOf(local, '""'))).toBeUndefined();
  });

  test("a shadowed property-access callee is not a slot either", () => {
    // The same fallback that keyed a bare shadow keys `gui.get_node` on a local
    // object of that name, so the predicate has to close both shapes at once.
    const gui = [
      "const gui = {",
      "  get_node(id: string) {",
      "    return id;",
      "  },",
      "};",
      'gui.get_node("score");',
      "",
    ].join("\n");
    expect(slotAt(gui, insideOf(gui, '"score"'))).toBeUndefined();

    const msg = [
      "const msg = {",
      "  post(receiver: string, message_id: string) {",
      "    return receiver + message_id;",
      "  },",
      "};",
      'msg.post("#sprite", "hello");',
      "",
    ].join("\n");
    expect(slotAt(msg, insideOf(msg, '"#sprite"'))).toBeUndefined();
  });

  test("a caret inside `hash(…)` classifies as the slot the enclosing call occupies", () => {
    // Two shapes that differ in how the entry is reached: `msg.post`'s receiver
    // is classified on its own, while the animation slot has to find its
    // companion on the outer call — so this is the case that proves the ascent
    // handed the right call down and not merely the right entry.
    const receiver = 'msg.post(hash("#sprite"), "hello");\n';
    expect(slotAt(receiver, insideOf(receiver, '"#sprite"'))?.class).toBe("either");

    const animation = 'sprite.play_flipbook("#sprite", hash("wa"));\n';
    const slot = slotAt(animation, insideOf(animation, '"wa"'));
    expect(slot?.class).toBe("animation");
    expect(slot?.text).toBe("wa");
    expect(slot?.addressText).toBe("#sprite");
  });

  test("a wrapped caret reports the inner literal's span, not the `hash` call's", () => {
    const source = 'msg.post(hash("#sprite"), "hello");\n';
    const slot = slotAt(source, insideOf(source, '"#sprite"'));
    expect(slot?.textStart).toBe(source.indexOf("#sprite"));
    // biome-ignore lint/style/noNonNullAssertion: the assertion above already failed if it did not resolve
    expect(source.slice(slot!.textStart, slot!.textStart + slot!.text.length)).toBe("#sprite");
    // biome-ignore lint/style/noNonNullAssertion: as above
    expect(source.slice(slot!.fragmentStart, slot!.textStart + slot!.text.length)).toBe("sprite");
  });

  test("the ascent fires only through the ambient `hash`, one level, into a classified slot", () => {
    // A `hash` in no call at all, and one whose enclosing call the table does
    // not classify: neither has an outer slot to ascend to.
    const bare = 'const id = hash("#sprite");\n';
    expect(slotAt(bare, insideOf(bare, '"#sprite"'))).toBeUndefined();

    const unclassified = 'print(hash("#sprite"));\n';
    expect(slotAt(unclassified, insideOf(unclassified, '"#sprite"'))).toBeUndefined();

    // The project's own `hash` is prefixless, so it is not the global the entry
    // describes — the ascent has to apply the same canonicity test the
    // action-id path does.
    const declared = [
      "function hash(s: string): Hash {",
      "  return s as unknown as Hash;",
      "}",
      'msg.post(hash("#sprite"), "hello");',
      "",
    ].join("\n");
    expect(slotAt(declared, insideOf(declared, '"#sprite"'))).toBeUndefined();

    // The ascent does not recurse: it would have to walk past the inner `hash`
    // to `msg.post` to report `either` here. This says nothing about landing on
    // the `hash` entry itself, because the outer `hash` sits in no comparison.
    const nested = 'msg.post(hash(hash("#sprite")), "hello");\n';
    expect(slotAt(nested, insideOf(nested, '"#sprite"'))).toBeUndefined();

    // The stop itself: the compared outer `hash` *is* an operand of the
    // action-id comparison, so one ascent from the inner literal lands on the
    // `hash` entry and satisfies it. Nothing is being named here — the doubled
    // wrapper hashes a hash — so the ascent has to reject that entry.
    const doubled = ON_INPUT('if (action_id === hash(hash(""))) {}');
    expect(slotAt(doubled, insideOf(doubled, '""'))).toBeUndefined();

    // The paired positive, so a guard broad enough to reject the single wrapper
    // reds here rather than only in a distant test.
    const compared = ON_INPUT('if (action_id === hash("")) {}');
    expect(slotAt(compared, insideOf(compared, '""'))?.class).toBe("action-id");
  });

  test("every class the committed table carries has a call here that resolves it", () => {
    const covered = new Set<UrlParameterClass>();
    for (const positive of CLASS_POSITIVES) {
      expect(slotAt(positive.source, insideOf(positive.source, positive.literal))?.class).toBe(
        positive.class,
      );
      covered.add(positive.class);
    }
    expect([...covered].sort()).toEqual([...new Set(TABLE.map((entry) => entry.class))].sort());
  });
});

// The slot geometry the predicate reads comes from the production resolver over
// the committed table, so an offset written here is the offset an editor would
// really report.
function addressSlotAt(source: string, literal: string) {
  const slot = slotAt(source, insideOf(source, literal));
  if (!slot) {
    throw new Error(`${literal} did not resolve to a classified slot`);
  }
  return slot;
}

describe("isFragmentCaret", () => {
  test("the half flips at `fragmentStart` itself, where an empty fragment is typed", () => {
    const slot = addressSlotAt('msg.post("/enemy#sprite", "hello");\n', '"/enemy#sprite"');
    expect(isFragmentCaret(slot, slot.textStart)).toBe(false);
    expect(isFragmentCaret(slot, slot.fragmentStart - 1)).toBe(false);
    expect(isFragmentCaret(slot, slot.fragmentStart)).toBe(true);
    expect(isFragmentCaret(slot, slot.textStart + slot.text.length)).toBe(true);
  });

  test("a literal carrying no `#` is path for every caret inside it", () => {
    const slot = addressSlotAt('go.get_position("/player");\n', '"/player"');
    expect(slot.fragmentStart).toBe(-1);
    for (let position = slot.textStart; position <= slot.textStart + slot.text.length; position++) {
      expect(isFragmentCaret(slot, position)).toBe(false);
    }
  });
});

describe("isAddressClass", () => {
  test("only the three address classes are addresses", () => {
    expect(isAddressClass("game-object")).toBe(true);
    expect(isAddressClass("component")).toBe(true);
    expect(isAddressClass("either")).toBe(true);
    expect(isAddressClass("gui-node")).toBe(false);
    expect(isAddressClass("animation")).toBe(false);
    expect(isAddressClass("resource-path")).toBe(false);
    expect(isAddressClass("config-key")).toBe(false);
    expect(isAddressClass("action-id")).toBe(false);
    expect(isAddressClass("none")).toBe(false);
  });
});

interface ParameterShape {
  readonly name: string;
  readonly rest: boolean;
  readonly optional: boolean;
}

function parametersOf(signature: ts.Signature): ParameterShape[] {
  return signature.parameters.map((symbol) => {
    const declaration = symbol.valueDeclaration as ts.ParameterDeclaration | undefined;
    return {
      name: symbol.name,
      rest: declaration?.dotDotDotToken !== undefined,
      optional: declaration?.questionToken !== undefined || declaration?.initializer !== undefined,
    };
  });
}

function requiredCount(parameters: readonly ParameterShape[]): number {
  const firstOptional = parameters.findIndex((parameter) => parameter.rest || parameter.optional);
  return firstOptional === -1 ? parameters.length : firstOptional;
}

function nonRestIndexOf(parameters: readonly ParameterShape[], name: string): number {
  return parameters.findIndex((parameter) => !parameter.rest && parameter.name === name);
}

interface CallPlan {
  readonly index: number;
  readonly arity: number;
  readonly companionIndex?: number;
}

// The shortest call that reaches the entry's slot (and its companion), read off
// the callee's signatures in declaration order — the order overload resolution
// tries them. Taking the minimum over every signature long enough, not only the
// ones naming the slot, is what makes a shorter overload that names it
// differently red instead of being stepped over for a longer one.
function planCall(
  entry: UrlParameterEntry,
  signatures: readonly ts.Signature[],
): CallPlan | string {
  const shapes = signatures.map(parametersOf);
  const declaring = shapes.find((parameters) => nonRestIndexOf(parameters, entry.parameter) !== -1);
  if (!declaring) return `no signature declares parameter ${entry.parameter}`;
  const index = nonRestIndexOf(declaring, entry.parameter);
  let companionIndex: number | undefined;
  if (entry.addressParameter !== undefined) {
    companionIndex = nonRestIndexOf(declaring, entry.addressParameter);
    if (companionIndex === -1) {
      return `the signature declaring ${entry.parameter} declares no companion ${entry.addressParameter}`;
    }
  }
  const reach = Math.max(index, companionIndex ?? -1);
  let arity = Number.POSITIVE_INFINITY;
  for (const parameters of shapes) {
    if (parameters.filter((parameter) => !parameter.rest).length <= reach) continue;
    arity = Math.min(arity, Math.max(reach + 1, requiredCount(parameters)));
  }
  return companionIndex === undefined ? { index, arity } : { index, arity, companionIndex };
}

interface EntryCall {
  readonly entry: UrlParameterEntry;
  readonly text: string;
  readonly textStart: number;
  readonly addressText?: string;
}

interface GeneratedEntryCalls {
  readonly program: ts.Program;
  readonly calls: readonly EntryCall[];
  readonly failures: readonly string[];
}

function labelOf(entry: UrlParameterEntry): string {
  return `${entry.fqn}#${entry.parameter}`;
}

let generatedEntryCalls: GeneratedEntryCalls | undefined;

// One call per committed table entry, built from the table and the declarations
// the resolver reads. A probe pass reads each callee's signatures; a second pass
// writes every call into one `main.ts`, with `never` in each position the slot
// does not need, so no overload is ruled out and TypeScript picks the first
// applicable one as it would for a user's call.
function generateEntryCalls(): GeneratedEntryCalls {
  if (generatedEntryCalls) return generatedEntryCalls;
  const session = createTranspileSession();
  const failures: string[] = [];

  const fqns = [...new Set(TABLE.map((entry) => entry.fqn))];
  session.update({ "main.ts": fqns.map((fqn) => `${fqn};\n`).join("") });
  const probe = session.getProgram();
  const probeFile = probe?.getSourceFile("main.ts");
  if (!probe || !probeFile) throw new Error("the probe pass produced no program");
  const checker = probe.getTypeChecker();
  const signaturesOf = new Map<string, readonly ts.Signature[]>();
  fqns.forEach((fqn, i) => {
    const expression = (probeFile.statements[i] as ts.ExpressionStatement | undefined)?.expression;
    signaturesOf.set(
      fqn,
      expression ? checker.getTypeAtLocation(expression).getCallSignatures() : [],
    );
  });

  let source = "declare const ARG: never;\n";
  const calls: EntryCall[] = [];
  TABLE.forEach((entry, k) => {
    const plan = planCall(entry, signaturesOf.get(entry.fqn) ?? []);
    if (typeof plan === "string") {
      failures.push(`${labelOf(entry)}: ${plan}`);
      return;
    }
    const text = `e${k}`;
    const addressText = plan.companionIndex === undefined ? undefined : `#c${k}`;
    let call = `${entry.fqn}(`;
    let literalOffset = -1;
    for (let i = 0; i < plan.arity; i++) {
      if (i > 0) call += ", ";
      if (i === plan.index) {
        literalOffset = call.length + 1;
        call += `"${text}"`;
      } else if (i === plan.companionIndex) {
        call += `"${addressText}"`;
      } else {
        call += "ARG";
      }
    }
    call += ")";
    const compared = entry.comparedParameter;
    const head =
      compared === undefined
        ? ""
        : `export function probe${k}(${compared}: unknown) {\n  if (${compared} === `;
    const tail = compared === undefined ? ";\n" : ") {}\n}\n";
    calls.push({
      entry,
      text,
      textStart: source.length + head.length + literalOffset,
      ...(addressText === undefined ? {} : { addressText }),
    });
    source += `${head}${call}${tail}`;
  });

  session.update({ "main.ts": source });
  const program = session.getProgram();
  if (!program) throw new Error("the calls pass produced no program");
  generatedEntryCalls = { program, calls, failures };
  return generatedEntryCalls;
}

function diagnosticLine(diagnostic: ts.Diagnostic): string {
  const message =
    typeof diagnostic.messageText === "string"
      ? diagnostic.messageText
      : diagnostic.messageText.messageText;
  return `${diagnostic.start ?? -1}: ${message}`;
}

// Every entry is reached by the shortest call that reaches its slot, with
// `never` filler in the other positions. That is a limit, not a proof for every
// call: a longer call with concrete argument types can still select another
// overload. Whether the table holds the right entries is the drift test's
// question (`packages/types/test/url-parameter-drift.test.ts`), not this one's.
describe("every committed table entry", () => {
  test("resolves at its generated literal as its own class", () => {
    const { program, calls, failures } = generateEntryCalls();
    const mismatches = [...failures];
    for (const call of calls) {
      const resolveAgainst = (table: UrlParameterTable) =>
        resolveClassifiedSlotAtPosition({
          program,
          table,
          fileName: "main.ts",
          position: call.textStart,
        });
      const slot = resolveAgainst(TABLE);
      const label = labelOf(call.entry);
      if (!slot) {
        mismatches.push(`${label}: resolved nothing`);
        continue;
      }
      // Class alone cannot tell `go.set_parent#parent_id` from its `id`
      // sibling: both are `game-object`. A table holding only this entry
      // resolves only if the slot is keyed to this entry's own parameter.
      if (!resolveAgainst([call.entry])) {
        mismatches.push(`${label}: resolved through another entry`);
      }
      if (slot.class !== call.entry.class) {
        mismatches.push(`${label}: class ${slot.class}, expected ${call.entry.class}`);
      }
      if (slot.text !== call.text) {
        mismatches.push(`${label}: text ${slot.text}, expected ${call.text}`);
      }
      if (slot.textStart !== call.textStart) {
        mismatches.push(`${label}: textStart ${slot.textStart}, expected ${call.textStart}`);
      }
      if (call.addressText !== undefined && slot.addressText !== call.addressText) {
        mismatches.push(`${label}: addressText ${slot.addressText}, expected ${call.addressText}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 30_000);

  test("the generated calls compile cleanly, so each lands on a well-typed overload", () => {
    const { program } = generateEntryCalls();
    const sourceFile = program.getSourceFile("main.ts");
    expect(sourceFile).toBeDefined();
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ].map(diagnosticLine);
    expect(diagnostics).toEqual([]);
  }, 30_000);
});
