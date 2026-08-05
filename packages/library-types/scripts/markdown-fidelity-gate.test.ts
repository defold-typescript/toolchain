import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseMarkdownApi } from "./parse-markdown-api";
import { readAuthoredTargets } from "./sync-authored-types";
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
//
// orthographic severed its ts-defold dependency into the authored lane, so the
// retired `fixtures/ts-defold/` snapshot is gone and the recorded verdict now
// resolves against the vendored fork. The fork was taken verbatim from the
// ts-defold-lane golden, so the comparison it feeds is the same one the no-go was
// recorded from — the `follow` correction that landed on top of it renames a
// parameter and widens a union, neither of which the gate scores.
const AUTHORED_SNAPSHOT = "fixtures/authored/orthographic.camera.d.ts";

async function comparison() {
  const target = orthographicTarget();
  const markdownEmittedDts = await emitMarkdownDeclaration(PACKAGE_ROOT, target);
  const tsDefold = readFileSync(join(PACKAGE_ROOT, AUTHORED_SNAPSHOT), "utf8");
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

  test("the README's matrix-returning members are no longer downgraded", async () => {
    const { downgradedMembers, decision } = await comparison();
    // ts-defold returns `vmath.matrix4` and the README's `matrix` shorthand now
    // maps to the same `Matrix4`, so neither member loses its type. The missing
    // surface is the sole remaining driver of the no-go.
    expect(downgradedMembers).not.toContain("get_view");
    expect(downgradedMembers).not.toContain("get_projection");
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
    | "signature-loss"
    | "type-downgrade";
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
  // Set once the library severs its ts-defold dependency; see `SeveredSource`.
  severedSource?: SeveredSource;
}

interface LibraryTargetRow {
  module: string;
  path: string;
  fixture: string;
  generated: string;
}

/** The two `library-targets.json` fields a severed library's record supplies
 * itself. A markdown `no-go` judges the markdown source, not the ts-defold
 * dependency, so a no-go library may still fork into the authored lane and drop
 * its row — but it still owes its recorded verdict a resolvable snapshot and
 * classification module. Keeping a dead row to satisfy the lookup would make
 * `library-targets.json` stop meaning "still ts-defold-sourced", so the override
 * lives on the one record that severed. A fork starts byte-identical to the
 * retired snapshot, so `fixture` may point at the vendored authored copy, and the
 * recorded comparison holds until an authored correction changes a term the
 * comparison scores — at which point the verdict is re-checked, not the pin
 * re-baselined blindly. */
interface SeveredSource {
  path: string;
  fixture: string;
}

/** The `library-targets.json` row a moduleId ships from. The ts-defold snapshot
 * path and the classification module name are read from the row rather than
 * composed from the moduleId, because the two coincide only by convention:
 * `bzAnim.bzLibrary` ships in `packages/bzAnim/bzAnim.bzAnim.d.ts`, so both
 * guesses would miss. `writeClassification` derives the classification name from
 * the upstream filename, which is what `basename(path)` reproduces. */
function targetFor(moduleId: string, severed?: SeveredSource): LibraryTargetRow {
  const { targets } = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
  ) as { targets: LibraryTargetRow[] };
  const row = targets.find((t) => t.module === moduleId);
  if (row !== undefined) return row;
  if (severed !== undefined) {
    return { module: moduleId, ...severed, generated: `generated/${moduleId}.d.ts` };
  }
  throw new Error(`no library-targets row for ${moduleId}`);
}

function classificationModule(moduleId: string, severed?: SeveredSource): string {
  return basename(targetFor(moduleId, severed).path, ".d.ts");
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

// Drop the sections belonging to the other receiver so the remainder satisfies
// the parser's uniform-prefix invariant. Test-local on purpose: per-receiver
// splitting is a front-end feature the measured verdicts show would buy no
// decision change on either library that needs it.
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

/**
 * Run one test-rewritten reading of a refused `shared-document` snapshot through
 * the real pipeline — parse, retarget onto the publish namespace, emit, compare
 * against the ts-defold surface it would replace. `evaluateMarkdownCandidate`
 * cannot serve here because it reads the snapshot as committed, which is exactly
 * the string the parser refuses.
 */
async function comparisonForMarkdown(markdown: string, moduleId: string) {
  const doc = retargetDoc(parseMarkdownApi(markdown, moduleId), moduleId);
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
  const tsDefold = readFileSync(join(PACKAGE_ROOT, targetFor(moduleId).fixture), "utf8");
  return { doc, emitted: contents, ...compareFidelityToTsDefold(contents, tsDefold) };
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
    // parser reads the sections and rejects them for spanning two receivers —
    // sibling modules or a module plus its returned instance's methods — so the
    // `/signature/` matcher above would not match it.
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

  // A `no-go` retires the *markdown* front-end as this library's regeneration
  // path. Whether it also keeps the ts-defold dependency is a separate question,
  // and the two answers get opposite assertions: an unsevered library must still
  // carry its row, fixture, and classification entry; a severed one must have
  // dropped all three, its verdict now resolving through `severedSource`.
  if (noGo.length > 0 && record.severedSource === undefined) {
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
        expect(existsSync(join(PACKAGE_ROOT, targetFor(moduleId).fixture))).toBe(true);
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
          noGo.map((d) => classificationModule(`${record.prefix}${d.module}`)).sort(),
        );
      });
    });
  }

  const severed = record.severedSource;
  if (noGo.length > 0 && severed !== undefined) {
    describe(`every no-go ${library} module severed ts-defold for the authored lane`, () => {
      const shippedModules = (
        JSON.parse(readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8")) as {
          targets: { module: string }[];
        }
      ).targets.map((t) => t.module);

      test.each(
        noGo,
      )(`${record.prefix}$module dropped its ts-defold row and dotted golden`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(shippedModules).not.toContain(moduleId);
        expect(existsSync(join(PACKAGE_ROOT, "generated", `${moduleId}.d.ts`))).toBe(false);
      });

      test("no no-go module is registered as a markdown target", () => {
        const registered = readMarkdownTargets(PACKAGE_ROOT).map((t) => t.moduleId);
        for (const decision of noGo) {
          expect(registered).not.toContain(`${record.prefix}${decision.module}`);
        }
      });

      test(`the ${record.classificationDir} dir is gone from library-classification.json`, () => {
        const classification = JSON.parse(
          readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
        ) as { dirs: { dir: string }[] };
        expect(classification.dirs.some((d) => d.dir === record.classificationDir)).toBe(false);
      });

      test.each(
        noGo,
      )(`${record.prefix}$module still resolves its snapshot and classification module`, (decision) => {
        const moduleId = `${record.prefix}${decision.module}`;
        expect(existsSync(join(PACKAGE_ROOT, targetFor(moduleId, severed).fixture))).toBe(true);
        expect(classificationModule(moduleId, severed)).toBe(moduleId);
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
//                        loud-fails all the same. The convention need not be
//                        unreadable — starly's headings are well-formed
//                        `<recv>.<fn>(...)` signatures that happen to be wrapped
//                        in backticks — only unmatched. Recorded only alongside
//                        independent evidence that a dialect-aware parse would
//                        not change the decision.
//   shared-document      the parser reads the `.md`'s convention fine, but one
//                        document documents more than one receiver, so the
//                        uniform-prefix invariant refuses it. Two forms: sibling
//                        modules sharing a README (metrics' `fps.`/`mem.`), and a
//                        module plus the instance-method family of the object it
//                        returns (platypus' `platypus.`/`instance.`). The
//                        invariant refuses both identically, but the remedy
//                        differs — a per-receiver parse would help the first and
//                        actively harm the second, which would hoist instance
//                        methods into module scope. A granularity gap, not a
//                        dialect gap — recorded only alongside evidence that a
//                        per-receiver parse would not change the decision either.
//   surface-loss         the `.md` parses, but the structural gate reports the
//                        markdown surface losing members versus ts-defold.
//   signature-loss       the `.md` parses and loses no member, but the members it
//                        keeps lost their parameters or their non-`void` return —
//                        a prose-only README that documents names, not types.
//   type-downgrade       the `.md` parses, loses no member, and every member keeps
//                        its parameters and its return — but the types those
//                        parameters and returns resolve to are weaker than
//                        ts-defold's. The only class reachable by a document the
//                        front-end accepts in full: every other one is scored on a
//                        refusal or on a hole in the surface, so this is what is
//                        left when the document is read exactly as written and the
//                        loss is precision alone.
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
//
// It is also the first library to sever ts-defold on a `no-go`. The verdict below
// is unchanged and final; what changed is the answer to the separate question a
// `no-go` never asked — where the types are *maintained*. persist's ts-defold
// surface is small, fully typed, and better than its README, so it forked into
// the authored lane verbatim rather than staying a ts-defold consumer, and
// `severedSource` supplies the `library-targets.json` fields the dropped row used
// to.
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
  severedSource: {
    path: "packages/library-defold-persist/persist.persist.d.ts",
    fixture: "fixtures/authored/persist.persist.d.ts",
  },
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
// None of that dialect work would change the outcome, and the evidence describe
// below re-measures that against the *forked* snapshot rather than the retired
// ts-defold one. Unlike persist (verbatim) and orthographic (a rename and a
// widened union, neither of which the gate scores), the yagames fork drops five
// members and adds three, so the recorded numbers move with it by design: the
// severance retired `banner_init`, `banner_create`, `banner_delete`,
// `banner_refresh`, `banner_set` in favour of the documented
// `adv_show_banner_adv`/`adv_hide_banner_adv`/`adv_get_banner_adv_status`, taking
// the surface from 52 members to 50 and the generous-reading gap from 7 to the
// 2 upstream still declares but no longer documents — `leaderboards_init` and
// `player_get_id`. Any gap at all forces `no-go` for surface-loss, so the verdict
// is unchanged; what the smaller number costs is only the size of the margin.
// Reading only the `yagames.` prefix the uniform-prefix rule would enforce, the
// gap is 6 — the same 2 plus the 4 sitelock-receiver members.
//
// yagames is also the library that exposed the comparator's `//*` comment-strip
// defect: its fixture's `//* Advertisement` section markers opened a block
// comment that ran to the next JSDoc terminator, truncating the surface it
// reported. Every term of a comparison against that truncated surface fails
// toward `go`.
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
  severedSource: {
    path: "packages/defold-yagames/yagames.yagames.d.ts",
    fixture: "fixtures/authored/yagames.yagames.d.ts",
  },
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

// The recorded decision for `whiteboxdev/library-defold-rendy` at commit
// `b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3` — the eighth Bucket-C library, one
// module, and the second SHA pin in the corpus: like its persist sibling (same
// upstream author) it publishes no tags and no releases, and carries Zlib rather
// than the MIT every other sibling ships. The ts-defold fixture header cites
// `klaytonkowalski/library-defold-rendy`, which now 301-redirects to the
// `whiteboxdev` slug used here — the same account rename persist recorded.
//
// rendy is the library that widened `HEADER` by an optional `function` keyword.
// Its `## API` section writes 2 of its 11 headings bare (`### rendy.create_camera(
// camera_id)`) and the other 9 as `### function rendy.set(camera_id, property,
// value)`. The keyword form did not match, so the as-is parse returned 2 elements
// rather than throwing — no refusal class applied — and the comparison read 11
// missing members against a `["create_camera","destroy_camera"]` markdown surface.
// Recording that as `surface-loss` would have filed a header dialect as a fidelity
// judgment, the trap the monarch slice fixed at the `##` level. The unmatched
// headings also did not close the preceding section, so the whole rest of the API
// section landed inside `destroy_camera`'s description — a second, independent
// harm the widening removes.
//
// The dialect-aware parse lifts all 11 documented members and does not move the
// verdict:
//
//   missingMembers         ["animate","cancel_animations"]  (undocumented upstream)
//   signatureLossMembers   all 11 shared members
//   downgraded / added / optionalityLoss   []
//
// The README carries no `**PARAMETERS**` and no `**RETURN**` block anywhere —
// a heading and one line of prose per function — so every member emits as a
// zero-arity `(): void` stub, discarding `get_display_size(): vmath.vector3`,
// `get_stack(screen_x, screen_y): CameraId[]`, `screen_to_world(camera_id,
// screen_position): vmath.vector3`, the 5-parameter `shake` with its optional
// `scaler`, and the `CameraId` alias itself. Both terms are independently
// decisive; the dominant one — 11 members against 2 — is the signature collapse,
// so the reason is persist's `signature-loss` class, for persist's reason: a
// prose-only README that documents names, not types.
//
// One note for a future re-evaluation: `shake`'s heading writes its optional
// argument as `duration \[, scaler]`, an escaped bracket `bracketedArgs` does not
// read as optional. Inert here — with no `**PARAMETERS**` bullets there are no
// parameters to mark either way — so it is recorded rather than fixed.
const RENDY: LibraryRecord = {
  library: "rendy",
  repo: "https://github.com/whiteboxdev/library-defold-rendy",
  ref: "b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3",
  license: "Zlib",
  prefix: "rendy.",
  classificationDir: "library-defold-rendy",
  decisions: [
    { module: "rendy", decision: "no-go", reason: "signature-loss", markdown: "README.md" },
  ],
};

// The recorded decision for `britzl/platypus` at tag `4.3.1` (commit
// `a58d54c1fc1b95d67089a039feb5d904c3524298`) — the ninth Bucket-C library, one
// module, and the second `shared-document` refusal, on the second *form* of that
// class.
//
// The root `README.md`'s `# Platypus API` carries 20 signature headings: one
// `### platypus.create(config)` and 19 `### instance.<fn>(...)`. The as-is parse
// throws, byte-identically to metrics':
//
//   parse-markdown-api: non-uniform module prefix across headers: instance, platypus
//
// The dialect is fully accepted — bare `###` headings, `**PARAMETERS**`,
// `**RETURN**`, `* \`name\` (type) - doc` bullets, no `<kbd>` — so this is
// `shared-document`, not `doc-dialect`.
//
// What differs from metrics is *what* the second receiver is. metrics' `fps.` and
// `mem.` are two sibling modules, so a per-receiver parse is at least a coherent
// (if insufficient) path. platypus' `instance.` is not a module: it is the object
// `create` returns, ts-defold's `PlatypusInstance`. A per-receiver parse would
// emit those 19 methods as *module-level* functions — wrong rather than
// incomplete. That is why the class is widened to name both forms instead of
// teaching the front-end a per-receiver parse.
//
// `tsDefoldMembers` is 13 — `create` plus 12 constants (7 message hashes and 5
// `DIR_*` values). Every reading of the document lands no-go, on independently
// decisive terms:
//
//   term                  platypus. only    unified prefix        instance. only
//   elements parsed       1                 20                    19
//   missingMembers        the 12 constants  the 12 constants      all 13
//   addedMembers          []                the 19 methods        the 19 methods
//   downgradedMembers     ["create"]        ["create"]            []
//   signature/optionality []                []                    []
//
// The constants are unreachable under any reading: `DIR_UP`/`DIR_LEFT`/
// `DIR_RIGHT`/`DIR_DOWN`/`DIR_ALL` appear only inside a code example, and the 7
// message hashes are paren-less `### platypus.FALLING` headings under
// `## Messages` that `HEADER` does not match. `create` downgrades because the
// README types both its parameter and its return as bare `(table)`.
//
// The recorded terms are a floor on the loss, not a measure of it. `MEMBER_DECL`
// sees only top-level `function`/`const`, so `PlatypusConfig` (11 optional fields
// plus a required nested `collisions` shape) and `PlatypusInstance` (19 methods plus
// `velocity: vmath.vector3`) never enter the comparison at all — exactly as
// metrics' `Metrics` interface and gooey's state aliases did not. Both collapse
// to `Record<string | number, unknown>` in the markdown emit.
const PLATYPUS: LibraryRecord = {
  library: "platypus",
  repo: "https://github.com/britzl/platypus",
  ref: "4.3.1",
  license: "MIT",
  prefix: "platypus.",
  classificationDir: "platypus",
  decisions: [
    { module: "platypus", decision: "no-go", reason: "shared-document", markdown: "README.md" },
  ],
};

// The recorded decision for `VowSoftware/starly` at commit
// `85d1b2af8bf0618e7f297da41d03eb55d27e49b6` — the tenth Bucket-C library, one
// module, and the third SHA pin (the repo publishes no tags and no releases).
// The PRD named `whiteboxdev/library-defold-starly`, which 404s; the ts-defold
// fixture's own `@see` already pointed at the `VowSoftware` slug used here.
//
// `## Function API` carries 14 signature headings, every one backtick-wrapped —
// ``### `m_starly.create(id)` `` — which `HEADER` does not match, so the as-is
// parse refuses the document outright. Five axes diverge in total:
//
//   1. headings wrapped in backticks
//   2. mixed-case `**Parameters**` / `**Returns**` markers (the regexes are
//      uppercase-only)
//   3. colon-typed bullets — `* \`id\`: \`hash\` doc` rather than
//      `* \`id\` (hash) - doc`
//   4. type-only return bullets (`* \`boolean\``, `* \`vector3\` or \`nil\``)
//      that name no slot at all
//   5. a blank line between each marker and its bullet run, which closes the
//      list before a single bullet is read
//
// The receiver alias `m_starly` is *not* one of them — `retargetDoc` rewrites it
// onto `starly.starly` exactly as it rewrites orthographic's `camera`.
//
// Under a maximally generous reading — all five axes rewritten, and
// `[visible = false]` reduced to `[visible]` so `bracketedArgs` reads it — the
// parse yields all 14 functions and the verdict does not move:
//
//   elements parsed        14
//   tsDefoldMembers        `CoreModule`'s 21 — 14 methods and 7 `c_*` constants
//   missingMembers         the 7 `c_*` constants
//   addedMembers           []
//   downgradedMembers      ["get_tight_world_area"]
//   signatureLossMembers   ["screen_to_world", "world_to_screen"]
//   optionalityLossMembers ["shake"]
//
// This record was first taken against a surface of one member, and was re-derived
// when the extractor learned to read an `export =` handle. `fixtures/ts-defold/
// starly.starly.d.ts` publishes through `interface CoreModule` + `type CameraMap`
// + `const exportThis: Starley; export = exportThis;`. While `MEMBER_DECL` read
// only top-level `function`/`const`, `tsDefoldMembers` was `["exportThis"]`,
// `missingMembers` was `["exportThis"]`, `addedMembers` was all 14 markdown
// functions, and the three signature terms were empty for want of any shared
// member — `opaqueTsDefoldSurface` carried the whole verdict. `tsDefoldSurface`
// now resolves the handle through its alias, its intersection and `Readonly<>` to
// `CoreModule`'s members, so the terms above are read off the real surface and the
// `no-go` rests on them. The verdict and its `doc-dialect` reason are unchanged.
//
// starly is the only `export =` fixture in the corpus, and the guard stays for a
// handle that resolves to nothing: were the handle a *type* rather than a const,
// `tsMembers` would still be empty and the decision would otherwise read `go`
// against nothing. This record is why `opaqueTsDefoldSurface` exists.
//
// The losses behind those terms — and the one the comparator still cannot see:
//
//   - 7 module constants — `display_width`/`display_height`/`display_ratio` and
//     the four `behavior_*` hashes are `**Module Variables**` bullets under
//     `## Variable API`, never signature headings, so a flat parse cannot reach
//     them. ts-defold additionally renames them `c_*`, and they are the whole of
//     `missingMembers`.
//   - 3 dropped parameters across 2 members — the headings declare
//     `screen_to_world(id, screen_x, screen_y, [visible])` and
//     `world_to_screen(id, world_position, [visible])`, but both `**Parameters**`
//     lists document only `id` and `visible`, so the generous emit is
//     `screen_to_world(id: Hash, visible?: boolean)`.
//   - 1 type downgrade — `get_tight_world_area`'s `positions: table` emits
//     `Record<string | number, unknown>` against ts-defold's `vmath.vector3[]`.
//   - 2 optional parameters lost — `shake`'s bullets repeat the heading's
//     brackets in the *name* (`* \`[duration_scalar]\`: \`number\``), which is no
//     identifier, so even the generous emit renames them `arg4`/`arg5` and drops
//     their optionality.
//   - 8 `CameraMap` fields — `starly[id].behavior`/`viewport_*`/`near`/`far`/
//     `zoom` are a `LuaMap<hash, {...}>` value, not members of the module object,
//     so they stay outside the comparison: a flat signature surface cannot express
//     an indexed map. This one is still measurable only by hand.
//
// The 14 documented functions do match ts-defold's 14 one-for-one, so this is not
// gooey's member-count loss. The decision is driven by the dialect refusal plus
// the constants, the map, and the dropped parameters.
const STARLY: LibraryRecord = {
  library: "starly",
  repo: "https://github.com/VowSoftware/starly",
  ref: "85d1b2af8bf0618e7f297da41d03eb55d27e49b6",
  license: "Zlib",
  prefix: "starly.",
  classificationDir: "starly",
  decisions: [
    { module: "starly", decision: "no-go", reason: "doc-dialect", markdown: "README.md" },
  ],
};

// The recorded decision for `8bitskull/dicebag` at tag `0.3` (commit
// `2d966260ff3185393c4244714c7fb7d8b7c2fe63`) — the eleventh Bucket-C library and
// one module. The PRD named `white-star-dev/dicebag`; the ts-defold fixture's own
// `@see` already pointed at the `8bitskull` slug used here.
//
// This is the first Bucket-C document the front-end reads as-is. `# Usage` writes
// 11 bare `### dicebag.<fn>(...)` headings, uppercase `**PARAMETERS**`/
// `**RETURNS**` markers and `* \`name\` (type) - doc` bullets, and the receiver is
// already `dicebag` — the exact dialect the parser was built for. So it is also
// the first one-for-one surface match:
//
//   elements parsed                          11
//   tsDefoldMembers / markdownMembers        the same 11 names
//   missingMembers / addedMembers            []
//   signatureLossMembers                     []
//   opaqueTsDefoldSurface                    false
//   downgradedMembers                        3
//   optionalityLossMembers                   ["set_up_rng"]
//
// The verdict therefore rests on type precision alone — neither `surface-loss`
// (no member is lost) nor `signature-loss` (no member's parameters or return
// collapsed), which is why the class is `type-downgrade` and not either of those.
// Filing it under `signature-loss` would have made that class's legend false about
// its own corpus.
//
// This record was first taken at 7 downgrades. Four of those — `bag_create`,
// `bag_draw`, `bag_reset`, `table_reset` — and part of two more were a front-end
// gap, not a document one: the README writes `id`'s type as the comma-listed
// token `(string, number, hash)`, and `parseSlot` split a `(type)` group on `|`
// alone, so the whole group reached the emitter unmappable and fell to `unknown`.
// The parser now treats a top-level comma as a union separator too, so `id` emits
// `string | number | Hash` and those members stopped being downgrades.
//
// The three that remain are upstream underspecification: `roll_custom_dice`'s
// `sides` is documented `(table)` against ts-defold's `Array<[number, number]>`
// and its return `(any)`, so the emit is
// `roll_custom_dice(num_dice: number, sides: Record<string | number, unknown>): unknown`.
// `table_create`'s `rollable_table` is `(table)` against
// `Array<[number, any, boolean?]>` the same way, and `table_roll` returns `(any)`
// -> `unknown` against ts-defold's `any`. The one optionality loss is
// `set_up_rng`: ts-defold has `seed?: number`, the heading writes
// `set_up_rng(seed)` with no brackets, and the optionality lives only in the
// bullet's prose, which `bracketedArgs` cannot read.
//
// The one fixable front-end gap left is not load-bearing either. Under a generous
// reading — the heading rewritten `set_up_rng([seed])` — the parse still yields 11
// elements and:
//
//   term                    as-is              generous
//   downgradedMembers       the three above    the three above
//   optionalityLossMembers  ["set_up_rng"]     []
//   decision                no-go              no-go
//
// The residue is exactly the underspecification a parser cannot fix, which is why
// the comma split — real precision, and the one term that did move — still changes
// no decision here.
//
// One finding that is evidence about the *retained* surface rather than a term in
// the decision: `roll_special_dice`'s `advantage` is documented `(boolean)`
// upstream ("If true, the highest rolls will be selected") and typed `number` in
// ts-defold. The markdown emit is the correct one. The comparator does not flag
// it — it scores weakening, and this is a lateral disagreement — so the ts-defold
// type error survives the no-go.
const DICEBAG: LibraryRecord = {
  library: "dicebag",
  repo: "https://github.com/8bitskull/dicebag",
  ref: "0.3",
  license: "CC0-1.0",
  prefix: "dicebag.",
  classificationDir: "dicebag",
  decisions: [
    { module: "dicebag", decision: "no-go", reason: "type-downgrade", markdown: "README.md" },
  ],
};

// The recorded decision for `jbp4444/bzAnim` at tag `v.1.2` (commit
// `43412de571fc880849f1b58a0ef52d65ca71e6c8`) — the twelfth Bucket-C library and
// one module. The PRD left the repo unresolved; it is `jbp4444/bzAnim`, which the
// ts-defold fixture's `@see` and `NOTICE` already named. Apache-2.0 is the first
// Apache license in Bucket C. `main` is 3.5 years ahead of the tag, but
// `README.md` is byte-identical at both, so the pin is not stale evidence.
//
// This is the first Bucket-C library whose *only* document carries no signature
// heading at all. Its ten headings are prose section titles (`## Installation`,
// `## Usage`, `## Helper Functions`, ...) and not one matches
// `##`/`###` `<recv>.<fn>(...)`, so the front-end refuses the whole library —
// `no-signature-section`, the class defold-input's six prose modules already
// carry, but there as one module of ten.
//
// The structural reason runs deeper than the dialect. Both animation entry points
// take a single options table (`animate(args: AnimateArgs): string`), and a flat
// signature table cannot express an options-table parameter at all, so even a
// README rewritten into the parser's dialect could not carry `AnimateArgs`.
//
// Nor does the verdict depend on that gap being fixable. Hoisting every function
// the README names anywhere — the 7 `bz.<fn>(...)` calls in its Lua snippets —
// into `### bzAnim.<fn>(...)` headings yields 7 elements and:
//
//   missingMembers          ["DEBUG_LEVEL", "INFO_LEVEL", "TRACE_LEVEL"]
//   addedMembers            ["setMaxPts"]
//   signatureLossMembers    all 6 shared functions — every one emits `(): void`
//   downgradedMembers       []
//   optionalityLossMembers  []
//   decision                no-go
//
// The README documents no parameter bullets anywhere, so every function collapses
// to a zero-arity `void` stub, `animate`'s `string` return included.
//
// Two findings that do not move the verdict: the README's `bz.setMaxPts( 15 )`
// does not exist upstream (`bzAnim/bzLibrary.lua` defines `bz.setMaxPoints`) and
// the README omits `registerController`/`unregisterController` that the Lua
// exports, so the document is not a faithful surface even on its own terms; and
// `bzLibrary.lua` carries no LuaLS annotations, confirming the audit's Bucket-C
// placement.
//
// bzAnim is also the one target whose upstream filename and declared module
// diverge — it ships `packages/bzAnim/bzAnim.bzAnim.d.ts` as module
// `bzAnim.bzLibrary` — which is why the shared record resolves the ts-defold
// snapshot and the classification name through `targetFor` instead of composing
// them from the moduleId.
const BZANIM: LibraryRecord = {
  library: "bzAnim",
  repo: "https://github.com/jbp4444/bzAnim",
  ref: "v.1.2",
  license: "Apache-2.0",
  prefix: "bzAnim.",
  classificationDir: "bzAnim",
  decisions: [
    {
      module: "bzLibrary",
      decision: "no-go",
      reason: "no-signature-section",
      markdown: "README.md",
    },
  ],
};

function decisionFor(record: LibraryRecord, module: string): ModuleDecision {
  const decision = record.decisions.find((d) => d.module === module);
  if (decision === undefined) throw new Error(`no recorded decision for ${module}`);
  return decision;
}

// A severed record compares against its `severedSource` snapshot rather than the
// `fixtures/ts-defold/` entry it no longer has; the two are byte-identical for a
// verbatim fork, so the recorded evidence reproduces unchanged.
const comparisonFor = (record: LibraryRecord, module: string) =>
  evaluateMarkdownCandidate(
    PACKAGE_ROOT,
    candidateTarget(record, decisionFor(record, module)),
    record.severedSource?.fixture,
  );

const inputComparison = (mod: string) => comparisonFor(DEFOLD_INPUT, mod);

const LIBRARY_RECORDS = [
  DEFOLD_INPUT,
  MONARCH,
  RICHTEXT,
  PERSIST,
  YAGAMES,
  GOOEY,
  METRICS,
  RENDY,
  PLATYPUS,
  STARLY,
  DICEBAG,
  BZANIM,
];

for (const record of LIBRARY_RECORDS) describeLibraryDecisions(record);

/** Every vendored snapshot a recorded verdict in this file rests on: the upstream
 * `.md` each decision judges, and the ts-defold surface — or, once a library
 * severed, the authored fork — it was compared against. Derived from the records
 * themselves so a new library extends the coverage by existing. */
function verdictFixturePaths(): string[] {
  const paths = new Set<string>([
    AUTHORED_SNAPSHOT,
    "fixtures/markdown/orthographic.camera.md",
    "fixtures/ts-defold/rendy.rendy.d.ts",
  ]);
  for (const record of LIBRARY_RECORDS) {
    for (const decision of record.decisions) {
      const moduleId = `${record.prefix}${decision.module}`;
      if (decision.reason !== "no-markdown") paths.add(`fixtures/markdown/${moduleId}.md`);
      paths.add(targetFor(moduleId, record.severedSource).fixture);
    }
  }
  return [...paths].sort();
}

function fixtureDigest(path: string): string {
  return new Bun.CryptoHasher("sha256")
    .update(readFileSync(join(PACKAGE_ROOT, path)))
    .digest("hex");
}

/** Paths `authored-targets.json` declares as this repo's own forked or
 * hand-authored `.d.ts`. Read from the production config rather than matched on
 * a directory prefix, so a target re-vendored elsewhere keeps its lane. */
const AUTHORED_LANE = new Set(readAuthoredTargets(PACKAGE_ROOT).map((target) => target.authored));

/** What a drifted pin means, and whether re-pinning is the correct response.
 * The two lanes drift for opposite reasons, so they cannot share a remedy: an
 * upstream copy drifting means a snapshot the repo does not own moved under a
 * recorded verdict, while an authored-lane fork drifting is the expected result
 * of deliberate work on a file the repo maintains. */
function driftRemedy(path: string): { digestMayBeUpdated: boolean; message: string } {
  if (AUTHORED_LANE.has(path)) {
    return {
      digestMayBeUpdated: true,
      message: `${path} no longer matches the copy every verdict derived from it was read off. It is an authored-lane snapshot this repo owns: re-check the recorded comparison for the modules that read it, then update this digest in the same commit as the edit.`,
    };
  }
  return {
    digestMayBeUpdated: false,
    message: `${path} no longer matches the copy every verdict derived from it was read off. Re-run the evaluation for the modules that read it and rewrite their recorded decision — do not re-baseline this digest.`,
  };
}

/** The pinned SHA-256 of every path `verdictFixturePaths` names, across both
 * lanes: the upstream copies taken at a pin, and the authored-lane forks a
 * severed library's verdict now resolves against. Every decision recorded in
 * this file was derived by reading them once; an in-place edit or a silent
 * re-vendor changes what those verdicts are about without changing the
 * verdicts. The lanes drift for different reasons, so `driftRemedy` reports
 * them differently. */
const VENDORED_FIXTURE_HASHES: Record<string, string> = {
  "fixtures/authored/orthographic.camera.d.ts":
    "08f9162be44fc457b05401a1105201c8f324755a3b1726763e8ca2cec0f6b657",
  "fixtures/authored/persist.persist.d.ts":
    "f79845a7b47f57f4559d7b365c32ce5527ce12e778999e5eee4db3f45793c622",
  "fixtures/authored/yagames.yagames.d.ts":
    "cbb9120f25aa99f6e53c9c7210ddf3178b0f075f22dffc2f4c766bcf008e641a",
  "fixtures/markdown/bzAnim.bzLibrary.md":
    "ffc299add5db0e4348fcdf59fa432b4606071c7188aaa51fae4206f7fa04d8b1",
  "fixtures/markdown/dicebag.dicebag.md":
    "9590507ceb5c3532f4c967fbc3198282fe523259d265008ec398f06b747dee19",
  "fixtures/markdown/gooey.gooey.md":
    "b2a05e8e10f3bfcbfc756d18ac1916dddbfffc7c844b3a2c3336f54a4b57b329",
  "fixtures/markdown/in.accelerometer.md":
    "fc229088954b9e7bbb961ecd1d17d93efb0eae20f5c04e80070cb01ae3571d04",
  "fixtures/markdown/in.button.md":
    "fb1a285d5bf2744aed3464ca90e3c2c6ed9710c083a65117a9172d355e06f3dd",
  "fixtures/markdown/in.cursor.md":
    "c2b1b47ba3814e1e4358cfd16de73a56ecf625903c43056b4a76cb3c185096f3",
  "fixtures/markdown/in.gesture.md":
    "1b5c8f39a703dce5a90d7b0060523c9741250795f8a9833467dc1f74b95da548",
  "fixtures/markdown/in.mapper.md":
    "5768cac1137dff4ad113ce1abce53143d21f356863e398652b77755fa6bb53ab",
  "fixtures/markdown/in.onscreen.md":
    "1515b0bf7a0dff36af3ed6b3df028be86dbf4f798b4c7f9454d72f71c3befd2f",
  "fixtures/markdown/in.state.md":
    "3d5b1e4a4b5b6f1dad95c25a6e68bc0f2378f5573052ab238478b09d9ddd7dad",
  "fixtures/markdown/in.textbox.md":
    "82265179af4e80ee0f03d05b35307acf956a361a869f10894da64542c9cdb5ee",
  "fixtures/markdown/metrics.fps.md":
    "940950ba4e352746634cfcc267d10bbca4094b8e481a7b342eadc68afbdf158f",
  "fixtures/markdown/metrics.mem.md":
    "940950ba4e352746634cfcc267d10bbca4094b8e481a7b342eadc68afbdf158f",
  "fixtures/markdown/monarch.monarch.md":
    "0fd171fbc8b3d7c04457665640ee46a902bbc8aba63c68789a473e89f1cb0451",
  "fixtures/markdown/monarch.transitions.gui.md":
    "7eab84dbe50480492be688804481d9ad322c281579816eb95364c0521e75e8e8",
  "fixtures/markdown/orthographic.camera.md":
    "688407034ede0cc4b3ddd6d79609d0e965123c6781724828ac9ced401c6b9995",
  "fixtures/markdown/persist.persist.md":
    "6af89cba9ca8ff710105cec1f298299e580b194988979d4d40fdb0a4819f72eb",
  "fixtures/markdown/platypus.platypus.md":
    "fcb7d098d898c0e4cc7bf97f6f82d17d11efa9420f8604d29bfa5de814288f1f",
  "fixtures/markdown/rendy.rendy.md":
    "3f00ba31525ec646be07899a66a2545fb4d321f0aac4e23d83d00318e5d17d1a",
  "fixtures/markdown/richtext.richtext.md":
    "c5cdd5e925f00d3e5ab61ddaa1b219cb9d082392c2b84294abf88a565d15808f",
  "fixtures/markdown/starly.starly.md":
    "2499999d90adccc01b253e41da1a6adfb97ee4f3d46481a61f5ae7b362fe0aa7",
  "fixtures/markdown/yagames.yagames.md":
    "2e62c65b4324e5fa1878cdefaea71dbf7e0e4951ac7094ba24a659754f6a8f3e",
  "fixtures/ts-defold/bzAnim.bzAnim.d.ts":
    "fc109b8425acadead33b4125e822f8d19634c10c2d7a9022027ed22d6c082191",
  "fixtures/ts-defold/dicebag.dicebag.d.ts":
    "b8ce58a7ea3a57842fd305a659e042e4c6fea4fd4e5b0fae7fb07b79872a12f6",
  "fixtures/ts-defold/gooey.gooey.d.ts":
    "ccb14cf1d623756f7eb014c63b47e86369d42a89dabb7fbc267e2ca580d449e3",
  "fixtures/ts-defold/in.accelerometer.d.ts":
    "aaeed91bd30ab3fd1f1b5f7753d63daf30d4fcea298b8cf98fa9768d57682db1",
  "fixtures/ts-defold/in.button.d.ts":
    "4c6b0b341a3f210f4f3ffbdaa1d19d540f060a2dce55d536063228d83bee6d09",
  "fixtures/ts-defold/in.cursor.d.ts":
    "8c93001ed55f49be295ab6a7e24a77d9fae4a3f135e24fd13248f5441e2c0a0b",
  "fixtures/ts-defold/in.gesture.d.ts":
    "2afe9c80f2ea097f9152d0b90d61f846e6c6e3cf793dcae3cf99c825ebe99592",
  "fixtures/ts-defold/in.keyboard.d.ts":
    "1ac5b5ef0fb01e7d7b46d39644dcee1211fe6563139eeea1b3b56f8c68b7445a",
  "fixtures/ts-defold/in.mapper.d.ts":
    "d52500f818de9d3b5c36ea878ee2b853ab26e4478eea4039948bb808529c93a8",
  "fixtures/ts-defold/in.onscreen.d.ts":
    "344895d550bbc2b1cdb67ee05494c62ec6dff3fc9222f8458d3020deea11ad4e",
  "fixtures/ts-defold/in.state.d.ts":
    "9ab6bf43d2cd3b5f0e3a3a83bfac177dd831394e2d10ddaa3a245fb19b666a79",
  "fixtures/ts-defold/in.textbox.d.ts":
    "efab32ed7edc3d697ef23aea960dfc573dd76142db78d4511dc67addd3926406",
  "fixtures/ts-defold/in.triggers.d.ts":
    "57bbece64fcb6b569f1af629a9c9731cc6c955b555058e5106baee7799540909",
  "fixtures/ts-defold/metrics.fps.d.ts":
    "76e42a10d9a4697ae13b4cb0871ba634d65256d44404991ff2ae2f12f4e0ad6a",
  "fixtures/ts-defold/metrics.mem.d.ts":
    "a0538630062f9fbee67c196fb1c75b3f58817434b0749e4309f4866853b3d592",
  "fixtures/ts-defold/monarch.monarch.d.ts":
    "7fd159bb27f893cca8a1e963e4b8ab506c761df54fa3d2f5a7334f34a58edeca",
  "fixtures/ts-defold/monarch.transitions.easings.d.ts":
    "e9c3ae5b778ac553533dd1cd9a0e40ef2caecfa0a93106aa1e63386f5473d0f7",
  "fixtures/ts-defold/monarch.transitions.gui.d.ts":
    "09e18232dcab53355d304796a02fe4ee0027a4e3b44fc0ff20b78164eb6cd1cc",
  "fixtures/ts-defold/platypus.platypus.d.ts":
    "d1e55bb7a6bd64ea1fe31ed64e5fc4ccb4b42fa2e697851ce5afdc67ea27a959",
  "fixtures/ts-defold/rendy.rendy.d.ts":
    "3b7d93b2abeeb5f4089dfb10110648ff66a07a3533b8e1e3b1edc07c8d3ddf03",
  "fixtures/ts-defold/richtext.color.d.ts":
    "4cae10480441a24c1f233ae96cf3a02223e5c9989712c733d3d517dbc7df2a38",
  "fixtures/ts-defold/richtext.richtext.d.ts":
    "759ba92654f34cfc89aa300fa06ea36d1a52b1e3778e836e89f1f63ec56813fd",
  "fixtures/ts-defold/richtext.tags.d.ts":
    "722f9bcd88d44a5c17e5b1b49d9060759be46467658599c3fe2fae3f172b8b11",
  "fixtures/ts-defold/starly.starly.d.ts":
    "3e5f74791b8591f169486790c53850115a817c9988d549de7dddcfb80564e951",
};

describe("the vendored snapshots the recorded verdicts were derived from", () => {
  test("every pinned snapshot still hashes to its recorded digest", () => {
    const drifted = Object.entries(VENDORED_FIXTURE_HASHES)
      .filter(([path]) => existsSync(join(PACKAGE_ROOT, path)))
      .filter(([path, digest]) => fixtureDigest(path) !== digest)
      .map(([path]) => driftRemedy(path).message);
    expect(drifted).toEqual([]);
  });

  test("every pinned path still exists, so a renamed snapshot reds", () => {
    expect(Object.keys(VENDORED_FIXTURE_HASHES).length).toBeGreaterThan(0);
    expect(
      Object.keys(VENDORED_FIXTURE_HASHES).filter((path) => !existsSync(join(PACKAGE_ROOT, path))),
    ).toEqual([]);
  });

  test("the pin covers every snapshot a recorded verdict reads", () => {
    expect(verdictFixturePaths().filter((path) => !(path in VENDORED_FIXTURE_HASHES))).toEqual([]);
  });

  test("an authored-lane snapshot's drift remedy permits updating the digest", () => {
    expect(driftRemedy("fixtures/authored/persist.persist.d.ts").digestMayBeUpdated).toBe(true);
    expect(driftRemedy("fixtures/markdown/persist.persist.md").digestMayBeUpdated).toBe(false);
  });

  test("the two lanes do not share a remedy", () => {
    expect(driftRemedy("fixtures/authored/persist.persist.d.ts").message).not.toBe(
      driftRemedy("fixtures/markdown/persist.persist.md").message,
    );
  });

  test("every pinned authored-lane path is a target the repo declares as its own", () => {
    const declared = new Set(readAuthoredTargets(PACKAGE_ROOT).map((target) => target.authored));
    expect(
      Object.keys(VENDORED_FIXTURE_HASHES).filter(
        (path) => path.startsWith("fixtures/authored/") && !declared.has(path),
      ),
    ).toEqual([]);
  });
});

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
    // Exactly the `## monarch.<fn>(...)` signature sections of README_API.md. The
    // four `## monarch.SCREEN_TRANSITION_*` constant headings carry no parens and
    // stay out of the surface, which is why they show up as missing members below.
    expect(markdownMembers).toEqual([
      "add_listener",
      "back",
      "bottom",
      "clear",
      "data",
      "debug",
      "hide",
      "is_busy",
      "is_preloading",
      "is_top",
      "is_visible",
      "on_focus_change",
      "on_post",
      "on_transition",
      "post",
      "preload",
      "remove_listener",
      "replace",
      "screen_exists",
      "set_timestep_below_popup",
      "show",
      "top",
      "unload",
      "when_preloaded",
    ]);
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
    expect(markdownMembers).toEqual([
      "characters",
      "create",
      "length",
      "on_click",
      "plaintext",
      "remove",
      "tagged",
      "truncate",
    ]);
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
    expect(markdownMembers).toEqual(["create", "exists", "flush", "load", "save", "write"]);
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

  // The retired ts-defold snapshot is gone, so the recorded verdict resolves
  // through `severedSource` at the vendored fork — which carries the upstream
  // corrections on top of it, and is therefore what the numbers below read.
  const tsSurface = () =>
    tsDefoldMembers(
      readFileSync(
        join(PACKAGE_ROOT, targetFor("yagames.yagames", YAGAMES.severedSource).fixture),
        "utf8",
      ),
    );

  // The refusal is a dialect gap, not an absent API doc: the snapshot carries 70
  // backticked `#### <recv>.<fn>(...)` headings (66 `yagames.`, 4 `sitelock.`),
  // 47 `**Parameters:**` and 22 `**Returns:**` markers, and 76 typed bullets in
  // the `` `x` <kbd>type</kbd> `` form — never the `` `x` (type) `` spelling
  // `TYPED_BULLET` accepts, so the parser reads zero of them. Those figures are
  // properties of the vendored fixture rather than of the parser, and the digest
  // pin above is what holds them; the record's header comment reads the same.
  test("the front-end refuses the snapshot", () => {
    expect(() => parseMarkdownApi(readme(), "yagames.yagames")).toThrow(/signature/);
  });

  // Exact rather than a count, because this is also what gates the sticky-banner
  // correction: the three replacement members are documented under `yagames.`, so
  // any misspelling of one lands it in this list and reds the test.
  test("dialect support could not flip the decision — 2 documented-member gaps remain", () => {
    // The generous reading: every heading regardless of receiver, which is more
    // than the parser's uniform-prefix rule would allow through.
    const documented = new Set(headings().map(([, , member]) => member as string));
    expect(tsSurface().filter((member) => !documented.has(member))).toEqual([
      "leaderboards_init",
      "player_get_id",
    ]);
  });

  test("reading only the `yagames.` prefix the parser would enforce, the gap widens to 6", () => {
    const documented = new Set(
      headings()
        .filter(([, receiver]) => receiver === "yagames")
        .map(([, , member]) => member as string),
    );
    // Exact rather than a count for the same reason as the test above, and it is
    // what makes the record's "the same 2 plus the 4 sitelock-receiver members"
    // reading checkable rather than asserted.
    expect(tsSurface().filter((member) => !documented.has(member))).toEqual([
      "add_domain",
      "get_current_domain",
      "is_release_build",
      "leaderboards_init",
      "player_get_id",
      "verify_domain",
    ]);
  });

  test("the comment-strip fix is load-bearing: the fixture surface is 50 members", () => {
    // `tsDefoldMembers` — the comparator's own surface reader — over the forked
    // snapshot; too long to write out, so the samples below carry the specifics.
    const surface = tsSurface();
    expect(surface.length).toBe(50);
    // Members a `//*`-blind stripper silently dropped, sampled at both ends.
    expect(surface).toContain("adv_show_fullscreen_adv");
    expect(surface).toContain("player_get_data");
  });

  // Without the dropped row the lookup would throw, so the recorded verdict is
  // only resolvable because `severedSource` supplies both fields it used to read.
  test("the verdict still resolves once the ts-defold row is gone", () => {
    expect(targetFor("yagames.yagames", YAGAMES.severedSource).fixture).toBe(
      "fixtures/authored/yagames.yagames.d.ts",
    );
    expect(classificationModule("yagames.yagames", YAGAMES.severedSource)).toBe("yagames.yagames");
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
    expect(doc.elements.map((e) => e.name)).toEqual(PARSED_MEMBERS.map((m) => `gooey.${m}`));
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

  // Why the term fires on this member alone: the `### gooey.dynamic_list(...)`
  // heading declares 11 arguments, and the contiguous bullet run after its
  // `**PARAMETERS**` marker documents 10 of them — `root_id` is named in the
  // heading and never in the list. (The run ends at the blank line before "The
  // `config` table can contain the following values:", whose own two bullets are
  // option keys rather than parameters; a boundary drawn at `**RETURN**` would
  // read the list as 12.)
  test("dynamic_list's PARAMETERS block documents one argument fewer than its heading", async () => {
    const { signatureLossMembers } = await comparisonFor(GOOEY, "gooey");
    expect(signatureLossMembers).toEqual(["dynamic_list"]);
  });

  test("the ts-defold surface the comparison runs against is these 12 functions", () => {
    const surface = tsDefoldMembers(
      readFileSync(join(PACKAGE_ROOT, "fixtures/ts-defold", "gooey.gooey.d.ts"), "utf8"),
    );
    expect(surface).toEqual([
      "button",
      "checkbox",
      "dynamic_list",
      "group",
      "horizontal_dynamic_list",
      "horizontal_static_list",
      "input",
      "radio",
      "static_list",
      "vertical_dynamic_list",
      "vertical_scrollbar",
      "vertical_static_list",
    ]);
  });

  test("widening the header range would trade surface-loss for signature-loss, not fix it", () => {
    const lines = readme().split("\n");
    // The README writes its 8 parsed members as `###` and the 4 missing list
    // variants as `#####`; the missing four are already pinned by name above.
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

  const receiverComparison = (module: string) =>
    comparisonForMarkdown(filterToReceiver(readme(module), module), `metrics.${module}`);

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

describe("rendy signature-loss evidence at pin b72ee2419f2cd5e1a2281e1eed5cc4081b5cbcc3", () => {
  const readme = () => fixtureText(RENDY, decisionFor(RENDY, "rendy"));

  // Every member of the parsed surface; nine of these headings carry the
  // `function ` keyword upstream, which is what the header widening lifted.
  const MEMBERS = [
    "cancel_shake",
    "create_camera",
    "destroy_camera",
    "get",
    "get_display_size",
    "get_stack",
    "get_window_size",
    "screen_to_world",
    "set",
    "shake",
    "world_to_screen",
  ];

  test("the keyword-prefixed headings are read — the snapshot parses to all 11 members", async () => {
    const { markdownMembers } = await comparisonFor(RENDY, "rendy");
    expect(markdownMembers).toEqual(MEMBERS);
  });

  test("the two missing members are genuinely undocumented upstream", async () => {
    const { missingMembers, addedMembers } = await comparisonFor(RENDY, "rendy");
    expect(missingMembers).toEqual(["animate", "cancel_animations"]);
    expect(addedMembers).toEqual([]);
    // Neither name appears anywhere in the README — not as a heading, not in
    // prose. The only near-match is the word "animated" in the shake section.
    expect(/\brendy\.(animate|cancel_animations)\b/.test(readme())).toBe(false);
  });

  test("the signature collapse covers every shared member and is the leading term", async () => {
    const { emitted, signatureLossMembers } = await comparisonFor(RENDY, "rendy");
    // No `**PARAMETERS**` and no `**RETURN**` block anywhere in the README, so
    // `get_stack(screen_x, screen_y): CameraId[]` and `screen_to_world(camera_id,
    // screen_position): vmath.vector3` both emit as zero-arity `(): void`.
    expect(/^\*\*(PARAMETERS?|RETURNS?)\*\*\s*$/m.test(readme())).toBe(false);
    expect(emitted).toContain("function get_stack(): void;");
    expect(emitted).toContain("function screen_to_world(): void;");
    expect(signatureLossMembers).toEqual(MEMBERS);
  });

  test("no other term fires, so the record cannot be misread as gooey's or metrics' class", async () => {
    const { decision, downgradedMembers, optionalityLossMembers } = await comparisonFor(
      RENDY,
      "rendy",
    );
    expect(decision).toBe("no-go");
    // A zero-arity stub carries no type tokens, so there is no downgrade; and
    // with no parameters at all there is no optionality to lose.
    expect(downgradedMembers).toEqual([]);
    expect(optionalityLossMembers).toEqual([]);
    expect(decisionFor(RENDY, "rendy").reason).toBe("signature-loss");
  });

  test("the header widening is what lifted the surface: stripping the keyword changes nothing", () => {
    const asCommitted = parseMarkdownApi(readme(), "rendy.rendy");
    const stripped = parseMarkdownApi(
      readme().replace(/^(#{2,3}\s+)function\s+/gm, "$1"),
      "rendy.rendy",
    );
    expect(stripped.elements.map((e) => e.name)).toEqual(asCommitted.elements.map((e) => e.name));
    // Naming the surface keeps the equality above from being two empty parses
    // agreeing, and pins that the widening is what recovers the keyword headings.
    expect([...asCommitted.elements.map((e) => e.name)].sort()).toEqual(
      MEMBERS.map((m) => `rendy.${m}`),
    );
  });

  test("a keyword-prefixed heading closes the preceding section", () => {
    // Before the widening the 9 unmatched headings did not end a section, so the
    // rest of the API section pooled into `destroy_camera`'s description.
    const doc = parseMarkdownApi(readme(), "rendy.rendy");
    const destroy = doc.elements.find((e) => e.name === "rendy.destroy_camera");
    expect(destroy?.description).toBe(
      "Destroys a camera. This function is called automatically by the *rendy.go* game object.",
    );
  });
});

describe("platypus shared-document evidence at tag 4.3.1", () => {
  const readme = () => fixtureText(PLATYPUS, decisionFor(PLATYPUS, "platypus"));

  // The 12 ts-defold constants, sorted as `compareFidelityToTsDefold` reports
  // them: the 7 message hashes and the 5 `DIR_*` direction values.
  const CONSTANTS = [
    "DIR_ALL",
    "DIR_DOWN",
    "DIR_LEFT",
    "DIR_RIGHT",
    "DIR_UP",
    "DOUBLE_JUMP",
    "FALLING",
    "GROUND_CONTACT",
    "JUMP",
    "WALL_CONTACT",
    "WALL_JUMP",
    "WALL_SLIDE",
  ];

  // The 19 `instance.` methods, sorted the same way.
  const INSTANCE_METHODS = [
    "abort_jump",
    "abort_wall_slide",
    "down",
    "force_jump",
    "has_ground_contact",
    "has_wall_contact",
    "is_falling",
    "is_jumping",
    "is_wall_jumping",
    "is_wall_sliding",
    "jump",
    "left",
    "move",
    "on_message",
    "right",
    "set_collisions",
    "toggle_debug",
    "up",
    "update",
  ];

  // The most generous reading available: rewrite the instance receiver to the
  // module's own so the uniform-prefix invariant accepts the whole document.
  const unified = () => readme().replace(/^(#{2,3}\s+)instance\./gm, "$1platypus.");

  test("the parser refuses the shared document, naming both receivers", () => {
    expect(() => parseMarkdownApi(readme(), "platypus.platypus")).toThrow(
      /non-uniform module prefix across headers: instance, platypus/,
    );
  });

  test("the dialect is not the blocker — it is the one the front-end already reads", () => {
    const text = readme();
    expect(/^\*\*PARAMETERS\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*RETURN\*\*\s*$/m.test(text)).toBe(true);
    expect(text).not.toContain("<kbd>");
    // Every signature heading is a bare `###` — none carries rendy's `function`
    // keyword, and none is demoted to `##`.
    // The document writes 20 of them, one per member the unified reading below
    // recovers; what matters here is the level and receiver, not the tally.
    const headings = text.split("\n").filter((line) => /^#{1,6}\s+\w+\.\w+\(.*\)\s*$/.test(line));
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.every((line) => /^### (?:platypus|instance)\./.test(line))).toBe(true);
  });

  test("the platypus receiver alone parses to just `create` and loses every constant", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(filterToReceiver(readme(), "platypus"), "platypus.platypus");
    expect(doc.elements.map((e) => e.name.split(".").pop())).toEqual(["create"]);
    expect(missingMembers).toEqual(CONSTANTS);
    expect(addedMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["create"]);
    expect(decision).toBe("no-go");
  });

  test("the generous unified reading adds only hoisted instance methods, and still loses the constants", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(unified(), "platypus.platypus");
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(
      ["create", ...INSTANCE_METHODS].sort(),
    );
    expect(missingMembers).toEqual(CONSTANTS);
    // Not a surface gain: these are `create`'s returned-instance methods lifted
    // into module scope, which is wrong rather than incomplete.
    expect(addedMembers).toEqual(INSTANCE_METHODS);
    expect(downgradedMembers).toEqual(["create"]);
    expect(decision).toBe("no-go");
  });

  test("the instance receiver alone loses the whole ts-defold surface", async () => {
    const { doc, decision, missingMembers, addedMembers, downgradedMembers } =
      await comparisonForMarkdown(
        filterToReceiver(readme(), "instance").replace(/^(#{2,3}\s+)instance\./gm, "$1platypus."),
        "platypus.platypus",
      );
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(INSTANCE_METHODS);
    expect(missingMembers).toEqual(["create", ...CONSTANTS].sort());
    expect(addedMembers).toEqual(INSTANCE_METHODS);
    expect(downgradedMembers).toEqual([]);
    expect(decision).toBe("no-go");
  });

  test("the constants are unreachable under every reading", () => {
    const text = readme();
    // The 5 direction values appear only inside a code example, never as a
    // heading; the 7 message hashes are paren-less `### platypus.<NAME>`
    // headings under `## Messages` that `HEADER` does not match.
    for (const constant of CONSTANTS) {
      expect(new RegExp(`^#{2,3}\\s+platypus\\.${constant}\\(`, "m").test(text)).toBe(false);
    }
    for (const message of ["FALLING", "GROUND_CONTACT", "JUMP", "WALL_SLIDE"]) {
      expect(text).toContain(`### platypus.${message}\n`);
    }
  });

  test("neither loss class rendy and metrics recorded fires here", async () => {
    for (const markdown of [filterToReceiver(readme(), "platypus"), unified()]) {
      const { signatureLossMembers, optionalityLossMembers } = await comparisonForMarkdown(
        markdown,
        "platypus.platypus",
      );
      expect(signatureLossMembers).toEqual([]);
      expect(optionalityLossMembers).toEqual([]);
    }
  });

  test("the comparator never sees the config and instance interfaces, so the recorded loss is a floor", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", "platypus.platypus.d.ts"),
      "utf8",
    );
    // `MEMBER_DECL` reads top-level `function`/`const` only, so the 12-field
    // `PlatypusConfig` and the 19-method `PlatypusInstance` are outside the
    // comparison even though the markdown emit collapses both to a bare record.
    expect(tsDefold).toContain("interface PlatypusConfig");
    expect(tsDefold).toContain("interface PlatypusInstance");
    expect(tsDefoldMembers(tsDefold).sort()).toEqual(["create", ...CONSTANTS].sort());
  });

  test("the recorded reason is the widened shared-document class", () => {
    expect(decisionFor(PLATYPUS, "platypus").reason).toBe("shared-document");
  });
});

describe("starly doc-dialect evidence at commit 85d1b2a", () => {
  const readme = () => fixtureText(STARLY, decisionFor(STARLY, "starly"));

  // The 14 documented functions, sorted as `compareFidelityToTsDefold` reports
  // them.
  const FUNCTIONS = [
    "activate",
    "cancel_shake",
    "create",
    "destroy",
    "get_offset",
    "get_projection",
    "get_tight_world_area",
    "get_view",
    "get_viewport",
    "get_world_area",
    "is_shaking",
    "screen_to_world",
    "shake",
    "world_to_screen",
  ];

  // The 7 constants `CoreModule` declares, sorted as the comparator reports them.
  const CONSTANT_MEMBERS = [
    "c_behavior_center",
    "c_behavior_expand",
    "c_behavior_mixed",
    "c_behavior_stretch",
    "c_display_height",
    "c_display_ratio",
    "c_display_width",
  ];

  // The most generous reading available: rewrite all five dialect axes and reduce
  // `[name = default]` to `[name]` so `bracketedArgs` reads the optional slots.
  // Test-local for gooey's reason — the verdict this produces shows a
  // dialect-aware front-end would buy five new parser branches and no decision
  // change.
  const generous = () =>
    readme()
      .split("\n")
      .map((line) =>
        line
          .replace(/^(#{2,3}\s+)`(.+)`\s*$/, "$1$2")
          .replace(/^(#{2,3}\s+.*)$/, (heading) =>
            heading.replace(/\[\s*([A-Za-z_]\w*)\s*=[^\]]*\]/g, "[$1]"),
          )
          .replace(/^\*\*Parameters\*\*\s*$/, "**PARAMETERS**")
          .replace(/^\*\*Returns\*\*\s*$/, "**RETURN**")
          .replace(/^\*\s+`([^`]+)`:\s*`([^`]+)`\s*(.*)$/, "* `$1` ($2) - $3")
          .replace(/^\*\s+`([^`]+)`(?:\s+or\s+`([^`]+)`)?\s*$/, (_match, first, second) =>
            second === undefined
              ? `* \`result\` (${first}) - `
              : `* \`result\` (${first}|${second}) - `,
          ),
      )
      .join("\n")
      .replace(/^(\*\*(?:PARAMETERS|RETURN)\*\*)\n\n/gm, "$1\n");

  test("the front-end refuses the snapshot — no heading reads as a signature", () => {
    expect(() => parseMarkdownApi(readme(), "starly.starly")).toThrow(/no .*API signature section/);
  });

  test("the dialect, not the content, is the blocker — 14 wrapped headings for 14 functions", () => {
    const wrapped = readme()
      .split("\n")
      .filter((line) => /^#{2,3}\s+`[A-Za-z_]\w*\.[A-Za-z_]\w*\(.*\)`\s*$/.test(line));
    // Tied to `FUNCTIONS` by name rather than by tally, so this reading of the
    // snapshot has to agree with the surface the generous parse below recovers.
    expect(wrapped.map((line) => line.replace(/^#{2,3}\s+`\w+\.(\w+)\(.*$/, "$1")).sort()).toEqual(
      FUNCTIONS,
    );
    expect(wrapped.every((line) => line.startsWith("### `m_starly."))).toBe(true);
  });

  test("the marker and bullet axes are the corpus concepts in spellings the parser does not match", () => {
    const text = readme();
    expect(/^\*\*Parameters\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*Returns\*\*\s*$/m.test(text)).toBe(true);
    expect(/^\*\*PARAMETERS\*\*\s*$/m.test(text)).toBe(false);
    expect(/^\*\*RETURN\*\*\s*$/m.test(text)).toBe(false);
    // Typed bullets are colon-typed, never the `(type) - ` form `TYPED_BULLET`
    // accepts.
    expect(/^\*\s+`id`:\s*`hash`/m.test(text)).toBe(true);
    expect(/^\*\s+`[^`]+`\s*\([^)]*\)/m.test(text)).toBe(false);
  });

  test("every marker is separated from its bullets by a blank line, which closes the list", () => {
    const lines = readme().split("\n");
    const markers = lines.filter((line) => /^\*\*(?:Parameters|Returns)\*\*\s*$/.test(line));
    expect(markers.length).toBeGreaterThan(0);
    lines.forEach((line, index) => {
      if (/^\*\*(?:Parameters|Returns)\*\*\s*$/.test(line)) expect(lines[index + 1]).toBe("");
    });
  });

  test("the generous reading lifts all 14 functions and is still no-go", async () => {
    const {
      doc,
      decision,
      missingMembers,
      addedMembers,
      downgradedMembers,
      signatureLossMembers,
      optionalityLossMembers,
    } = await comparisonForMarkdown(generous(), "starly.starly");
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
    // The README documents the constants as prose bullets only, so no reading of
    // it reaches them; the 14 lifted headings match `CoreModule`'s 14 methods by
    // name, which is why nothing is added.
    expect(missingMembers).toEqual(CONSTANT_MEMBERS);
    expect(addedMembers).toEqual([]);
    // `positions: vmath.vector3[]` emits as `Record<string | number, unknown>`.
    expect(downgradedMembers).toEqual(["get_tight_world_area"]);
    // Both drop their coordinate parameters — 4 and 3 slots emit as 2.
    expect(signatureLossMembers).toEqual(["screen_to_world", "world_to_screen"]);
    // `durationScalar?`/`radiusScalar?` emit as required `arg4`/`arg5`.
    expect(optionalityLossMembers).toEqual(["shake"]);
    expect(decision).toBe("no-go");
  });

  test("the `export =` handle resolves, so the verdict rests on named loss terms", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", "starly.starly.d.ts"),
      "utf8",
    );
    expect(tsDefold).toContain("export = exportThis;");
    // `Starley = CameraMap & Readonly<CoreModule>`: the 21 real members live
    // inside `CoreModule` and reach the comparison through the handle, while the
    // 8 fields inside `CameraMap`'s `LuaMap` value stay out of it.
    expect(tsDefoldMembers(tsDefold)).toEqual([...FUNCTIONS, ...CONSTANT_MEMBERS].sort());
    const { opaqueTsDefoldSurface } = compareFidelityToTsDefold(
      "function create(): void;",
      tsDefold,
    );
    expect(opaqueTsDefoldSurface).toBe(false);
  });

  test("the constants and the camera map are unreachable under every reading", () => {
    const text = readme();
    for (const constant of [
      "display_width",
      "display_height",
      "display_ratio",
      "behavior_center",
      "behavior_expand",
      "behavior_mixed",
      "behavior_stretch",
    ]) {
      expect(text).toContain(`* \`starly.${constant}\`:`);
      expect(new RegExp(`^#{2,3}.*starly\\.${constant}\\(`, "m").test(text)).toBe(false);
    }
    for (const field of ["behavior", "viewport_x", "near", "far", "zoom"]) {
      expect(text).toContain(`* \`starly[id].${field}\`:`);
    }
  });

  test("even the generous emit drops 3 parameters across 2 members", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "starly.starly");
    // Both headings declare more arguments than their `**Parameters**` list
    // documents, so the emit keeps only the documented ones.
    expect(emitted).toContain("function screen_to_world(id: Hash, visible?: boolean)");
    expect(emitted).toContain("function world_to_screen(id: Hash, visible?: boolean)");
    expect(readme()).toContain("screen_to_world(id, screen_x, screen_y, [visible = false])");
    expect(readme()).toContain("world_to_screen(id, world_position, [visible = false])");
  });

  test("`shake`'s bracketed bullet names cost both their identity and their optionality", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "starly.starly");
    // The bullets repeat the heading's brackets in the name — `* \`[duration_scalar]\`:
    // \`number\`` — which is no identifier, so the emitter synthesizes positional
    // names and `bracketedArgs` never marks the slots optional.
    expect(readme()).toContain("* `[duration_scalar]`: `number`");
    expect(emitted).toContain(
      "function shake(id: Hash, count: number, duration: number, radius: number, arg4: number, arg5: number)",
    );
  });

  test("`get_tight_world_area` downgrades its `table` parameter", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "starly.starly");
    expect(emitted).toContain("positions: Record<string | number, unknown>");
    expect(
      readFileSync(join(PACKAGE_ROOT, "fixtures/ts-defold", "starly.starly.d.ts"), "utf8"),
    ).toContain("positions: vmath.vector3[]");
  });

  test("the recorded reason is doc-dialect", () => {
    expect(decisionFor(STARLY, "starly").reason).toBe("doc-dialect");
  });
});

describe("dicebag type-downgrade evidence at tag 0.3", () => {
  const readme = () => fixtureText(DICEBAG, decisionFor(DICEBAG, "dicebag"));

  // The 11 documented functions, sorted as `compareFidelityToTsDefold` reports
  // them. Both surfaces carry exactly these.
  const FUNCTIONS = [
    "bag_create",
    "bag_draw",
    "bag_reset",
    "flip_coin",
    "roll_custom_dice",
    "roll_dice",
    "roll_special_dice",
    "set_up_rng",
    "table_create",
    "table_reset",
    "table_roll",
  ];

  const DOWNGRADED = ["roll_custom_dice", "table_create", "table_roll"];

  // The one remaining fixable gap rewritten, and only it: the `set_up_rng` heading
  // bracketed so `bracketedArgs` reads the optionality the bullet states only in
  // prose. Test-local for `filterToReceiver`'s reason — what it measures is that
  // the front-end change would not move the verdict.
  const generous = () =>
    readme().replace(/^(#{2,3}\s+dicebag\.set_up_rng\()seed(\)\s*)$/m, "$1[seed]$2");

  test("the front-end reads the snapshot as-is — 11 elements, no refusal", () => {
    const doc = parseMarkdownApi(readme(), "dicebag.dicebag");
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
  });

  test("the surfaces match one-for-one", async () => {
    const {
      missingMembers,
      addedMembers,
      markdownMembers,
      tsDefoldMembers: tsMembers,
    } = await comparisonFor(DICEBAG, "dicebag");
    expect(missingMembers).toEqual([]);
    expect(addedMembers).toEqual([]);
    expect(tsMembers).toEqual(FUNCTIONS);
    expect(markdownMembers).toEqual(FUNCTIONS);
  });

  test("no member's signature collapses and the ts-defold surface is not opaque", async () => {
    const { signatureLossMembers, opaqueTsDefoldSurface } = await comparisonFor(DICEBAG, "dicebag");
    expect(signatureLossMembers).toEqual([]);
    expect(opaqueTsDefoldSurface).toBe(false);
  });

  test("type precision alone drives the no-go — three downgrades and one optionality loss", async () => {
    const { downgradedMembers, optionalityLossMembers, decision } = await comparisonFor(
      DICEBAG,
      "dicebag",
    );
    expect(downgradedMembers).toEqual(DOWNGRADED);
    expect(optionalityLossMembers).toEqual(["set_up_rng"]);
    expect(decision).toBe("no-go");
  });

  test("the comma split recovers the `id` union the document always stated", async () => {
    expect(readme()).toContain("* `id` (string, number, hash) - ");
    const { emitted } = await comparisonFor(DICEBAG, "dicebag");
    // ts-defold spells the third alternative with its own ambient `hash`; the
    // shared emitter maps the token to this repo's `Hash`, which the comparator
    // reads as the same precision rather than a downgrade.
    expect(emitted).toContain("function bag_draw(id: string | number | Hash)");
  });

  test("the generous reading clears the one fixable gap and is still no-go", async () => {
    const { doc, decision, downgradedMembers, optionalityLossMembers } =
      await comparisonForMarkdown(generous(), "dicebag.dicebag");
    expect([...doc.elements.map((e) => e.name.split(".").pop())].sort()).toEqual(FUNCTIONS);
    expect(optionalityLossMembers).toEqual([]);
    expect(downgradedMembers).toEqual(["roll_custom_dice", "table_create", "table_roll"]);
    expect(decision).toBe("no-go");
  });

  test("the residue is upstream underspecification no parser can fix", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "dicebag.dicebag");
    // `sides` and `rollable_table` are documented `(table)`, and `table_roll`
    // returns `(any)`; ts-defold types all three concretely.
    expect(emitted).toContain("sides: Record<string | number, unknown>");
    expect(emitted).toContain("rollable_table: Record<string | number, unknown>");
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, "fixtures/ts-defold", "dicebag.dicebag.d.ts"),
      "utf8",
    );
    expect(tsDefold).toContain("sides: Array<[number, number]>");
    expect(tsDefold).toContain("rollable_table: Array<[number, any, boolean?]>");
  });

  test("the recorded reason is type-downgrade", () => {
    expect(decisionFor(DICEBAG, "dicebag").reason).toBe("type-downgrade");
  });
});

describe("bzAnim no-signature-section evidence at tag v.1.2", () => {
  const readme = () => fixtureText(BZANIM, decisionFor(BZANIM, "bzLibrary"));

  // The heading form `parse-markdown-api` reads as a signature section.
  const SIGNATURE_HEADING = /^#{2,3}\s+[A-Za-z_]\w*\.[A-Za-z_]\w*\(.*\)\s*$/;

  // The 3 constants and 6 functions of the retained ts-defold surface, sorted as
  // `compareFidelityToTsDefold` reports them.
  const TS_DEFOLD_MEMBERS = [
    "DEBUG_LEVEL",
    "INFO_LEVEL",
    "TRACE_LEVEL",
    "animate",
    "animateSequence",
    "cancel",
    "info",
    "isReady",
    "setDebugLevel",
  ];

  const SHARED_FUNCTIONS = [
    "animate",
    "animateSequence",
    "cancel",
    "info",
    "isReady",
    "setDebugLevel",
  ];

  // The most generous reading available: hoist every function the README names
  // anywhere — its Lua snippets call them as `bz.<fn>(...)` — into the signature
  // headings the document itself never writes. Test-local for `filterToReceiver`'s
  // reason: what it measures is that the verdict holds even against a front-end
  // that could read this document, so the decision does not rest on the dialect
  // gap being fixable.
  const generous = () => {
    const named = [
      ...new Set([...readme().matchAll(/\bbz\.([A-Za-z_]\w*)\(/g)].map((m) => m[1] as string)),
    ].sort();
    return [readme(), "", ...named.map((fn) => `### bzAnim.${fn}()\n`)].join("\n");
  };

  test("the front-end refuses the snapshot for the right reason — no signature section", () => {
    // Not `/non-uniform module prefix/`: there is no receiver to disagree about.
    expect(() => parseMarkdownApi(readme(), "bzAnim.bzLibrary")).toThrow(
      /no .*API signature section/,
    );
  });

  test("not one heading reads as a signature, and the prose headings are all there is", () => {
    const headings = readme()
      .split("\n")
      .filter((line) => /^#{1,6}\s/.test(line));
    expect(headings.filter((line) => SIGNATURE_HEADING.test(line))).toEqual([]);
    // The snapshot is refused because the document documents prose, not because
    // the fixture is empty.
    expect(headings).toContain("## Helper Functions");
    expect(headings).toContain("## Usage");
    expect(headings.length).toBeGreaterThan(1);
  });

  test("the ts-defold surface is 9 members and its entry points take an options table", () => {
    const tsDefold = readFileSync(
      join(PACKAGE_ROOT, targetFor("bzAnim.bzLibrary").fixture),
      "utf8",
    );
    expect(tsDefoldMembers(tsDefold)).toEqual(TS_DEFOLD_MEMBERS);
    // The shape a flat signature table is structurally unable to express, which
    // is why this is a stronger no-go than the dialect gap alone.
    for (const shape of ["AnimateArgs", "AnimateSequenceArgs", "type Path", "type Segment"]) {
      expect(tsDefold).toContain(shape);
    }
    expect(tsDefold).toContain("function animate(args: AnimateArgs): string;");
  });

  test("the generous reading lifts the 7 README-named functions and is still no-go", async () => {
    const {
      doc,
      decision,
      missingMembers,
      addedMembers,
      downgradedMembers,
      signatureLossMembers,
      optionalityLossMembers,
    } = await comparisonForMarkdown(generous(), "bzAnim.bzLibrary");
    expect(doc.elements.map((e) => e.name.split(".").pop())).toEqual([
      ...SHARED_FUNCTIONS,
      "setMaxPts",
    ]);
    // Every constant is invisible to a flat signature parse, and `setMaxPts` is
    // the README's own name for what upstream calls `setMaxPoints`.
    expect(missingMembers).toEqual(["DEBUG_LEVEL", "INFO_LEVEL", "TRACE_LEVEL"]);
    expect(addedMembers).toEqual(["setMaxPts"]);
    // Not a precision loss and not a lost optional — the document carries no
    // parameter bullets at all, so every shared function collapses whole.
    expect(signatureLossMembers).toEqual(SHARED_FUNCTIONS);
    expect(downgradedMembers).toEqual([]);
    expect(optionalityLossMembers).toEqual([]);
    expect(decision).toBe("no-go");
  });

  test("every generously hoisted function emits a zero-arity void stub", async () => {
    const { emitted } = await comparisonForMarkdown(generous(), "bzAnim.bzLibrary");
    for (const fn of SHARED_FUNCTIONS) {
      expect(emitted).toContain(`function ${fn}(): void;`);
    }
  });

  test("the README names a function upstream does not export", () => {
    // `bzAnim/bzLibrary.lua` defines `bz.setMaxPoints`, so the document is not a
    // faithful surface even on its own terms.
    expect(readme()).toContain("bz.setMaxPts");
    expect(readme()).not.toContain("bz.setMaxPoints");
  });

  test("the recorded reason is no-signature-section", () => {
    expect(decisionFor(BZANIM, "bzLibrary").reason).toBe("no-signature-section");
  });
});
