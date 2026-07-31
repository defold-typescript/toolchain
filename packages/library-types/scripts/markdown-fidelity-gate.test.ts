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
  reason:
    | "no-markdown"
    | "no-signature-section"
    | "doc-dialect"
    | "surface-loss"
    | "signature-loss";
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

    // Both classes are proven the same way — the front-end refuses the snapshot.
    // They differ in *why*: `no-signature-section` documents no signatures at
    // all, `doc-dialect` documents them in a convention the parser cannot read.
    const signatureless = decisions.filter(
      (d) => d.reason === "no-signature-section" || d.reason === "doc-dialect",
    );
    if (signatureless.length > 0) {
      test.each(
        signatureless,
      )(`${record.prefix}$module is refused by the markdown parser ($reason)`, (decision) => {
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
//   doc-dialect          the `.md` does document signature sections, but in a
//                        markdown convention the front-end does not parse, so it
//                        loud-fails all the same. Recorded only alongside
//                        independent evidence that a dialect-aware parse would
//                        not change the decision.
//   surface-loss         the `.md` parses, but the structural gate reports the
//                        markdown surface losing members versus ts-defold.
//   signature-loss       the `.md` parses and loses no member, but the members it
//                        keeps lost their parameters or their non-`void` return —
//                        a prose-only README that documents names, not types.
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

// The recorded decision for `whiteboxdev/library-defold-persist` at commit
// `b37f61040740f232d86f68e2606f27b6f1bd15c4` — the fourth Bucket-C library, and
// the first pinned to a SHA rather than a tag: upstream publishes no tags and no
// releases at all, and its README installs from `archive/main.zip`. Its license is
// Zlib, not the MIT every prior sibling carried.
//
// It is also the library that exposed the fidelity gate's false `go`. The single
// root `README.md` documents 6 `### persist.<fn>(...)` headings with no
// `**PARAMETERS**` / `**RETURN**` block anywhere, so the parse keeps every member
// name — `missingMembers` is empty — and emits six argument-less `(): void` stubs
// that contain no `unknown` token, so `downgradedMembers` is empty too. Both terms
// of the old two-term rule read clean and the gate computed `go`, which would have
// retired a fully-typed five-function surface. The comparator now scores a dropped
// parameter list and a lost non-`void` return as `signatureLossMembers`, and the
// decision is `no-go` on its own evidence. Upstream is abandoned (the README's
// first line redirects to `Klaleus/defold-checkpoint`), so this decision is final
// rather than provisional.
const PERSIST: LibraryRecord = {
  library: "persist",
  repo: "https://github.com/whiteboxdev/library-defold-persist",
  ref: "b37f61040740f232d86f68e2606f27b6f1bd15c4",
  license: "Zlib",
  prefix: "persist.",
  classificationDir: "library-defold-persist",
  decisions: [
    { module: "persist", decision: "no-go", reason: "signature-loss", markdown: "README.md" },
  ],
};

// The recorded decision for `indiesoftby/defold-yagames` at tag `0.19.0` — the
// fifth Bucket-C library, one module, and the first `doc-dialect` record.
//
// Upstream's single root `README.md` is a full API reference: 70 backticked
// `#### <recv>.<fn>(...)` headings, 66 under `yagames.` and 4 under `sitelock.`.
// The front-end reads none of it, because the document diverges from the corpus
// convention four independent ways — `####` and backticked headings against
// `##`/`###` bare ones, `**Parameters:**`/`**Returns:**` against
// `**PARAMETERS**`/`**RETURN**`, `- ` bullets against `* `, and
// `` `x` <kbd>type</kbd> `` against `` `x` (type) ``. That vocabulary is eight
// bare Lua tokens with no structural types at all, against a ts-defold surface
// of hand-written interfaces and named callback types.
//
// None of that dialect work would change the outcome. Against the corrected
// 52-member ts-defold surface, upstream 0.19.0 documents no `banner_init`,
// `banner_create`, `banner_delete`, `banner_refresh`, `banner_set` (the banner
// family moved to `adv_show_banner_adv`/`adv_hide_banner_adv`/
// `adv_get_banner_adv_status`), no `leaderboards_init` and no `player_get_id` —
// 7 missing members under the most generous reading, so any parser lands on
// `no-go` for surface-loss. Reading only the `yagames.` prefix the uniform-prefix
// rule would enforce, it is 11.
//
// yagames is also the library that exposed the comparator's `//*` comment-strip
// defect: its fixture's `//* Advertisement` section markers opened a block
// comment that ran to the next JSDoc terminator, reporting 43 of its 52 members.
// Every term of a comparison against that truncated surface fails toward `go`.
const YAGAMES: LibraryRecord = {
  library: "yagames",
  repo: "https://github.com/indiesoftby/defold-yagames",
  ref: "0.19.0",
  license: "MIT",
  prefix: "yagames.",
  classificationDir: "defold-yagames",
  decisions: [
    { module: "yagames", decision: "no-go", reason: "doc-dialect", markdown: "README.md" },
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
describeLibraryDecisions(PERSIST);
describeLibraryDecisions(YAGAMES);

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

describe("persist signature-loss evidence at pin b37f61040740f232d86f68e2606f27b6f1bd15c4", () => {
  test("the README parses cleanly to exactly the 6 documented functions", async () => {
    const { markdownMembers } = await comparisonFor(PERSIST, "persist");
    expect(markdownMembers.length).toBe(6);
    expect(markdownMembers).toContain("create");
    expect(markdownMembers).toContain("exists");
  });

  test("upstream documents a function ts-defold never declared, and loses no member", async () => {
    const { addedMembers, missingMembers } = await comparisonFor(PERSIST, "persist");
    expect(addedMembers).toEqual(["exists"]);
    expect(missingMembers).toEqual([]);
  });

  test("the signature collapse is the whole decision", async () => {
    const { emitted, signatureLossMembers } = await comparisonFor(PERSIST, "persist");
    // ts-defold declares `create(file_name, data, overwrite?)` and
    // `load(file_name): {} | undefined`. The README's `### persist.<fn>(...)`
    // headings carry no `**PARAMETERS**` bullets, so every function emits
    // zero-arity and every return collapses to `void`.
    expect(emitted).toContain("function create(): void;");
    expect(emitted).toContain("function load(): void;");
    expect(signatureLossMembers).toEqual(["create", "flush", "load", "save", "write"]);
  });

  test("persist.persist is no-go on signature-loss, not on the richtext unknown-downgrade class", async () => {
    const { decision, downgradedMembers } = await comparisonFor(PERSIST, "persist");
    expect(decision).toBe("no-go");
    // No emitted signature carries an `unknown` token — a zero-arity stub has no
    // tokens at all — so the record cannot be misread as a type downgrade.
    expect(downgradedMembers).toEqual([]);
  });

  test("the recorded reason matches the term that actually drove the decision", async () => {
    const { signatureLossMembers, missingMembers, downgradedMembers } = await comparisonFor(
      PERSIST,
      "persist",
    );
    expect(decisionFor(PERSIST, "persist").reason).toBe("signature-loss");
    expect(signatureLossMembers.length).toBeGreaterThan(0);
    expect([...missingMembers, ...downgradedMembers]).toEqual([]);
  });
});

describe("yagames doc-dialect evidence at tag 0.19.0", () => {
  const readme = () => fixtureText(YAGAMES, decisionFor(YAGAMES, "yagames"));
  const HEADING = /^#### `([A-Za-z_]\w*)\.([A-Za-z_]\w*)\((.*)\)`\s*$/;
  const headings = () =>
    readme()
      .split("\n")
      .map((line) => line.match(HEADING))
      .filter((match): match is RegExpMatchArray => match !== null);

  const tsSurface = () =>
    tsDefoldMembers(
      readFileSync(join(PACKAGE_ROOT, "fixtures/ts-defold", "yagames.yagames.d.ts"), "utf8"),
    );

  test("the refusal is a dialect gap, not an absent API doc — the README documents 70 signatures", () => {
    const byReceiver = new Map<string, number>();
    for (const [, receiver] of headings()) {
      byReceiver.set(receiver as string, (byReceiver.get(receiver as string) ?? 0) + 1);
    }
    expect(headings().length).toBe(70);
    expect(byReceiver.get("yagames")).toBe(66);
    expect(byReceiver.get("sitelock")).toBe(4);
  });

  test("the parameter and return markers are the corpus concept in a spelling the parser does not match", () => {
    const lines = readme().split("\n");
    expect(lines.filter((line) => /^\*\*Parameters:\*\*\s*$/.test(line)).length).toBe(47);
    expect(lines.filter((line) => /^\*\*Returns:\*\*\s*$/.test(line)).length).toBe(22);
    // The typed bullets exist, as `- \`x\` <kbd>type</kbd>` — never in the `* \`x\` (type)`
    // form `TYPED_BULLET` accepts, so the parser reads zero of them.
    expect(lines.filter((line) => /^\*\s+`[^`]+`\s*\([^)]*\)/.test(line)).length).toBe(0);
    expect(lines.filter((line) => /^-\s+`[^`]+`\s*<kbd>/.test(line)).length).toBe(76);
  });

  test("the front-end refuses the snapshot", () => {
    expect(() => parseMarkdownApi(readme(), "yagames.yagames")).toThrow(/signature/);
  });

  test("dialect support could not flip the decision — 7 documented-member gaps remain", () => {
    // The generous reading: every heading regardless of receiver, which is more
    // than the parser's uniform-prefix rule would allow through.
    const documented = new Set(headings().map(([, , member]) => member as string));
    expect(tsSurface().filter((member) => !documented.has(member))).toEqual([
      "banner_create",
      "banner_delete",
      "banner_init",
      "banner_refresh",
      "banner_set",
      "leaderboards_init",
      "player_get_id",
    ]);
  });

  test("reading only the `yagames.` prefix the parser would enforce, the gap widens to 11", () => {
    const documented = new Set(
      headings()
        .filter(([, receiver]) => receiver === "yagames")
        .map(([, , member]) => member as string),
    );
    expect(tsSurface().filter((member) => !documented.has(member)).length).toBe(11);
  });

  test("the comment-strip fix is load-bearing: the fixture surface is 52 members, not 43", () => {
    const surface = tsSurface();
    expect(surface.length).toBe(52);
    // The nine a `//*`-blind stripper silently dropped, sampled at both ends.
    expect(surface).toContain("adv_show_fullscreen_adv");
    expect(surface).toContain("player_get_data");
  });
});
