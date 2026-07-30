import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseMarkdownApi } from "./parse-markdown-api";
import {
  compareFidelityToTsDefold,
  emitMarkdownDeclaration,
  type MarkdownTarget,
  readMarkdownTargets,
  tsDefoldMembers,
} from "./sync-markdown-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function orthographicTarget(): MarkdownTarget {
  const target = readMarkdownTargets(PACKAGE_ROOT).find(
    (t) => t.moduleId === "orthographic.camera",
  );
  if (target === undefined) throw new Error("orthographic.camera target missing");
  return target;
}

// The comparison runs against the *emitted* markdown `.d.ts` (the real emitter is
// the single source of truth for type resolution), not the parsed doc.
async function comparison() {
  const target = orthographicTarget();
  const markdownEmittedDts = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(
    join(PACKAGE_ROOT, "fixtures/ts-defold", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { target, ...compareFidelityToTsDefold(markdownEmittedDts, tsDefold) };
}

describe("tsDefoldMembers sees bare export-less declarations", () => {
  test("extracts bare `function` members from a module written without `export`", () => {
    const rendy = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", "rendy.rendy.d.ts"),
      "utf8",
    );
    const members = tsDefoldMembers(rendy);
    for (const fn of ["create_camera", "destroy_camera", "get_stack", "screen_to_world"]) {
      expect(members).toContain(fn);
    }
  });
});

describe("orthographic markdown-vs-ts-defold fidelity gate", () => {
  test("reports the ts-defold members the markdown parse does not cover", async () => {
    const { missingMembers } = await comparison();
    // Functions in the ts-defold surface absent from the README API table.
    for (const fn of [
      "add_projector",
      "get_cameras",
      "get_projection_id",
      "project",
      "set_window_scaling_factor",
      "unproject",
      "use_projector",
      "window_to_world",
    ]) {
      expect(missingMembers).toContain(fn);
    }
    // Every ts-defold constant is a member the flat signature parser cannot see.
    for (const constant of [
      "PROJECTOR",
      "SHAKE_BOTH",
      "MSG_SHAKE",
      "ORTHOGRAPHIC_RENDER_SCRIPT_USED",
    ]) {
      expect(missingMembers).toContain(constant);
    }
  });

  test("surfaces the members the newer README adds over ts-defold", async () => {
    const { addedMembers } = await comparison();
    expect(addedMembers).toContain("get_automatic_zoom");
    expect(addedMembers).toContain("set_automatic_zoom");
  });

  test("a weaker markdown type downgrade forces a no-go decision", async () => {
    const { downgradedMembers, decision } = await comparison();
    // ts-defold returns `vmath.matrix4`; the README's `matrix` token is unresolved,
    // so the markdown emit downgrades both to `unknown`.
    expect(downgradedMembers).toContain("get_view");
    expect(downgradedMembers).toContain("get_projection");
    expect(decision).toBe("no-go");
  });

  test("the missing surface forces a no-go decision", async () => {
    const { missingMembers, decision } = await comparison();
    expect(missingMembers.length).toBeGreaterThan(0);
    expect(decision).toBe("no-go");
  });

  test("the recorded target decision matches the computed comparison", async () => {
    const { target, decision } = await comparison();
    expect(target.decision).toBeDefined();
    expect(target.decision).toBe(decision);
  });
});

interface ModuleDecision {
  module: string;
  decision: "go" | "no-go";
  reason: "no-markdown" | "no-signature-section" | "surface-loss";
}

// The recorded per-module fidelity decision for `britzl/defold-input` at tag
// 4.7.1 — the audit record this evaluation produced. Every module is `no-go`, so
// all ten stay ts-defold-sourced and none is registered as a markdown target.
// `reason` names which evidence class drove the decision:
//
//   no-markdown          upstream ships no `in/<mod>.md` at the pin at all.
//   no-signature-section the `.md` is usage/tutorial prose with no
//                        `### <recv>.<fn>(...)` header, so the parser loud-fails.
//   surface-loss         the `.md` parses, but the structural gate reports the
//                        markdown surface losing members versus ts-defold.
const DEFOLD_INPUT_DECISIONS: ModuleDecision[] = [
  { module: "accelerometer", decision: "no-go", reason: "no-signature-section" },
  { module: "button", decision: "no-go", reason: "no-signature-section" },
  { module: "cursor", decision: "no-go", reason: "surface-loss" },
  { module: "gesture", decision: "no-go", reason: "no-signature-section" },
  { module: "keyboard", decision: "no-go", reason: "no-markdown" },
  { module: "mapper", decision: "no-go", reason: "no-signature-section" },
  { module: "onscreen", decision: "no-go", reason: "no-signature-section" },
  { module: "state", decision: "no-go", reason: "surface-loss" },
  { module: "textbox", decision: "no-go", reason: "no-signature-section" },
  { module: "triggers", decision: "no-go", reason: "no-markdown" },
];

// An unregistered in-memory target for a module that *does* parse. The gate needs
// only the emitted surface, and `emitMarkdownDeclaration` returns it without
// writing anything, so the real comparison runs without committing a golden to
// the canonical in-place paths the live ts-defold module already owns.
function inputTarget(mod: string): MarkdownTarget {
  return {
    repo: "https://github.com/britzl/defold-input",
    ref: "4.7.1",
    license: "MIT",
    markdown: `in/${mod}.md`,
    moduleId: `in.${mod}`,
    namespace: `in.${mod}`,
    generated: `generated/in.${mod}.d.ts`,
    apiDoc: `api-doc/in.${mod}.json`,
    fidelity: `fidelity/in.${mod}.json`,
    decision: "no-go",
  };
}

async function inputComparison(mod: string) {
  const target = inputTarget(mod);
  const emitted = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(
    join(PACKAGE_ROOT, "fixtures/ts-defold", `${target.moduleId}.d.ts`),
    "utf8",
  );
  return { emitted, ...compareFidelityToTsDefold(emitted, tsDefold) };
}

describe("defold-input per-module fidelity decisions at tag 4.7.1", () => {
  test("the decision record covers all ten in.* modules and every one is no-go", () => {
    const libraryTargets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    const shipped = libraryTargets.targets
      .map((t) => t.module)
      .filter((m) => m.startsWith("in."))
      .sort();
    expect(DEFOLD_INPUT_DECISIONS.map((d) => `in.${d.module}`).sort()).toEqual(shipped);
    expect(DEFOLD_INPUT_DECISIONS.every((d) => d.decision === "no-go")).toBe(true);
  });

  test.each(
    DEFOLD_INPUT_DECISIONS.filter((d) => d.reason === "no-markdown"),
  )("in.$module ships no upstream .md, so it has no snapshot to parse", ({ module }) => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/markdown", `in.${module}.md`))).toBe(false);
  });

  test.each(
    DEFOLD_INPUT_DECISIONS.filter((d) => d.reason === "no-signature-section"),
  )("in.$module documents no signature section, so the parser refuses it", ({ module }) => {
    const text = readFileSync(join(PACKAGE_ROOT, "fixtures/markdown", `in.${module}.md`), "utf8");
    expect(() => parseMarkdownApi(text, `in.${module}`)).toThrow(/signature/);
  });

  test("in.cursor loses all but one ts-defold member", async () => {
    const { markdownMembers, missingMembers, decision } = await inputComparison("cursor");
    // The README documents exactly one function; every constant and the rest of
    // the script surface is invisible to a flat signature parse.
    expect(markdownMembers).toEqual(["listen"]);
    for (const member of ["DRAG_START", "OVER", "PRESSED", "init", "final", "reset"]) {
      expect(missingMembers).toContain(member);
    }
    expect(decision).toBe("no-go");
  });

  test("in.state loses a documented member and drops every parameter", async () => {
    const { emitted, missingMembers, decision } = await inputComparison("state");
    expect(missingMembers).toEqual(["update"]);
    // The `# API` headers declare arguments but the sections carry no
    // `**PARAMETERS**` bullets, so the flat parse emits every function zero-arity
    // — `state.on_input(action_id, action, [instance])` becomes `on_input()`.
    expect(emitted).toContain("function on_input(): void;");
    expect(emitted).toContain("function is_pressed(): void;");
    expect(decision).toBe("no-go");
  });

  test("the emitter cannot express an in.<mod> namespace: `in` is a reserved word", async () => {
    const { emitted } = await inputComparison("cursor");
    // `namespace in.cursor` is not parseable TypeScript, so even a module that
    // cleared the surface gate could not be published under this namespace
    // without an emitter change. Recorded here as the structural blocker.
    expect(emitted).toContain("namespace in.cursor {");
  });
});

describe("every defold-input module stays ts-defold-sourced", () => {
  const dtsCheck = readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8");

  test.each(
    DEFOLD_INPUT_DECISIONS,
  )("in.$module keeps its ts-defold fixture and stays out of the dts-check include", ({
    module,
  }) => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `in.${module}.d.ts`))).toBe(true);
    expect(dtsCheck).not.toContain(`generated/in.${module}.d.ts`);
  });

  test("the defold-input dir is retained in library-classification.json", () => {
    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string; modules: string[] }[] };
    const entry = classification.dirs.find((d) => d.dir === "defold-input");
    expect(entry).toBeDefined();
    expect(entry?.modules.length).toBe(10);
  });
});
