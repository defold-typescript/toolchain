import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transpileProject } from "@defold-typescript/transpiler";
import ts from "typescript";
import { surfaceProgram } from "../../types/scripts/lua-kind";
import { overlayProgram } from "./call-check";
import { BOX2D_BACKENDS } from "./contexts";
import { outcomeKey, readExemptions } from "./exemptions";
import { describeDiagnostic } from "./negative-witness";
import { PROBE_DENYLIST } from "./probe-denylist";
import { memberCalls } from "./widening";
import {
  generateProbes,
  PROBE_FILES,
  type ProbeCall,
  type ProbeGeneration,
  probeTarget,
} from "./witness";

const RUNTIME = resolve(import.meta.dir, "..", "project", "probe", "runtime.ts");
const OPTION_FIXTURE = resolve(import.meta.dir, "option-form-fixture.d.ts");
const program = surfaceProgram(probeTarget());
const members = memberCalls(program);
const generations: ProbeGeneration[] = BOX2D_BACKENDS.map((backend) =>
  generateProbes(undefined, backend, program, members),
);
const [v2] = generations as [ProbeGeneration, ProbeGeneration];
const MEMBER = "member ";

// Every `probe(<name>, ...)` call in the generated files: its variant and the
// source text of each argument.
function probeStatements(
  files: Readonly<Record<string, string>>,
  name: string,
): { variant: string; args: (ts.Expression | undefined)[] }[] {
  return Object.values(files).flatMap((source) => {
    const file = ts.createSourceFile("probe.ts", source, ts.ScriptTarget.Latest, true);
    const found: { variant: string; args: (ts.Expression | undefined)[] }[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "probe" &&
        node.arguments[0]?.getText(file) === JSON.stringify(name)
      ) {
        found.push({
          variant: JSON.parse(node.arguments[1]?.getText(file) ?? "null"),
          args: [...node.arguments],
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
  });
}

// The `{ position, field, arms }` entries of a generated discriminant list, as
// source text.
function discriminantEntries(
  list: ts.Expression | undefined,
): { position: string | undefined; field: string | undefined; arms: string[] }[] {
  if (list === undefined || !ts.isArrayLiteralExpression(list)) return [];
  return list.elements.map((element) => {
    if (!ts.isObjectLiteralExpression(element))
      return { position: undefined, field: undefined, arms: [] };
    const text = (key: string) => {
      const property = element.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === key,
      );
      return property?.initializer;
    };
    const arms = text("arms");
    return {
      position: text("position")?.getText(),
      field: text("field")?.getText(),
      arms:
        arms !== undefined && ts.isArrayLiteralExpression(arms)
          ? arms.elements.map((e) => e.getText())
          : [],
    };
  });
}

describe("witness generation", () => {
  test("sprite.play_flipbook gets a required-slot call and a full call per arm", () => {
    const calls = v2.calls.filter(
      (call) => call.name === "sprite.play_flipbook" && call.witness === undefined,
    );
    expect(calls.map((call) => [call.variant, call.call])).toEqual([
      ["overload1-required", 'sprite.play_flipbook(SPRITE, hash("anim"))'],
      ["overload1-optional", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {})'],
      ["overload2-required", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {}, {})'],
      ["options-omitted", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {})'],
      ["options-empty", 'sprite.play_flipbook(SPRITE, hash("anim"), () => {}, {})'],
    ]);
    const go = v2.files[PROBE_FILES.go] ?? "";
    expect(go).toContain('const SPRITE = msg.url("main:/probe#sprite");');
    expect(go).toContain(
      'probe("sprite.play_flipbook", "overload1-required", () => sprite.play_flipbook(SPRITE, hash("anim")));',
    );
  });

  test("a union keyed on branded constants passes each arm's constant to the runtime in arm order", () => {
    const shape = (kind: string) => `b2d.shape.SHAPE_TYPE_${kind}`;
    const cases = [
      {
        generation: v2,
        name: "b2d.fixture.get_shape",
        arms: {
          "type,vertices": shape("POLYGON"),
          "center,radius,type": shape("CIRCLE"),
          "type,v0,v1,v2,v3": shape("EDGE"),
          "loop,next_vertex,prev_vertex,type,vertices": shape("CHAIN"),
        },
      },
      {
        generation: generations[1],
        name: "b2d.shape.get_shape",
        arms: {
          "type,vertices": shape("POLYGON"),
          "center,radius,type": shape("CIRCLE"),
          "center1,center2,radius,type": shape("CAPSULE"),
          "type,v0,v1,v2,v3": shape("SEGMENT"),
        },
      },
    ];
    for (const { generation, name, arms } of cases) {
      const calls = (generation?.calls ?? []).filter(
        (call) => call.name === name && call.returns !== undefined,
      );
      const variants = calls.map((call) => call.variant).sort();
      const statements = probeStatements(generation?.files ?? {}, name).filter(({ variant }) =>
        variants.includes(variant),
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(statements.map(({ variant }) => variant).sort()).toEqual(variants);
      for (const { variant, args } of statements) {
        const declared = calls.find((call) => call.variant === variant)?.returns?.shapes?.[0];
        if (declared === undefined || !("arms" in declared)) {
          throw new Error(`${name} ${variant} declares no union`);
        }
        const [entry, ...others] = discriminantEntries(args[3]);
        expect(others).toEqual([]);
        expect([entry?.position, entry?.field]).toEqual(["1", '"type"']);
        const paired = declared.arms.map((arm, i) => [
          Object.keys(arm.fields).sort().join(","),
          entry?.arms[i],
        ]);
        expect(Object.fromEntries(paired)).toEqual(arms);
        expect(entry?.arms.length).toBe(declared.arms.length);
      }
    }
  });

  test("render state toggles keep a positive call and never pass the alpha-test state Metal rejects", () => {
    const toggles = ["render.enable_state", "render.disable_state"];
    for (const name of toggles) {
      const positive = v2.calls.filter((call) => call.name === name && call.witness === undefined);
      expect(positive.map((call) => call.kind)).toContain("render");
    }
    const alphaTest = generations.flatMap((generation) =>
      generation.calls
        .filter(
          (call) => toggles.includes(call.name) && call.call.includes("graphics.STATE_ALPHA_TEST"),
        )
        .map((call) => `${generation.backend} ${call.variant}: ${call.call}`),
    );
    expect(alphaTest).toEqual([]);
  });

  test(
    "every generated file type-checks and transpiles with zero diagnostics",
    () => {
      for (const generation of generations) {
        const files: Record<string, string> = { "probe/runtime.ts": readFileSync(RUNTIME, "utf8") };
        for (const [file, source] of Object.entries(generation.files))
          files[`main/${file}`] = source;
        const result = transpileProject({ files });
        const errors = result.diagnostics
          .filter((d) => d.category !== "warning")
          .map((d) => {
            const source = files[d.file ?? ""] ?? "";
            return `${generation.backend} ${describeDiagnostic(source, generation.calls, d)}`;
          });
        expect(errors).toEqual([]);
      }
    },
    { timeout: 120_000 },
  );

  test("every declared function is probed from exactly one script or denied", () => {
    const declared = new Set(generations.flatMap((generation) => generation.functions));
    const kinds = new Map<string, Set<string>>();
    for (const call of generations.flatMap((generation) => generation.calls)) {
      const set = kinds.get(call.name) ?? new Set<string>();
      set.add(call.kind);
      kinds.set(call.name, set);
    }
    const denied = (fqn: string) =>
      PROBE_DENYLIST[fqn] !== undefined ||
      PROBE_DENYLIST[`${fqn.slice(0, fqn.lastIndexOf("."))}.*`] !== undefined;
    const problems: string[] = [];
    for (const fqn of declared) {
      const scripts = kinds.get(fqn)?.size ?? 0;
      if (denied(fqn) && scripts > 0) problems.push(`${fqn}: denied and probed`);
      if (!denied(fqn) && scripts !== 1) problems.push(`${fqn}: probed from ${scripts} scripts`);
    }
    for (const key of Object.keys(PROBE_DENYLIST)) {
      const fqn = key.replace(/:overload\d+$/, "");
      const matches = fqn.endsWith(".*")
        ? [...declared].some((name) => name.startsWith(fqn.slice(0, -1)))
        : declared.has(fqn);
      if (!matches) problems.push(`${key}: denylist names no declared function`);
    }
    for (const generation of generations) {
      for (const { name, reason } of generation.unwitnessed) {
        problems.push(`${generation.backend} ${name}: ${reason}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("witnesses the engine refuses without a real resource or state", () => {
  // A raise-expecting call at the slot under test replaces it on purpose.
  const callsKeeping = (name: (fqn: string) => boolean, slots: readonly number[]) =>
    v2.calls.filter(
      (call) =>
        name(call.name) &&
        call.call.startsWith(`${call.name}(`) &&
        !(call.witness?.expect === "raise" && slots.includes(call.witness.slot)),
    );
  const offenders = (calls: readonly ProbeCall[], ok: (text: string) => boolean) =>
    calls.filter((call) => !ok(call.call)).map((call) => `${call.variant}: ${call.call}`);

  test("gui.set_size receives a fresh manual-size box node, which LuaSetSize needs to read the size", () => {
    const calls = callsKeeping((fqn) => fqn === "gui.set_size", [1]);
    expect(calls.map((call) => call.variant)).toContain("negative-2");
    const slot1 =
      /^gui\.set_size\(\(\(\) => \{ const (\w+) = gui\.new_box_node\(.*gui\.set_size_mode\(\1, gui\.SIZE_MODE_MANUAL\); return \1; \}\)\(\)/;
    expect(offenders(calls, (text) => slot1.test(text))).toEqual([]);
    expect(offenders(calls, (text) => !text.includes('gui.get_node("box")'))).toEqual([]);
  });

  test("render.render_target always gets a parameters table with a color attachment", () => {
    const calls = callsKeeping((fqn) => fqn === "render.render_target", [1, 2]);
    expect(calls.map((call) => call.variant)).toEqual(
      expect.arrayContaining(["overload1-required", "overload2-required"]),
    );
    const empty = /^render\.render_target\((?:"[^"]*", )?\{\}\)$/;
    expect(
      offenders(
        calls,
        (text) => text.includes("[graphics.BUFFER_TYPE_COLOR0_BIT]: {") && !empty.test(text),
      ),
    ).toEqual([]);
  });

  test("font.set_style names the default font in slot 1 and passes opening-only markup in slot 3", () => {
    const calls = callsKeeping((fqn) => fqn === "font.set_style", [1]);
    expect(calls.length).toBeGreaterThan(0);
    const slot1 = /^font\.set_style\((?:hash\()?"\/builtins\/fonts\/default\.fontc"/;
    expect(offenders(calls, (text) => slot1.test(text))).toEqual([]);
    const slot3 = /, "(?:<[^/>][^>]*>)+"\)$/;
    const markup = callsKeeping((fqn) => fqn === "font.set_style", [3]);
    expect(markup.length).toBeGreaterThan(0);
    expect(offenders(markup, (text) => slot3.test(text))).toEqual([]);
  });

  test("every material function names the probe material in slot 1", () => {
    const calls = callsKeeping((fqn) => fqn.startsWith("material."), [1]);
    expect(new Set(calls.map((call) => call.name)).size).toBeGreaterThan(1);
    const slot1 = /^material\.\w+\((?:hash\()?"\/main\/probe\.materialc"/;
    expect(offenders(calls, (text) => slot1.test(text))).toEqual([]);
  });
});

describe("member calls", () => {
  const memberCallsOf = (generation: ProbeGeneration) =>
    generation.calls.filter((call) => call.variant.startsWith(MEMBER));

  test("a gui.get property member runs in the gui script beside its base call", () => {
    const leading = v2.calls.filter(
      (call) =>
        call.name === "gui.get" && call.variant === 'member overload1-required property="leading"',
    );
    expect(leading.map((call) => [call.kind, call.returns?.kinds])).toEqual([
      ["gui", [["number"]]],
    ]);
  });

  test("msg.post members are left to the go script's message queue", () => {
    expect(members.some((call) => call.name === "msg.post")).toBe(true);
    for (const generation of generations) {
      expect(memberCallsOf(generation).filter((call) => call.name === "msg.post")).toEqual([]);
    }
  });

  test("no member call repeats the text of another call in its pass", () => {
    for (const generation of generations) {
      const counts = new Map<string, number>();
      for (const call of generation.calls) counts.set(call.call, (counts.get(call.call) ?? 0) + 1);
      const repeated = memberCallsOf(generation)
        .filter((call) => (counts.get(call.call) ?? 0) > 1)
        .map((call) => `${generation.backend} ${call.name} ${call.variant}: ${call.call}`);
      expect(repeated).toEqual([]);
    }
  });

  test("every member call joins a pass that runs its base call", () => {
    for (const generation of generations) {
      const base = new Set(
        generation.calls
          .filter((call) => !call.variant.startsWith(MEMBER))
          .map((call) => `${call.name} ${call.variant}`),
      );
      const orphans = memberCallsOf(generation)
        .filter((call) => !base.has(`${call.name} ${call.variant.split(" ")[1]}`))
        .map((call) => `${generation.backend} ${call.name} ${call.variant}`);
      expect(orphans).toEqual([]);
    }
  });
});

describe("option-table forms", () => {
  const forms = (name: string) =>
    v2.calls.filter((call) => call.name === name && call.variant.startsWith("options-"));

  test("a function ending in an optional table is called without it and with an empty one", () => {
    const args = 'vmath.vector3(1, 1, 1), vmath.vector3(1, 1, 1), [hash("probe")]';
    expect(forms("physics.raycast").map((call) => [call.variant, call.call])).toEqual([
      ["options-omitted", `physics.raycast(${args})`],
      ["options-empty", `physics.raycast(${args}, {})`],
    ]);
    expect(forms("gui.play_flipbook").map((call) => call.call)).toEqual([
      'gui.play_flipbook(gui.get_node("box"), "anim", () => {})',
      'gui.play_flipbook(gui.get_node("box"), "anim", () => {}, {})',
    ]);
    for (const call of forms("physics.raycast")) {
      expect([call.returns?.kinds, call.returns?.variadic]).toEqual([[["nil", "table"]], false]);
      expect(call.returns?.shapes?.[0]).toBeDefined();
    }
  });

  test("a function whose last parameter is a callback or a required table gets no option forms", () => {
    expect(forms("sound.play")).toEqual([]);
    expect(forms("buffer.create")).toEqual([]);
  });

  describe("on a fixture surface", () => {
    const fixture = [
      "export {};",
      "declare global {",
      "  namespace sys {",
      "    function probe_fixture_pick(id: number): number;",
      "    function probe_fixture_pick(id: number, options: { readonly all?: boolean }): string;",
      "    function probe_fixture_needs(id: number, options?: { readonly all: boolean }): void;",
      "    function probe_fixture_strict(id: number, options: { readonly all?: boolean }): void;",
      "  }",
      "}",
    ].join("\n");
    const generated = generateProbes(
      undefined,
      "v2",
      overlayProgram(surfaceProgram(probeTarget()), new Map([[OPTION_FIXTURE, fixture]])),
    );
    const fixtureForms = (name: string) =>
      generated.calls.filter((call) => call.name === name && call.variant.startsWith("options-"));

    test("each form carries the returns of the overload the checker resolves for it", () => {
      expect(
        fixtureForms("sys.probe_fixture_pick").map((call) => [call.variant, call.returns]),
      ).toEqual([
        ["options-omitted", { kinds: [["number"]], shapes: [undefined], variadic: false }],
        ["options-empty", { kinds: [["string"]], shapes: [undefined], variadic: false }],
      ]);
    });

    test("a table the call cannot leave out gets no forms, and one refusing {} is unwitnessed", () => {
      expect(fixtureForms("sys.probe_fixture_strict")).toEqual([]);
      expect(fixtureForms("sys.probe_fixture_needs")).toEqual([]);
      expect(generated.unwitnessed.map((entry) => entry.name)).toEqual(["sys.probe_fixture_needs"]);
      expect(generated.unwitnessed[0]?.reason).toStartWith(
        "the checker rejects an empty options table:",
      );
    });
  });
});

describe("probe exemptions against the generated calls", () => {
  // Proves each exemption key is in the generated call inventory, nothing more.
  // An exempted call that is generated but reports no outcome, because the
  // emitted script leaves it out or dies before it, passes here and fails only
  // the runtime probe, as `no such probe call`.
  test("every exemption names a call the probe generates on its Box2D pass", () => {
    const generated = new Set(
      generations.flatMap((generation) =>
        generation.calls.map((call) => outcomeKey(generation.backend, call.name, call.variant)),
      ),
    );
    const orphans = Object.keys(readExemptions()).filter((key) => !generated.has(key));
    expect(orphans).toEqual([]);
  });
});
