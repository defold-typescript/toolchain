import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseMarkdownApi } from "./parse-markdown-api";
import {
  compareFidelityToTsDefold,
  emitMarkdownDeclaration,
  evaluateMarkdownCandidate,
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
  // The upstream `.md` path at the pin, absent exactly when `no-markdown`.
  markdown?: string;
}

/** One Bucket-C library's audited cutover record. `<prefix><module>` is both the
 * moduleId and the publish namespace, so every module here carries the in-place
 * hazard: its markdown goldens would land on the paths the live ts-defold module
 * already owns. Evaluation therefore runs through unregistered in-memory targets
 * (`evaluateMarkdownCandidate`) and only a `go` module is ever registered. */
interface LibraryRecord {
  library: string;
  repo: string;
  ref: string;
  license: string;
  prefix: string;
  classificationDir: string;
  decisions: ModuleDecision[];
}

function candidateTarget(record: LibraryRecord, decision: ModuleDecision): MarkdownTarget {
  const moduleId = `${record.prefix}${decision.module}`;
  return {
    repo: record.repo,
    ref: record.ref,
    license: record.license,
    markdown: decision.markdown ?? "",
    moduleId,
    namespace: moduleId,
    generated: `generated/${moduleId}.d.ts`,
    apiDoc: `api-doc/${moduleId}.json`,
    fidelity: `fidelity/${moduleId}.json`,
    decision: decision.decision,
  };
}

function fixtureText(record: LibraryRecord, decision: ModuleDecision): string {
  return readFileSync(
    join(PACKAGE_ROOT, "fixtures/markdown", `${record.prefix}${decision.module}.md`),
    "utf8",
  );
}

/**
 * The four assertions every per-library decision record owes, so a sibling
 * library costs a decision table plus its own evidence rather than a copied
 * describe block: the record covers exactly the library's shipped modules, a
 * `no-markdown` module has no snapshot, a `no-signature-section` module is
 * refused by the parser, and a `no-go` module stays wired to ts-defold.
 */
