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
  retargetDoc,
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
    | "shared-document"
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

    // A third refusal class, proven the same way but by a different message: the
    // parser reads the sections and rejects them for spanning two receivers, so
    // the `/signature/` matcher above would not match it.
    const sharedDocument = decisions.filter((d) => d.reason === "shared-document");
    if (sharedDocument.length > 0) {
      test.each(
        sharedDocument,
      )(`${record.prefix}$module is refused because one document covers several modules`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(() => parseMarkdownApi(fixtureText(record, decision), moduleId)).toThrow(
          /non-uniform module prefix/,
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
//   shared-document      the parser reads the `.md`'s convention fine, but one
//                        document covers several modules under different
//                        receivers, so the uniform-prefix invariant refuses it.
//                        A granularity gap, not a dialect gap — recorded only
//                        alongside evidence that a per-receiver parse would not
//                        change the decision either.
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

// The recorded decision for `britzl/gooey` at tag `10.5.3` — the sixth Bucket-C
// library, one module, and the first to trip all three no-go terms at once.
//
// Unlike yagames the dialect is fully accepted: the README writes bare
// `### gooey.<fn>(...)` headings, `**PARAMETERS**`/`**RETURN**`, and
// `* \`name\` (type) - doc` bullets — exactly the corpus convention — so the
// parser returns 8 elements rather than refusing. This is a structural fidelity
// judgment, not a tooling gap. Against a 12-function ts-defold surface:
//
//   surface-loss    4 missing members. `horizontal_dynamic_list`,
//                   `vertical_dynamic_list`, `horizontal_static_list` and
//                   `vertical_static_list` are documented at `#####` under a
//                   `**HORIZONTAL AND VERTICAL LISTS**` prose block, and
//                   `HEADER` accepts `#{2,3}` only.
//   type downgrade  8 of 8 parsed members. The README's vocabulary is bare Lua
//                   tokens — `table`, `function`, and `bool` (an upstream typo
//                   for `boolean`) — against ts-defold's six hand-written state
//                   interfaces threaded through typed callbacks.
//   signature loss  1 member. `dynamic_list`'s heading names 11 arguments but
//                   its `**PARAMETERS**` list documents 10; `root_id` is absent.
//
// Widening `HEADER` past `#{2,3}` cannot flip the verdict, on three independent
// counts: the four `#####` sections have empty bodies, so parsing them would emit
// four zero-arity `(): void` stubs and trade surface-loss for signature-loss; the
// static pair is written upstream with the *dynamic* signature
// (`root_id, item_id, data`) where ts-defold declares `item_ids` and neither
// `root_id` nor `data`; and the 8 type downgrades are independent of header level
// entirely. Upstream is not poorer than ts-defold on content — it documents
// `group` with four parameters where ts-defold declares two — but the state
// tables it describes live in `The state table contains the following fields:`
// bullet blocks that the flat signature parser deliberately ignores, and lifting
// those into named types is deep-prose work the PRD lists as a non-goal.
//
// One note for a future re-evaluation: `bool` is not in `KNOWN_LOSSY_TOKENS`, so
// building a fidelity report for this module would loud-fail in
// `computeMarkdownFidelity`. No report is built for a no-go module, so nothing is
// added — recorded here so that loud-fail is not later read as a regression.
const GOOEY: LibraryRecord = {
  library: "gooey",
  repo: "https://github.com/britzl/gooey",
  ref: "10.5.3",
  license: "MIT",
  prefix: "gooey.",
  classificationDir: "gooey",
  decisions: [
    { module: "gooey", decision: "no-go", reason: "surface-loss", markdown: "README.md" },
  ],
};

// The recorded decision for `britzl/defold-metrics` at tag `1.2.1` — the seventh
// Bucket-C library, and the first whose *one* document covers *two* modules.
//
// Every prior sibling ships one `.md` per module. `defold-metrics` documents both
// `metrics.fps` and `metrics.mem` in a single root `README.md` under two
// receivers — `### fps.create(...)` and `### mem.create(...)` — so the front-end's
// uniform-prefix invariant refuses it, identically for either moduleId:
//
//   parse-markdown-api: non-uniform module prefix across headers: fps, mem
//
// The dialect itself is fully accepted (`**PARAMETERS**`, `**RETURNS**`,
// `* \`name\` (type) - doc`), which is why this is `shared-document` rather than
// `doc-dialect`: the gap is document granularity, not convention support.
//
// Filtering the README to one receiver before parsing yields 4 elements per
// module and still lands `no-go`, on a single term for each:
//
//   term                   metrics.fps                 metrics.mem
//   tsDefoldMembers        ["create"]                  ["create"]
//   missingMembers         []                          []
//   signatureLossMembers   []                          []
//   downgradedMembers      ["create"]                  ["create"]
//   addedMembers           ["draw","fps","update"]     ["draw","mem","update"]
//
// ts-defold hand-writes a factory — `create(...): Metrics` over an interface of
// `fps()`/`update()`/`draw()` — while the README types the return as bare `table`,
// emitting `Record<string | number, unknown>`. The `Metrics` interface is outside
// `MEMBER_DECL`'s function/const surface and never enters the comparison, exactly
// as gooey's state aliases did not.
//
// The `addedMembers` are real, not an artifact: upstream `metrics/fps.lua` holds
// `local singleton = M.create()` plus module-level `M.update`/`M.fps`/`M.draw`
// delegating to it, and ts-defold omits all three. So metrics is the closest
// Bucket-C has come to a `go` — it loses no member and drops no parameter, and
// *adds* three genuine ones. Only the factory return blocks it.
//
// metrics is also the library that exposed the gate's unscored optionality loss.
// ts-defold declares every `create` parameter optional; the markdown emit declares
// all of them required, because optionality reaches the front-end only through a
// `[name]` bracket in the heading and this README writes it in prose ("Optional
// sample count") under a bare `fps.create(samples, format, position, color)`.
// Same arity, same names — so had the `**RETURNS**` named a mappable token
// instead of `table`, both modules would have computed `go` while breaking every
// existing `create()` call site. The comparator now scores that as
// `optionalityLossMembers`.
const METRICS: LibraryRecord = {
  library: "metrics",
  repo: "https://github.com/britzl/defold-metrics",
  ref: "1.2.1",
  license: "MIT",
  prefix: "metrics.",
  classificationDir: "defold-metrics",
  decisions: [
    { module: "fps", decision: "no-go", reason: "shared-document", markdown: "README.md" },
    { module: "mem", decision: "no-go", reason: "shared-document", markdown: "README.md" },
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
describeLibraryDecisions(GOOEY);
describeLibraryDecisions(METRICS);

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

describe("gooey surface-loss evidence at tag 10.5.3", () => {
  const readme = () => fixtureText(GOOEY, decisionFor(GOOEY, "gooey"));
  const PARSED_MEMBERS = [
    "button",
    "checkbox",
    "radio",
    "static_list",
    "dynamic_list",
    "vertical_scrollbar",
    "input",
    "group",
  ];

  test("the front-end accepts the snapshot — this is a fidelity judgment, not a dialect gap", () => {
    const doc = parseMarkdownApi(readme(), "gooey.gooey");
    expect(doc.elements.length).toBe(8);
    expect(doc.info.namespace).toBe("gooey");
  });

  test("gooey.gooey is no-go", async () => {
    const { decision } = await comparisonFor(GOOEY, "gooey");
    expect(decision).toBe("no-go");
  });

  test("the four `#####` list variants are the leading term — 4 missing members", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(GOOEY, "gooey");
    expect(missingMembers).toEqual([
      "horizontal_dynamic_list",
      "horizontal_static_list",
      "vertical_dynamic_list",
      "vertical_static_list",
    ]);
    // Upstream adds no member ts-defold lacks, so the loss is one-directional.
    expect(addedMembers).toEqual([]);
  });

  test("every one of the 8 parsed members downgrades on the README's bare Lua tokens", async () => {
    const { downgradedMembers } = await comparisonFor(GOOEY, "gooey");
    expect([...downgradedMembers].sort()).toEqual([...PARSED_MEMBERS].sort());
  });

  test("dynamic_list's PARAMETERS block documents one argument fewer than its heading", async () => {
    const { signatureLossMembers } = await comparisonFor(GOOEY, "gooey");
    expect(signatureLossMembers).toEqual(["dynamic_list"]);

    const lines = readme().split("\n");
    const heading = lines.findIndex((line) => /^###\s+gooey\.dynamic_list\(/.test(line));
    expect(heading).toBeGreaterThan(-1);
    const headingArgs = (lines[heading]?.match(/\(([^)]*)\)/)?.[1] ?? "").split(",");
    expect(headingArgs.length).toBe(11);
    expect(headingArgs.map((a) => a.trim())).toContain("root_id");

    const paramMarker = lines.findIndex(
      (line, i) => i > heading && /^\*\*PARAMETERS\*\*\s*$/.test(line),
    );
    // The parameter list is the *contiguous* bullet run after the marker. It ends
    // at the blank line before `The \`config\` table can contain the following
    // values:`, whose own two bullets are option keys rather than parameters — so
    // a boundary drawn at `**RETURN**` would over-count this list as 12.
    const params: string[] = [];
    for (let i = paramMarker + 1; i < lines.length; i++) {
      const bullet = lines[i]?.match(/^\*\s+`([^`]+)`\s*\(/);
      if (bullet === null || bullet === undefined) break;
      params.push(bullet[1] as string);
    }
    expect(params.length).toBe(10);
    expect(params).not.toContain("root_id");
  });

  test("the ts-defold surface the comparison runs against is 12 functions", () => {
    const surface = tsDefoldMembers(
      readFileSync(join(PACKAGE_ROOT, "fixtures/ts-defold", "gooey.gooey.d.ts"), "utf8"),
    );
    expect(surface.length).toBe(12);
  });

  test("widening the header range would trade surface-loss for signature-loss, not fix it", () => {
    const lines = readme().split("\n");
    const h3 = lines.filter((line) => /^###\s+gooey\.\w+\(.*\)\s*$/.test(line));
    const h5 = lines.filter((line) => /^#####\s+gooey\.\w+\(.*\)\s*$/.test(line));
    expect(h3.length).toBe(8);
    expect(h5.length).toBe(4);

    // The `#####` sections carry no documented parameters or return at all, so
    // parsing them would emit four zero-arity `(): void` stubs.
    const firstH5 = lines.findIndex((line) => /^#####\s+gooey\.\w+\(.*\)\s*$/.test(line));
    const nextH3 = lines.findIndex((line, i) => i > firstH5 && /^###\s/.test(line));
    const body = lines.slice(firstH5 + 1, nextH3 === -1 ? undefined : nextH3);
    expect(body.some((line) => /^\*\*PARAMETERS\*\*\s*$/.test(line))).toBe(false);
    expect(body.some((line) => /^\*\*RETURN\*\*\s*$/.test(line))).toBe(false);
  });
});

describe("metrics shared-README evidence at tag 1.2.1", () => {
  const readme = (module: string) => fixtureText(METRICS, decisionFor(METRICS, module));

  // Drop the sections belonging to the other receiver so the remainder satisfies
  // the parser's uniform-prefix invariant. Test-local on purpose: per-receiver
  // splitting is a front-end feature the measured verdict shows would buy no
  // decision change here.
  function filterToReceiver(markdown: string, receiver: string): string {
    const kept: string[] = [];
    let dropping = false;
    for (const line of markdown.split("\n")) {
      const heading = line.match(/^#{2,3}\s+([A-Za-z_]\w*)\.[A-Za-z_]\w*\(.*\)\s*$/);
      if (heading !== null) dropping = heading[1] !== receiver;
      else if (/^#{1,6}\s/.test(line)) dropping = false;
      if (!dropping) kept.push(line);
    }
    return kept.join("\n");
  }

  async function receiverComparison(module: string) {
    const moduleId = `metrics.${module}`;
    const doc = retargetDoc(
      parseMarkdownApi(filterToReceiver(readme(module), module), moduleId),
      moduleId,
    );
    const regen = (await import(join(PACKAGE_ROOT, "..", "types", "scripts", "regen.ts"))) as {
      generateModuleDeclaration: (entry: {
        namespace: string;
        doc: unknown;
        outFile: string;
        importsFrom?: string;
        moduleId?: string;
      }) => { contents: string };
    };
    const { contents } = regen.generateModuleDeclaration({
      namespace: moduleId,
      doc,
      outFile: `${moduleId}.d.ts`,
      importsFrom: "../src/core-types",
      moduleId,
    });
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", `${moduleId}.d.ts`),
      "utf8",
    );
    return { doc, ...compareFidelityToTsDefold(contents, tsDefold) };
  }

  test("both snapshots are the one upstream README, byte for byte", () => {
    expect(readme("fps")).toBe(readme("mem"));
  });

  test("the parser refuses the shared document for either moduleId, naming both receivers", () => {
    for (const module of ["fps", "mem"]) {
      expect(() => parseMarkdownApi(readme(module), `metrics.${module}`)).toThrow(
        /non-uniform module prefix across headers: fps, mem/,
      );
    }
  });

  test.each([
    ["fps", ["draw", "fps", "update"]],
    ["mem", ["draw", "mem", "update"]],
  ])("a receiver-filtered metrics.%s still lands no-go on create's table return", async (module, added) => {
    const { doc, decision, missingMembers, signatureLossMembers, downgradedMembers, addedMembers } =
      await receiverComparison(module as string);

    expect(doc.elements.length).toBe(4);
    expect(doc.elements.map((e) => e.name.split(".").pop()).sort()).toEqual(
      ["create", "draw", module, "update"].sort(),
    );

    expect(decision).toBe("no-go");
    expect(missingMembers).toEqual([]);
    expect(signatureLossMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["create"]);
    expect(addedMembers).toEqual(added as string[]);
  });

  test.each([
    "fps",
    "mem",
  ])("metrics.%s loses every optional create parameter — the term that would have hidden a false go", async (module) => {
    const { optionalityLossMembers } = await receiverComparison(module);
    expect(optionalityLossMembers).toContain("create");
  });

  test.each([
    "fps",
    "mem",
  ])("the ts-defold surface of metrics.%s is exactly the factory, so Metrics never enters the comparison", (module) => {
    expect(
      tsDefoldMembers(
        readFileSync(join(PACKAGE_ROOT, "fixtures/ts-defold", `metrics.${module}.d.ts`), "utf8"),
      ),
    ).toEqual(["create"]);
  });
});