function describeLibraryDecisions(record: LibraryRecord): void {
  const { library, ref, decisions } = record;
  const noGo = decisions.filter((d) => d.decision === "no-go");

  describe(`${library} per-module fidelity decisions at tag ${ref}`, () => {
    test("the decision record covers exactly the library's library-targets modules", () => {
      const libraryTargets = JSON.parse(
        readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
      ) as { targets: { module: string }[] };
      const shipped = libraryTargets.targets
        .map((t) => t.module)
        .filter((m) => m.startsWith(record.prefix))
        .sort();
      const recorded = decisions.map((d) => `${record.prefix}${d.module}`).sort();
      // A `go` module is dropped from library-targets.json at cutover, so only
      // the retained (no-go) modules are still expected to appear there.
      expect(recorded.filter((m) => shipped.includes(m))).toEqual(shipped);
      expect(decisions.every((d) => d.reason === "no-markdown" || d.markdown !== undefined)).toBe(
        true,
      );
    });

    const noMarkdown = decisions.filter((d) => d.reason === "no-markdown");
    if (noMarkdown.length > 0) {
      test.each(
        noMarkdown,
      )(`${record.prefix}$module ships no upstream .md, so it has no snapshot to parse`, (decision) => {
        expect(
          existsSync(
            join(PACKAGE_ROOT, "fixtures/markdown", `${record.prefix}${decision.module}.md`),
          ),
        ).toBe(false);
      });
    }

    const signatureless = decisions.filter((d) => d.reason === "no-signature-section");
    if (signatureless.length > 0) {
      test.each(
        signatureless,
      )(`${record.prefix}$module documents no signature section, so the parser refuses it`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(() => parseMarkdownApi(fixtureText(record, decision), moduleId)).toThrow(
          /signature/,
        );
      });
    }
  });

  if (noGo.length > 0) {
    describe(`every no-go ${library} module stays ts-defold-sourced`, () => {
      const dtsCheck = readFileSync(join(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8");

      const shippedModules = (
        JSON.parse(readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8")) as {
          targets: { module: string }[];
        }
      ).targets.map((t) => t.module);

      test.each(
        noGo,
      )(`${record.prefix}$module keeps its ts-defold row and fixture and stays out of the dts-check include`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(shippedModules).toContain(moduleId);
        expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`))).toBe(true);
        expect(dtsCheck).not.toContain(`generated/${moduleId}.d.ts`);
      });

      test("no no-go module is registered as a markdown target", () => {
        const registered = readMarkdownTargets(PACKAGE_ROOT).map((t) => t.moduleId);
        for (const decision of noGo) {
          expect(registered).not.toContain(`${record.prefix}${decision.module}`);
        }
      });

      test(`the ${record.classificationDir} dir retains exactly the modules that stayed`, () => {
        const classification = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
        ) as { dirs: { dir: string; modules: string[] }[] };
        const entry = classification.dirs.find((d) => d.dir === record.classificationDir);
        expect(entry).toBeDefined();
        expect([...(entry?.modules ?? [])].sort()).toEqual(
          noGo.map((d) => `${record.prefix}${d.module}`).sort(),
        );
      });
    });
  }
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
const DEFOLD_INPUT: LibraryRecord = {
  library: "defold-input",
  repo: "https://github.com/britzl/defold-input",
  ref: "4.7.1",
  license: "MIT",
  prefix: "in.",
  classificationDir: "defold-input",
  decisions: [
    {
      module: "accelerometer",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/accelerometer.md",
    },
    {
      module: "button",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/button.md",
    },
    { module: "cursor", decision: "no-go", reason: "surface-loss", markdown: "in/cursor.md" },
    {
      module: "gesture",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/gesture.md",
    },
    { module: "keyboard", decision: "no-go", reason: "no-markdown" },
    {
      module: "mapper",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/mapper.md",
    },
    {
      module: "onscreen",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/onscreen.md",
    },
    { module: "state", decision: "no-go", reason: "surface-loss", markdown: "in/state.md" },
    {
      module: "textbox",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "in/textbox.md",
    },
    { module: "triggers", decision: "no-go", reason: "no-markdown" },
  ],
};

// The recorded per-module decision for `britzl/monarch` at tag 6.0.2 — the second
// multi-module Bucket-C library, and the first whose evaluation needed a
// front-end change: `README_API.md` writes its signatures at `##`, so before the
// header-level widening the parser saw zero sections and the recorded reason
// would have been a tooling artifact rather than a fidelity judgment.
//
// All three modules are `no-go`, so none is registered and monarch stays
// ts-defold-sourced in full.
const MONARCH: LibraryRecord = {
  library: "monarch",
  repo: "https://github.com/britzl/monarch",
  ref: "6.0.2",
  license: "MIT",
  prefix: "monarch.",
  classificationDir: "monarch",
  decisions: [
    { module: "monarch", decision: "no-go", reason: "surface-loss", markdown: "README_API.md" },
    { module: "transitions.easings", decision: "no-go", reason: "no-markdown" },
    {
      module: "transitions.gui",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "README_TRANSITIONS.md",
    },
  ],
};

// The recorded per-module decision for `britzl/defold-richtext` at tag 5.22.1 —
// the third multi-module Bucket-C library, and the first whose documented module
// parses cleanly: the single root `README.md` yields 8 fully-typed `richtext.*`
// functions with no loud-fail. It is `no-go` anyway, and the reason is a fidelity
// judgment rather than a tooling gap: ts-defold's surface is a hand-crafted
// structural API (`Word`, a 16-field `Settings`, `TextMetrics`, branded
// `Alignment`/`VAlignment`) plus 7 paren-less `ALIGN_*`/`VALIGN_*` constant
// headings, and a flat signature parse collapses all of it. `color` and `tags`
// are documented nowhere as signature sections — only inside fenced Lua examples
// and prose bullets — so both are `no-markdown`, not `no-signature-section`.
const RICHTEXT: LibraryRecord = {
  library: "richtext",
  repo: "https://github.com/britzl/defold-richtext",
  ref: "5.22.1",
  license: "MIT",
  prefix: "richtext.",
  classificationDir: "defold-richtext",
  decisions: [
    { module: "color", decision: "no-go", reason: "no-markdown" },
    { module: "richtext", decision: "no-go", reason: "surface-loss", markdown: "README.md" },
    { module: "tags", decision: "no-go", reason: "no-markdown" },
  ],
};

function decisionFor(record: LibraryRecord, module: string): ModuleDecision {
  const decision = record.decisions.find((d) => d.module === module);
  if (decision === undefined) throw new Error(`no recorded decision for ${module}`);
  return decision;
}

const comparisonFor = (record: LibraryRecord, module: string) =>
  evaluateMarkdownCandidate(PACKAGE_ROOT, candidateTarget(record, decisionFor(record, module)));

const inputComparison = (mod: string) => comparisonFor(DEFOLD_INPUT, mod);

describeLibraryDecisions(DEFOLD_INPUT);
describeLibraryDecisions(MONARCH);
describeLibraryDecisions(RICHTEXT);

describe("defold-input surface-loss evidence at tag 4.7.1", () => {
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

describe("monarch surface-loss evidence at tag 6.0.2", () => {
  test("monarch.monarch parses after the header-level widening", async () => {
    const { markdownMembers } = await comparisonFor(MONARCH, "monarch");
    // The 24 `## monarch.<fn>(...)` signature sections of README_API.md. The four
    // `## monarch.SCREEN_TRANSITION_*` constant headings carry no parens and stay
    // out of the surface, which is why they show up as missing members below.
    expect(markdownMembers.length).toBe(24);
    expect(markdownMembers).toContain("show");
  });

  test("the README documents none of the screen-registration surface", async () => {
    const { missingMembers, decision } = await comparisonFor(MONARCH, "monarch");
    for (const fn of [
      "register_proxy",
      "register_factory",
      "unregister",
      "get_stack",
      "queue_size",
      "is_loaded",
      "is_popup",
      "on_message",
    ]) {
      expect(missingMembers).toContain(fn);
    }
    // Every ts-defold constant is invisible to a flat signature parse.
    for (const constant of ["TRANSITION", "FOCUS", "SCREEN_TRANSITION_FAILED"]) {
      expect(missingMembers).toContain(constant);
    }
    expect(decision).toBe("no-go");
  });

  test("upstream renamed on_focus_changed, so the markdown surface adds on_focus_change", async () => {
    const { addedMembers, missingMembers } = await comparisonFor(MONARCH, "monarch");
    expect(addedMembers).toContain("on_focus_change");
    expect(missingMembers).toContain("on_focus_changed");
  });

  test("monarch.transitions.easings has no upstream doc anywhere in the repo", () => {
    expect(
      existsSync(join(PACKAGE_ROOT, "fixtures/markdown", "monarch.transitions.easings.md")),
    ).toBe(false);
  });

  test("monarch.transitions.gui documents its signatures only in prose bullets", () => {
    const text = readFileSync(
      join(PACKAGE_ROOT, "fixtures/markdown", "monarch.transitions.gui.md"),
      "utf8",
    );
    expect(() => parseMarkdownApi(text, "monarch.transitions.gui")).toThrow(
      /monarch\.transitions\.gui/,
    );
    expect(() => parseMarkdownApi(text, "monarch.transitions.gui")).toThrow(/signature/);
  });
});

describe("richtext surface-loss evidence at tag 5.22.1", () => {
  test("richtext.richtext parses cleanly to exactly the 8 documented functions", async () => {
    const { markdownMembers } = await comparisonFor(RICHTEXT, "richtext");
    // The `# API` section's `### richtext.<fn>(...)` sections. Unlike every prior
    // Bucket-C module this one neither loud-fails nor parses empty.
    expect(markdownMembers.length).toBe(8);
    expect(markdownMembers).toContain("create");
    expect(markdownMembers).toContain("plaintext");
  });

  test("the 7 paren-less constant headings stay out of the surface", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(RICHTEXT, "richtext");
    expect(missingMembers).toEqual([
      "ALIGN_CENTER",
      "ALIGN_JUSTIFY",
      "ALIGN_LEFT",
      "ALIGN_RIGHT",
      "VALIGN_BOTTOM",
      "VALIGN_MIDDLE",
      "VALIGN_TOP",
    ]);
    // Every documented function still exists under the same name upstream.
    expect(addedMembers).toEqual([]);
  });

  test("the hand-crafted structural surface collapses to the README's bare tables", async () => {
    const { emitted, downgradedMembers, decision } = await comparisonFor(RICHTEXT, "richtext");
    // ts-defold declares `create(text, font, settings?): LuaMultiReturn<[Word[],
    // TextMetrics]>`. The README's header is `richtext.create(text, font,
    // settings)` — unbracketed — so `settings` comes back required, and while the
    // multi-return *shape* survives, both of its element types degrade to the bare
    // table token. This is why lifting the constant headings would not flip the
    // decision: the downgrade is independent of the missing members.
    expect(emitted).toContain(
      "function create(text: string, font: string, settings: Record<string | number, unknown>): LuaMultiReturn<[Record<string | number, unknown>, Record<string | number, unknown>]>;",
    );
    // None of ts-defold's named structural types survives the flat parse.
    for (const type of ["Word[]", ": Settings", "TextMetrics", "Alignment", "FontsTable"]) {
      expect(emitted).not.toContain(type);
    }
    expect(downgradedMembers).toContain("create");
    expect(decision).toBe("no-go");
  });

  test("richtext.richtext's decision is no-go", async () => {
    const { decision } = await comparisonFor(RICHTEXT, "richtext");
    expect(decision).toBe("no-go");
  });
});
